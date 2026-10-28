import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  batch: {
    id: "pending",
    runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status: "PAUSED",
    cutoff: new Date(),
    total: 3,
    processed: 0,
    succeeded: 0,
    failed: 0,
    blockedCarriers: [] as string[],
    errors: {} as Record<string, string>,
    leaseUntil: null as Date | null,
    leaseToken: null as string | null,
  },
  update: vi.fn(),
  find: vi.fn(),
  count: vi.fn(),
  audit: vi.fn(),
  shipmentUpdate: vi.fn(),
}));
vi.mock("../src/lib/sync", () => ({ syncShipment: vi.fn() }));
vi.mock("../src/lib/db", () => ({
  db: {
    bulkSync: {
      updateMany: mock.update,
      findUnique: async () => ({ ...mock.batch }),
      findUniqueOrThrow: async () => ({ ...mock.batch }),
    },
    shipment: {
      findFirst: mock.find,
      count: mock.count,
      updateMany: mock.shipmentUpdate,
    },
    auditLog: { create: mock.audit },
  },
}));
import { processBulkSync, retryBlockedCarriers } from "../src/lib/bulk-sync";
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(mock.batch, {
    status: "PAUSED",
    cutoff: new Date(),
    total: 3,
    processed: 0,
    succeeded: 0,
    failed: 0,
    blockedCarriers: [],
    errors: {},
    leaseUntil: null,
    leaseToken: null,
  });
  mock.update.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: { runId?: string };
      data: Record<string, unknown>;
    }) => {
      if (where.runId && where.runId !== mock.batch.runId) return { count: 0 };
      const changes = { ...data };
      for (const key of ["processed", "succeeded", "failed"] as const) {
        const change = changes[key];
        if (change && typeof change === "object" && "increment" in change)
          changes[key] = mock.batch[key] + Number(change.increment);
      }
      Object.assign(mock.batch, changes);
      return { count: 1 };
    },
  );
  mock.count.mockImplementation(
    async ({ where }: { where: { carrier: { code: { notIn: string[] } } } }) =>
      where.carrier.code.notIn.length ? 0 : 1,
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("pauses with blocked pending shipments instead of claiming that the entire queue is done", async () => {
  mock.find
    .mockResolvedValueOnce({ id: "old-alfa", carrier: { code: "ALFA" } })
    .mockResolvedValueOnce({
      id: "other-carrier",
      carrier: { code: "BRASPRESS" },
    })
    .mockResolvedValue(null);
  const run = vi.fn(async (id: string) =>
    id === "old-alfa"
      ? { ok: false, code: "INVALID_ALFA_RESPONSE" }
      : { ok: true },
  );
  const summary = await processBulkSync(
    mock.batch.runId,
    "operator",
    run,
    async () => {},
  );
  expect(run.mock.calls.map((call) => call[0])).toEqual([
    "old-alfa",
    "other-carrier",
  ]);
  expect(summary).toMatchObject({
    status: "PAUSED",
    processed: 2,
    succeeded: 1,
    failed: 1,
    remaining: 1,
    eligible: 0,
    busy: false,
    errors: { ALFA: "INVALID_ALFA_RESPONSE" },
  });
});
it("explicitly retries the same run without clearing counters or modifying shipment retry schedules", async () => {
  Object.assign(mock.batch, {
    processed: 90,
    succeeded: 10,
    failed: 80,
    blockedCarriers: ["ALFA"],
    errors: { ALFA: "INVALID_ALFA_RESPONSE" },
  });
  const summary = await retryBlockedCarriers(mock.batch.runId, "operator");
  expect(summary).toMatchObject({
    runId: mock.batch.runId,
    status: "PAUSED",
    processed: 90,
    succeeded: 10,
    failed: 80,
    errors: {},
  });
  expect(mock.batch.blockedCarriers).toEqual([]);
  expect(mock.shipmentUpdate).not.toHaveBeenCalled();
  expect(mock.find).not.toHaveBeenCalled();
  expect(mock.audit).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ action: "BULK_SYNC_RETRY_CARRIERS" }),
    }),
  );
});
it("does not unlock a different or busy run", async () => {
  mock.update.mockResolvedValue({ count: 0 });
  await expect(
    retryBlockedCarriers("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "operator"),
  ).rejects.toThrow("Não foi possível retestar");
  expect(mock.audit).not.toHaveBeenCalled();
  expect(mock.shipmentUpdate).not.toHaveBeenCalled();
});
it("yields before starting another carrier call when a slow request exhausted the chunk budget", async () => {
  vi.useFakeTimers();
  mock.find.mockResolvedValue({ id: "slow", carrier: { code: "ICARO" } });
  const run = vi.fn(async () => {
    vi.setSystemTime(Date.now() + 65000);
    return { ok: true };
  });
  const summary = await processBulkSync(
    mock.batch.runId,
    "operator",
    run,
    async () => {},
  );
  expect(run).toHaveBeenCalledTimes(1);
  expect(summary).toMatchObject({
    status: "ACTIVE",
    processed: 1,
    failed: 0,
    busy: false,
  });
  expect(mock.batch.leaseToken).toBeNull();
});
it("does not count a shipment leased by another process as a failure", async () => {
  mock.find.mockResolvedValue(null);
  const run = vi.fn(async () => ({ ok: true }));
  const summary = await processBulkSync(
    mock.batch.runId,
    "operator",
    run,
    async () => {},
  );
  expect(run).not.toHaveBeenCalled();
  expect(summary).toMatchObject({ status: "PAUSED", processed: 0, failed: 0 });
});
