import { beforeEach, afterAll, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { createShipmentTransaction } from "../src/lib/shipments";
import {
  startBulkSync,
  processBulkSync,
  pauseBulkSync,
} from "../src/lib/bulk-sync";
import { syncShipment } from "../src/lib/sync";
import { normalizedFixture, shipmentFixture } from "./fixtures";
beforeEach(async () => {
  await db.bulkSync.deleteMany();
  await db.$executeRawUnsafe(
    'TRUNCATE "Customer", "Order", "Shipment", "ShipmentInvoice", "TrackingEvent", "Carrier", "TrackingLink", "SyncLog", "RateLimit", "AuditLog", "ImportBatch", "ImportRow" CASCADE',
  );
  await db.carrier.createMany({
    data: [
      { code: "BRASPRESS", name: "Braspress", enabled: true },
      { code: "ALFA", name: "Alfa Transportes", enabled: true },
    ],
  });
});
afterAll(() => db.$disconnect());
const noDelay = async () => {};
async function create(index: number, carrier = "BRASPRESS") {
  const s = await createShipmentTransaction(
    { ...shipmentFixture, numero_nf: String(index), transportadora: carrier },
    "test",
  );
  await db.shipment.update({
    where: { id: s.id },
    data: { nextSyncAt: new Date(index * 1000) },
  });
  return s.id;
}
const success = async (id: string) => {
  await db.shipment.update({
    where: { id },
    data: {
      lastSyncedAt: new Date(),
      nextSyncAt: new Date(Date.now() + 7200000),
    },
  });
  return { ok: true };
};
it("processes at most three sequentially and resumes the same pending run", async () => {
  for (let i = 1; i <= 5; i++) await create(i);
  const start = (await startBulkSync("test"))!;
  let concurrent = 0;
  const run = vi.fn(async (id: string) => {
    concurrent++;
    expect(concurrent).toBe(1);
    const result = await success(id);
    concurrent--;
    return result;
  });
  const first = (await processBulkSync(start.runId, "test", run, noDelay))!;
  expect(first).toMatchObject({
    total: 5,
    processed: 3,
    succeeded: 3,
    remaining: 2,
    status: "ACTIVE",
    busy: false,
  });
  expect((await pauseBulkSync(start.runId, "test"))?.status).toBe("PAUSED");
  const resume = (await startBulkSync("another-operator"))!;
  expect(resume.runId).toBe(start.runId);
  const last = (await processBulkSync(start.runId, "test", run, noDelay))!;
  expect(last).toMatchObject({
    processed: 5,
    succeeded: 5,
    remaining: 0,
    status: "DONE",
  });
  expect(run).toHaveBeenCalledTimes(5);
});
it("excludes completed, disabled and future checks and pauses for a leased shipment", async () => {
  const open = await create(1),
    delivered = await create(2),
    returned = await create(3),
    cancelled = await create(4),
    future = await create(5),
    disabled = await create(6, "ALFA"),
    leased = await create(7);
  await db.shipment.update({
    where: { id: delivered },
    data: { status: "DELIVERED" },
  });
  await db.shipment.update({
    where: { id: returned },
    data: { status: "RETURNED" },
  });
  await db.shipment.update({
    where: { id: cancelled },
    data: { status: "CANCELLED" },
  });
  await db.shipment.update({
    where: { id: future },
    data: { nextSyncAt: new Date(Date.now() + 3600000) },
  });
  await db.carrier.updateMany({
    where: { code: "ALFA" },
    data: { enabled: false },
  });
  await db.shipment.update({
    where: { id: leased },
    data: { leaseUntil: new Date(Date.now() + 60000) },
  });
  const start = (await startBulkSync("test"))!;
  expect(start.total).toBe(2);
  const run = vi.fn(success);
  await processBulkSync(start.runId, "test", run, noDelay);
  const paused = (await processBulkSync(start.runId, "test", run, noDelay))!;
  expect(paused.status).toBe("PAUSED");
  expect(run).toHaveBeenCalledTimes(1);
  expect(run.mock.calls[0][0]).toBe(open);
  expect(paused.remaining).toBe(1);
  expect(
    (await db.shipment.findUniqueOrThrow({ where: { id: disabled } }))
      .lastSyncedAt,
  ).toBeNull();
});
it.each(["AUTH_FAILED", "RATE_LIMITED"])(
  "stops the affected carrier on %s while allowing another carrier",
  async (code) => {
    for (let i = 1; i <= 4; i++) await create(i, "ALFA");
    await create(5);
    const start = (await startBulkSync("test"))!;
    const called: string[] = [];
    const run = vi.fn(async (id: string) => {
      const shipment = await db.shipment.findUniqueOrThrow({
        where: { id },
        include: { carrier: true },
      });
      called.push(shipment.carrier.code);
      if (shipment.carrier.code === "ALFA") {
        await db.shipment.update({
          where: { id },
          data: { nextSyncAt: new Date(Date.now() + 3600000) },
        });
        return { ok: false, code };
      }
      return success(id);
    });
    const result = (await processBulkSync(start.runId, "test", run, noDelay))!;
    expect(called).toEqual(["ALFA", "BRASPRESS"]);
    expect(result).toMatchObject({
      status: "DONE",
      processed: 2,
      succeeded: 1,
      failed: 1,
      remaining: 3,
      eligible: 0,
    });
    expect(result.errors.ALFA).toBe(code);
  },
);
it("does not allow two bulk requests to overlap", async () => {
  await create(1);
  const start = (await startBulkSync("test"))!;
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const first = processBulkSync(
    start.runId,
    "test",
    async (id) => {
      entered();
      await gate;
      return success(id);
    },
    noDelay,
  );
  await started;
  try {
    await expect(
      processBulkSync(start.runId, "test", success, noDelay),
    ).rejects.toThrow("Outro lote");
  } finally {
    release();
  }
  expect((await first)?.processed).toBe(1);
});
it.each([false, true])(
  "does not penalize a busy carrier in queued or individual checks (%s)",
  async (queued) => {
    const id = await create(1);
    const cutoff = new Date();
    const trackShipment = vi.fn(async () => normalizedFixture);
    const adapter = {
      validateConfiguration: () => ({ valid: true }),
      healthCheck: async () => ({ ok: true }),
      normalizeEvents: () => normalizedFixture.events,
      trackShipment,
    };
    await db.carrier.updateMany({
      data: { syncLeaseUntil: new Date(Date.now() + 60000) },
    });
    expect(
      await syncShipment(id, adapter, undefined, queued ? cutoff : undefined),
    ).toMatchObject({
      skipped: true,
      code: "CARRIER_BUSY",
    });
    expect(
      (await db.shipment.findUniqueOrThrow({ where: { id } })).syncFailures,
    ).toBe(0);
    expect(await db.syncLog.count()).toBe(0);
    expect(trackShipment).not.toHaveBeenCalled();
    await db.shipment.update({
      where: { id },
      data: { nextSyncAt: new Date(Date.now() + 3600000) },
    });
    await expect(syncShipment(id, adapter, undefined, cutoff)).rejects.toThrow(
      "Sincronização",
    );
    expect(trackShipment).not.toHaveBeenCalled();
  },
);
