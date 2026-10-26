import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { db } from "../src/lib/db";
import {
  createShipmentTransaction,
  issueLink,
  publicInclude,
  publicShipment,
} from "../src/lib/shipments";
import {
  documentHash,
  hashToken,
  rateLimit,
  checkOrigin,
} from "../src/lib/security";
import { syncShipment } from "../src/lib/sync";
import { shipmentFixture, normalizedFixture } from "./fixtures";
import type { CarrierTrackingAdapter } from "../integrations/carriers/types";
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Tests require a separate _test database");
  await db.$executeRawUnsafe(
    'TRUNCATE "Customer", "Order", "Shipment", "ShipmentInvoice", "TrackingEvent", "Carrier", "TrackingLink", "SyncLog", "RateLimit", "AuditLog", "ImportBatch", "ImportRow" CASCADE',
  );
  await db.carrier.createMany({
    data: [
      { code: "BRASPRESS", name: "Braspress" },
      { code: "ALFA", name: "Alfa Transportes" },
    ],
  });
});
afterAll(async () => {
  await db.$disconnect();
});
describe("PostgreSQL workflow", () => {
  let id: string;
  it("persists manual entries, protects document and canonicalizes invoice identity", async () => {
    const s = await createShipmentTransaction(shipmentFixture, "test-actor");
    id = s.id;
    const record = await db.shipment.findUniqueOrThrow({
      where: { id },
      include: publicInclude,
    });
    expect(record.order.customer.documentHash).toBe(
      documentHash(shipmentFixture.cpf_cnpj_destinatario),
    );
    expect(JSON.stringify(publicShipment(record))).not.toContain(
      shipmentFixture.cpf_cnpj_destinatario,
    );
    expect(record.invoices[0].number).toBe("123");
    expect(record.events[0].dateOnly).toBe(true);
  });
  it("reimport is idempotent and cross-customer conflicts are rejected", async () => {
    expect(
      (await createShipmentTransaction(shipmentFixture, "test-actor"))
        .duplicate,
    ).toBe(true);
    expect(await db.shipment.count()).toBe(1);
    await expect(
      createShipmentTransaction(
        { ...shipmentFixture, numero_pedido: "OTHER" },
        "test-actor",
      ),
    ).rejects.toThrow("outro pedido");
  });
  it("supports multiple invoices and multiple shipments per order", async () => {
    await db.shipmentInvoice.create({
      data: {
        shipmentId: id,
        issuerDocument: shipmentFixture.cnpj_remetente,
        series: "1",
        number: "124",
      },
    });
    await createShipmentTransaction(
      { ...shipmentFixture, numero_nf: "125", transportadora: "ALFA" },
      "test-actor",
    );
    const s = await db.shipment.findUniqueOrThrow({
      where: { id },
      include: { invoices: true, order: { include: { shipments: true } } },
    });
    expect(s.invoices).toHaveLength(2);
    expect(s.order.shipments).toHaveLength(2);
  });
  it("stores only link hashes, supports expiry/revocation", async () => {
    const token = await issueLink(id, "test-actor");
    expect(token).toHaveLength(43);
    const link = await db.trackingLink.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });
    expect(link.tokenHash).not.toBe(token);
    await db.trackingLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date() },
    });
    expect(
      (await db.trackingLink.findUniqueOrThrow({ where: { id: link.id } }))
        .revokedAt,
    ).toBeTruthy();
  });
  it("deduplicates tracking events, preserves known data on errors", async () => {
    const fixtureAdapter: CarrierTrackingAdapter = {
      validateConfiguration: () => ({ valid: true }),
      normalizeEvents: () => normalizedFixture.events,
      healthCheck: async () => ({ ok: true }),
      trackShipment: async () => normalizedFixture,
    };
    expect((await syncShipment(id, fixtureAdapter)).ok).toBe(true);
    await syncShipment(id, fixtureAdapter);
    expect(await db.trackingEvent.count({ where: { shipmentId: id } })).toBe(3);
    expect(
      (await db.shipment.findUniqueOrThrow({ where: { id } })).status,
    ).toBe("IN_TRANSIT");
    const failed = await syncShipment(id);
    expect(failed.ok).toBe(false);
    const s = await db.shipment.findUniqueOrThrow({ where: { id } });
    expect(s.status).toBe("IN_TRANSIT");
    expect(s.lastSyncError).toBe("INTEGRATION_DISABLED");
    expect(s.lastSyncedAt).toBeTruthy();
  });
  it("uses leases to prevent concurrent sync and logs updates", async () => {
    await db.shipment.update({
      where: { id },
      data: { leaseUntil: new Date(Date.now() + 60000) },
    });
    await expect(syncShipment(id)).rejects.toThrow("andamento");
    expect(await db.syncLog.count({ where: { shipmentId: id } })).toBe(3);
  });
  it("rate limits atomically and validates origin", async () => {
    await rateLimit("test", 2, 60);
    await rateLimit("test", 2, 60);
    await expect(rateLimit("test", 2, 60)).rejects.toThrow("Muitas tentativas");
    expect(() =>
      checkOrigin(
        new Request("http://localhost:3000", {
          headers: { origin: "https://evil.com" },
        }),
      ),
    ).toThrow("Origem");
    expect(() =>
      checkOrigin(
        new Request("http://localhost:3000", {
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    ).not.toThrow();
  });
});
