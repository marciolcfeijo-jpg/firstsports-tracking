import { beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import { db } from "../src/lib/db";
import { createShipmentTransaction } from "../src/lib/shipments";
import { lookupInvoice } from "../src/lib/tracking-lookup";
import { trackingLookupSchema } from "../src/lib/validation";
import { shipmentFixture, normalizedFixture } from "./fixtures";
import { syncShipment } from "../src/lib/sync";
beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "Customer", "Order", "Shipment", "ShipmentInvoice", "TrackingEvent", "Carrier", "TrackingLink", "SyncLog", "RateLimit", "AuditLog", "ImportBatch", "ImportRow" CASCADE',
  );
  await db.carrier.create({ data: { code: "BRASPRESS", name: "Braspress" } });
});
afterAll(async () => {
  await db.$disconnect();
});
const body = {
  number: "000123",
  document: shipmentFixture.cpf_cnpj_destinatario,
};
describe("NF and recipient lookup before carrier access", () => {
  it("only accepts numeric invoice identifiers", () => {
    expect(
      trackingLookupSchema.safeParse({ ...body, number: "TEST-001" }).success,
    ).toBe(false);
    expect(trackingLookupSchema.safeParse(body).success).toBe(true);
  });
  it("matches the invoice and recipient, returning only safe links and carrier labels", async () => {
    await createShipmentTransaction(shipmentFixture, "test");
    const run = vi.fn(async () => ({ ok: true }));
    const result = await lookupInvoice(body, run);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].carrier).toBe("Braspress");
    expect(result.links[0].invoiceNumber).toBe("123");
    expect(JSON.stringify(result)).not.toContain(body.document);
    expect(run).not.toHaveBeenCalled();
  });
  it("never consults an API or issues a link for another recipient or an order-number match", async () => {
    await createShipmentTransaction(
      { ...shipmentFixture, numero_pedido: "456" },
      "test",
    );
    const run = vi.fn(async () => ({ ok: true }));
    for (const input of [
      { ...body, document: "04252011000110" },
      { ...body, number: "456" },
    ])
      await expect(lookupInvoice(input, run)).rejects.toThrow(
        "Não foi possível validar",
      );
    expect(run).not.toHaveBeenCalled();
    expect(await db.trackingLink.count()).toBe(0);
  });
  it("refreshes the matched shipment, preserving access to its history on API failure", async () => {
    const created = await createShipmentTransaction(shipmentFixture, "test");
    await db.carrier.updateMany({ data: { enabled: true } });
    const run = vi.fn(async () => {
      throw new Error("synthetic upstream outage");
    });
    expect((await lookupInvoice(body, run)).links).toHaveLength(1);
    expect(run).toHaveBeenCalledExactlyOnceWith(created.id, undefined, "123");
  });
  it("respects retry windows, terminal shipments and active sync leases", async () => {
    const created = await createShipmentTransaction(shipmentFixture, "test");
    await db.carrier.updateMany({ data: { enabled: true } });
    const run = vi.fn(async () => ({ ok: true }));
    for (const change of [
      { nextSyncAt: new Date(Date.now() + 60000) },
      { nextSyncAt: new Date(0), status: "DELIVERED" as const },
      {
        status: "EXCEPTION" as const,
        leaseUntil: new Date(Date.now() + 60000),
      },
    ]) {
      await db.shipment.update({ where: { id: created.id }, data: change });
      expect((await lookupInvoice(body, run)).links).toHaveLength(1);
    }
    expect(run).not.toHaveBeenCalled();
  });
  it("synchronizes the requested NF when a shipment has multiple invoices", async () => {
    const created = await createShipmentTransaction(shipmentFixture, "test");
    await db.shipmentInvoice.create({
      data: {
        shipmentId: created.id,
        issuerDocument: shipmentFixture.cnpj_remetente,
        series: "1",
        number: "124",
      },
    });
    const trackShipment = vi.fn(
      async (_input: { invoiceNumber: string; invoiceSeries: string }) => {
        void _input;
        return normalizedFixture;
      },
    );
    const result = await syncShipment(
      created.id,
      {
        validateConfiguration: () => ({ valid: true }),
        healthCheck: async () => ({ ok: true }),
        normalizeEvents: () => normalizedFixture.events,
        trackShipment,
      },
      "124",
    );
    expect(result.ok).toBe(true);
    expect(trackShipment.mock.calls[0][0]).toMatchObject({
      invoiceNumber: "124",
      invoiceSeries: "1",
    });
  });
  it("bounds live refreshes and keeps separate shipments for the same NF across issuers", async () => {
    for (let i = 1; i <= 4; i++)
      await createShipmentTransaction(
        { ...shipmentFixture, serie_nf: String(i) },
        "test",
      );
    await db.carrier.updateMany({ data: { enabled: true } });
    const run = vi.fn(async () => ({ ok: true }));
    expect((await lookupInvoice(body, run)).links).toHaveLength(4);
    expect(run).toHaveBeenCalledTimes(3);
  });
});
