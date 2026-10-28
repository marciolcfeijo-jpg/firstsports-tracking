import { beforeEach, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({
  shipmentInvoice: { findUnique: vi.fn() },
  carrier: { findUnique: vi.fn() },
  adminUser: { findFirst: vi.fn() },
  customer: { upsert: vi.fn(), update: vi.fn() },
  order: { upsert: vi.fn() },
  shipment: {
    create: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  auditLog: { create: vi.fn() },
  trackingEvent: { deleteMany: vi.fn(), create: vi.fn() },
  trackingLink: { updateMany: vi.fn() },
}));
vi.mock("../src/lib/db", () => ({
  db: {
    ...store,
    $transaction: async (fn: (tx: typeof store) => unknown) => fn(store),
  },
}));
import { createShipment } from "../src/lib/shipments";
import { editShipment } from "../src/lib/edit-shipment";
import { shipmentWhere } from "../src/lib/filters";
import { shipmentFixture } from "./fixtures";

beforeEach(() => {
  vi.resetAllMocks();
  store.shipmentInvoice.findUnique.mockResolvedValue(null);
  store.carrier.findUnique.mockResolvedValue({
    id: "carrier",
    code: "BRASPRESS",
  });
  store.adminUser.findFirst.mockResolvedValue({ id: "seller", active: true });
  store.customer.upsert.mockResolvedValue({ id: "customer" });
  store.order.upsert.mockResolvedValue({ id: "order" });
  store.shipment.create.mockResolvedValue({ id: "shipment" });
  store.shipment.updateMany.mockResolvedValue({ count: 1 });
  store.shipment.findUnique.mockResolvedValue({
    id: "shipment",
    sellerId: "old-seller",
    version: 0,
    leaseUntil: null,
    orderId: "order",
    carrierId: "carrier",
    senderDocument: shipmentFixture.cnpj_remetente,
    issuedAt: new Date("2026-10-24T15:00:00Z"),
    trackingCode: null,
    carrier: { id: "carrier", code: "BRASPRESS" },
    order: {
      number: shipmentFixture.numero_pedido,
      customer: { id: "customer", documentHash: "old-hash" },
    },
    invoices: [{ id: "invoice", series: "1", number: "123" }],
    events: [],
  });
});
it("associates an active existing user when creating a shipment", async () => {
  await createShipment({ ...shipmentFixture, vendedor_id: "seller" }, "actor");
  expect(store.adminUser.findFirst).toHaveBeenCalledWith({
    where: { id: "seller", active: true },
  });
  expect(store.shipment.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ sellerId: "seller" }),
    }),
  );
});
it("keeps new shipments unassigned when no seller is supplied", async () => {
  await createShipment(shipmentFixture, "actor");
  expect(store.adminUser.findFirst).not.toHaveBeenCalled();
  expect(store.shipment.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ sellerId: null }),
    }),
  );
});
it("rejects an inactive or nonexistent user before creating records", async () => {
  store.adminUser.findFirst.mockResolvedValue(null);
  await expect(
    createShipment({ ...shipmentFixture, vendedor_id: "invalid" }, "actor"),
  ).rejects.toThrow("vendedor ativo");
  expect(store.customer.upsert).not.toHaveBeenCalled();
  expect(store.shipment.create).not.toHaveBeenCalled();
});
it("allows changing the seller without resetting tracking or revoking links", async () => {
  const result = await editShipment(
    "shipment",
    { version: 0, sellerId: "seller" },
    "actor",
  );
  expect(result).toMatchObject({ resetTracking: false, linksRevoked: 0 });
  expect(store.shipment.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ sellerId: "seller" }),
    }),
  );
  expect(store.trackingEvent.deleteMany).not.toHaveBeenCalled();
  expect(store.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        snapshot: expect.objectContaining({ sellerId: "old-seller" }),
      }),
    }),
  );
});
it("rejects reassignment to an inactive user", async () => {
  store.adminUser.findFirst.mockResolvedValue(null);
  await expect(
    editShipment("shipment", { version: 0, sellerId: "inactive" }, "actor"),
  ).rejects.toThrow("vendedor ativo");
  expect(store.shipment.update).not.toHaveBeenCalled();
});
it("retains an existing inactive assignment when unchanged", async () => {
  await editShipment(
    "shipment",
    { version: 0, sellerId: "old-seller" },
    "actor",
  );
  expect(store.adminUser.findFirst).not.toHaveBeenCalled();
});
it("can remove a seller and preserves omitted assignments on unrelated edits", async () => {
  await editShipment("shipment", { version: 0, sellerId: null }, "actor");
  expect(store.shipment.update).toHaveBeenLastCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ sellerId: null }),
    }),
  );
  await editShipment("shipment", { version: 0 }, "actor");
  expect(store.shipment.update).toHaveBeenLastCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ sellerId: undefined }),
    }),
  );
});
it("combines the seller filter with carrier, destination and search", () => {
  const where = shipmentWhere(
    new URLSearchParams({
      seller: "seller",
      carrier: "ICARO",
      state: "MG",
      q: "123",
    }),
  );
  expect(where).toMatchObject({
    sellerId: "seller",
    carrier: { code: "ICARO" },
    destinationState: "MG",
  });
  expect(where.OR).toHaveLength(3);
});
it("filters unassigned shipments and leaves all sellers selected by default", () => {
  expect(shipmentWhere(new URLSearchParams("seller=none"))).toMatchObject({
    sellerId: null,
  });
  expect(shipmentWhere(new URLSearchParams())).not.toHaveProperty("sellerId");
});

it.each([undefined, ""])(
  "defaults missing payer %s to the sender during creation",
  async (payer) => {
    await createShipment({ ...shipmentFixture, cnpj_tomador: payer }, "actor");
    expect(store.shipment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payerDocument: shipmentFixture.cnpj_remetente,
        }),
      }),
    );
  },
);
it("preserves an explicitly supplied payer different from the sender", async () => {
  await createShipment(
    { ...shipmentFixture, cnpj_tomador: "04252011000110" },
    "actor",
  );
  expect(store.shipment.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ payerDocument: "04252011000110" }),
    }),
  );
});
it("fills an omitted payer during editing without erasing tracking", async () => {
  const result = await editShipment("shipment", { version: 0 }, "actor");
  expect(store.shipment.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        payerDocument: shipmentFixture.cnpj_remetente,
      }),
    }),
  );
  expect(result.resetTracking).toBe(false);
});
it("uses the sender when the payer field is submitted empty", async () => {
  const result = await editShipment(
    "shipment",
    { version: 0, payerDocument: "" },
    "actor",
  );
  expect(store.shipment.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        payerDocument: shipmentFixture.cnpj_remetente,
      }),
    }),
  );
  expect(result.resetTracking).toBe(false);
});
