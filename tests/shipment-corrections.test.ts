import { inputDate } from "../src/lib/status";
import { beforeEach, afterAll, it, expect } from "vitest";
import { db } from "../src/lib/db";
import { createShipmentTransaction, issueLink } from "../src/lib/shipments";
import { editShipment } from "../src/lib/edit-shipment";
import { documentHash } from "../src/lib/security";
import { lookupInvoice } from "../src/lib/tracking-lookup";
import { persistTracking } from "../src/lib/sync";
import { normalizedFixture, shipmentFixture } from "./fixtures";
beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "Customer", "Order", "Shipment", "ShipmentInvoice", "TrackingEvent", "Carrier", "TrackingLink", "SyncLog", "RateLimit", "AuditLog", "ImportBatch", "ImportRow" CASCADE',
  );
  await db.carrier.createMany({
    data: [
      { code: "BRASPRESS", name: "Braspress" },
      { code: "ALFA", name: "Alfa Transportes" },
      { code: "CORREIOS", name: "Correios" },
    ],
  });
});
afterAll(() => db.$disconnect());
it("corrects the recipient without changing sibling shipments, revokes links and moves lookup access", async () => {
  const first = await createShipmentTransaction(shipmentFixture, "test");
  const sibling = await createShipmentTransaction(
    { ...shipmentFixture, numero_nf: "124" },
    "test",
  );
  await issueLink(first.id, "test");
  await persistTracking(db, first.id, normalizedFixture);
  const old = await db.shipment.findUniqueOrThrow({ where: { id: first.id } });
  const correctedDocument = "04252011000110";
  const result = await editShipment(
    first.id,
    {
      version: old.version,
      recipientDocument: correctedDocument,
      name: "Destinatário corrigido",
    },
    "test",
  );
  expect(result).toMatchObject({
    ok: true,
    resetTracking: true,
    linksRevoked: 1,
  });
  const corrected = await db.shipment.findUniqueOrThrow({
    where: { id: first.id },
    include: {
      order: { include: { customer: true } },
      events: true,
      links: true,
    },
  });
  expect(corrected.order.customer.documentHash).toBe(
    documentHash(correctedDocument),
  );
  expect(corrected.order.customer.name).toBe("Destinatário corrigido");
  expect(corrected.status).toBe("INVOICED");
  expect(corrected.lastSyncedAt).toBeNull();
  expect(corrected.events).toHaveLength(1);
  expect(corrected.links[0].revokedAt).not.toBeNull();
  const other = await db.shipment.findUniqueOrThrow({
    where: { id: sibling.id },
    include: { order: { include: { customer: true } } },
  });
  expect(other.order.customer.documentHash).toBe(
    documentHash(shipmentFixture.cpf_cnpj_destinatario),
  );
  expect(other.order.customer.name).toBe(shipmentFixture.nome_cliente);
  await expect(
    lookupInvoice({
      number: "123",
      document: shipmentFixture.cpf_cnpj_destinatario,
    }),
  ).rejects.toThrow("Não foi possível validar");
  expect(
    (await lookupInvoice({ number: "123", document: correctedDocument })).links,
  ).toHaveLength(1);
  const audit = await db.auditLog.findFirstOrThrow({
    where: { entityId: first.id, action: "SHIPMENT_UPDATE" },
  });
  expect(JSON.stringify(audit.snapshot)).toContain(
    "Evento fictício de transporte",
  );
  expect(JSON.stringify(audit.snapshot)).not.toContain(correctedDocument);
});
it("corrects order, sender, invoice and series, issue date and carrier after a successful sync", async () => {
  const first = await createShipmentTransaction(shipmentFixture, "test");
  await persistTracking(db, first.id, normalizedFixture);
  const old = await db.shipment.findUniqueOrThrow({
    where: { id: first.id },
    include: { invoices: true },
  });
  await editShipment(
    first.id,
    {
      version: old.version,
      orderNumber: "CORRECTED-ORDER",
      senderDocument: "04252011000110",
      issuedAt: "2026-10-25",
      invoices: [{ id: old.invoices[0].id, number: "000999", series: "02" }],
      carrierCode: "ALFA",
    },
    "test",
  );
  const corrected = await db.shipment.findUniqueOrThrow({
    where: { id: first.id },
    include: { order: true, invoices: true, carrier: true },
  });
  expect(corrected.order.number).toBe("CORRECTED-ORDER");
  expect(corrected.carrier.code).toBe("ALFA");
  expect(corrected.invoices[0]).toMatchObject({
    number: "999",
    series: "2",
    issuerDocument: "04252011000110",
  });
  expect(corrected.issuedAt.toISOString()).toBe("2026-10-25T15:00:00.000Z");
  expect(corrected.status).toBe("INVOICED");
});
it("rejects an invalid document and fiscal collisions without partial changes", async () => {
  const first = await createShipmentTransaction(shipmentFixture, "test");
  await createShipmentTransaction(
    { ...shipmentFixture, numero_nf: "124" },
    "test",
  );
  await expect(
    editShipment(first.id, { version: 0, recipientDocument: "123" }, "test"),
  ).rejects.toThrow("CPF/CNPJ inválido");
  await expect(
    editShipment(
      first.id,
      {
        version: 0,
        orderNumber: "MUST-ROLL-BACK",
        invoices: [{ number: "124", series: "1" }],
      },
      "test",
    ),
  ).rejects.toThrow("outra remessa");
  const original = await db.shipment.findUniqueOrThrow({
    where: { id: first.id },
    include: { order: true },
  });
  expect(original.version).toBe(0);
  expect(original.order.number).toBe(shipmentFixture.numero_pedido);
  expect(
    await db.auditLog.count({ where: { action: "SHIPMENT_UPDATE" } }),
  ).toBe(0);
});
it("keeps the document and tracking history when only descriptive fields are corrected", async () => {
  const first = await createShipmentTransaction(shipmentFixture, "test");
  await persistTracking(db, first.id, normalizedFixture);
  const old = await db.shipment.findUniqueOrThrow({ where: { id: first.id } });
  await issueLink(first.id, "test");
  const result = await editShipment(
    first.id,
    {
      version: old.version,
      recipientDocument: "",
      city: "Cidade corrigida",
      orderNumber: "ORDER-FIX",
    },
    "test",
  );
  expect(result.resetTracking).toBe(false);
  const corrected = await db.shipment.findUniqueOrThrow({
    where: { id: first.id },
    include: {
      order: { include: { customer: true } },
      events: true,
      links: true,
    },
  });
  expect(corrected.order.customer.documentHash).toBe(
    documentHash(shipmentFixture.cpf_cnpj_destinatario),
  );
  expect(corrected.events).toHaveLength(3);
  expect(corrected.links[0].revokedAt).toBeNull();
});

it("keeps the forecast calendar date in Brasilia when prefilling the edit form", () => {
  expect(inputDate("2026-10-29T02:59:59.000Z")).toBe("2026-10-28");
});

it("does not silently label an existing invoice as a different carrier during reimport", async () => {
  const first = await createShipmentTransaction(shipmentFixture, "test");
  await expect(
    createShipmentTransaction(
      { ...shipmentFixture, transportadora: "ALFA" },
      "test",
    ),
  ).rejects.toThrow("outra transportadora");
  expect(
    (
      await db.shipment.findUniqueOrThrow({
        where: { id: first.id },
        include: { carrier: true },
      })
    ).carrier.code,
  ).toBe("BRASPRESS");
});
