import { afterAll, afterEach, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { syncZenlogPendingPage } from "../src/lib/zenlog-pending-sync";
import { importZenlogPage } from "../src/lib/zenlog-import";

vi.mock("../src/lib/zenlog-import", () => ({ importZenlogPage: vi.fn() }));

const id = "zenlog-pending-sync";
afterEach(async () => {
  await db.auditLog.deleteMany({ where: { id } });
  vi.resetAllMocks();
});
afterAll(() => db.$disconnect());

it("advances one page per interval and retries a failed page", async () => {
  vi.mocked(importZenlogPage).mockResolvedValue({
    totalCount: 21,
    created: 1,
    reused: 0,
    linked: 0,
    existing: 0,
    skipped: 0,
    pending: 0,
    alreadyInPortal: 0,
    linkedOrderId: undefined,
  });
  expect(await syncZenlogPendingPage()).toMatchObject({
    status: "processed",
    nextOffset: 10,
  });
  expect(await syncZenlogPendingPage()).toEqual({ status: "waiting" });
  expect(importZenlogPage).toHaveBeenCalledTimes(1);
  expect(importZenlogPage).toHaveBeenLastCalledWith(0, "", "scheduler:zenlog", {
    pendingOnly: true,
  });

  const advanceInterval = (offset: number) =>
    db.auditLog.update({
      where: { id },
      data: { snapshot: { offset, nextAt: "2000-01-01T00:00:00Z" } },
    });
  await advanceInterval(10);
  vi.mocked(importZenlogPage).mockRejectedValueOnce(
    new Error("Falha simulada"),
  );
  await expect(syncZenlogPendingPage()).rejects.toThrow("Falha simulada");
  expect(
    (await db.auditLog.findUnique({ where: { id } }))?.snapshot,
  ).toMatchObject({ offset: 10 });
  expect(await syncZenlogPendingPage()).toEqual({ status: "waiting" });
  await advanceInterval(10);
  expect(await syncZenlogPendingPage()).toMatchObject({ nextOffset: 20 });
  await advanceInterval(20);
  expect(await syncZenlogPendingPage()).toMatchObject({ nextOffset: 0 });
});
