import { afterAll, afterEach, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { syncZenlogPendingPage } from "../src/lib/zenlog-pending-sync";
import { zenlogExpeditionReader } from "../src/lib/zenlog";
import { importZenlogPage } from "../src/lib/zenlog-import";

vi.mock("../src/lib/zenlog-import", () => ({ importZenlogPage: vi.fn() }));

vi.mock("../src/lib/zenlog", () => ({
  zenlogExpeditionReader: vi.fn(),
  zenlogPageSize: 10,
}));

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
    issues: [],
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

it("processes at most 100 pages in the daily run and shares one ZenLOG session", async () => {
  const reader = vi.fn();
  vi.mocked(zenlogExpeditionReader).mockResolvedValue(reader);
  vi.mocked(importZenlogPage).mockResolvedValue({
    totalCount: 1200,
    created: 1,
    reused: 0,
    linked: 0,
    existing: 0,
    skipped: 0,
    pending: 0,
    alreadyInPortal: 0,
    linkedOrderId: undefined,
    issues: [],
  });
  expect(await syncZenlogPendingPage({ daily: true })).toMatchObject({
    status: "processed",
    pages: 100,
    created: 100,
    nextOffset: 1000,
  });
  expect(zenlogExpeditionReader).toHaveBeenCalledTimes(1);
  expect(importZenlogPage).toHaveBeenCalledTimes(100);
  expect(importZenlogPage).toHaveBeenLastCalledWith(
    990,
    "",
    "scheduler:zenlog",
    {
      pendingOnly: true,
      readPage: reader,
    },
  );
  const checkpoint = await db.auditLog.findUniqueOrThrow({ where: { id } });
  const state = checkpoint.snapshot as { offset: number; dailyDay: string };
  await db.auditLog.update({
    where: { id },
    data: { snapshot: { ...state, nextAt: "2000-01-01T00:00:00Z" } },
  });
  expect(await syncZenlogPendingPage({ daily: true })).toEqual({
    status: "waiting",
  });
  await db.auditLog.update({
    where: { id },
    data: {
      snapshot: {
        offset: state.offset,
        dailyDay: "2000-01-01",
        nextAt: "2000-01-01T00:00:00Z",
      },
    },
  });
  expect(await syncZenlogPendingPage({ daily: true })).toMatchObject({
    pages: 20,
    nextOffset: 0,
  });
});
