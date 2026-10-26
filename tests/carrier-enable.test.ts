import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { db } from "../src/lib/db";
import { setCarrierEnabled } from "../src/lib/carriers";
import { createShipmentTransaction } from "../src/lib/shipments";
import { shipmentFixture } from "./fixtures";
beforeAll(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "Customer", "Order", "Shipment", "ShipmentInvoice", "TrackingEvent", "Carrier", "TrackingLink", "SyncLog", "RateLimit", "AuditLog", "ImportBatch", "ImportRow" CASCADE',
  );
  await db.carrier.create({ data: { code: "BRASPRESS", name: "Braspress" } });
});
afterAll(async () => {
  await db.$disconnect();
});
describe("enabling a carrier resumes only shipments blocked by disabled integration", () => {
  it("requeues open disabled failures while preserving history and other retry windows", async () => {
    const ids = [];
    for (let i = 0; i < 3; i++)
      ids.push(
        (
          await createShipmentTransaction(
            { ...shipmentFixture, numero_nf: String(800 + i) },
            "fixture",
          )
        ).id,
      );
    const future = new Date(Date.now() + 86400000);
    for (const [index, id] of ids.entries())
      await db.shipment.update({
        where: { id },
        data: {
          lastSyncError: index === 2 ? "AUTH_FAILED" : "INTEGRATION_DISABLED",
          nextSyncAt: future,
          status: index === 1 ? "DELIVERED" : "INVOICED",
        },
      });
    const carrier = await db.carrier.findUniqueOrThrow({
      where: { code: "BRASPRESS" },
    });
    await setCarrierEnabled(carrier.id, true, "fixture");
    const open = await db.shipment.findUniqueOrThrow({ where: { id: ids[0] } });
    expect(open.nextSyncAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(open.lastSyncError).toBe("INTEGRATION_DISABLED");
    for (const id of ids.slice(1))
      expect(
        (await db.shipment.findUniqueOrThrow({ where: { id } })).nextSyncAt,
      ).toEqual(future);
    expect(
      (await db.carrier.findUniqueOrThrow({ where: { id: carrier.id } }))
        .enabled,
    ).toBe(true);
    expect(
      await db.auditLog.count({
        where: { entityId: carrier.id, action: "CARRIER_UPDATE" },
      }),
    ).toBe(1);
  });
});
