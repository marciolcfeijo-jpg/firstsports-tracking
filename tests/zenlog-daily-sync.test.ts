import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { syncZenlogDaily } from "../src/lib/zenlog-daily-sync";
import { zenlogExpeditionReader } from "../src/lib/zenlog";
import { importZenlogExpeditions } from "../src/lib/zenlog-import";

vi.mock("../src/lib/zenlog", () => ({
  zenlogExpeditionReader: vi.fn(),
  zenlogPageSize: 10,
}));
vi.mock("../src/lib/zenlog-import", () => ({
  importZenlogExpeditions: vi.fn(),
}));

const jobId = "zenlog-daily-sync";
const readPage = vi.fn<Awaited<ReturnType<typeof zenlogExpeditionReader>>>();

beforeEach(async () => {
  await db.auditLog.deleteMany({ where: { id: jobId } });
  vi.resetAllMocks();
  vi.mocked(zenlogExpeditionReader).mockResolvedValue(readPage);
  vi.mocked(importZenlogExpeditions).mockResolvedValue({
    created: 0,
    reused: 1,
    linked: 0,
    existing: 0,
    pending: 0,
    skipped: 0,
  });
});

afterEach(async () => {
  await db.auditLog.deleteMany({ where: { id: jobId } });
});
afterAll(() => db.$disconnect());

it("sweeps ten at a time using one session and ignores a repeat after completion", async () => {
  readPage.mockResolvedValue({ totalCount: 21, items: [] });
  expect(await syncZenlogDaily()).toMatchObject({
    status: "complete",
    pages: 3,
  });
  expect(readPage.mock.calls).toEqual([
    [0, "", "id asc"],
    [10, "", "id asc"],
    [20, "", "id asc"],
  ]);
  expect(await syncZenlogDaily()).toEqual({
    status: "already-running-or-completed",
  });
  expect(zenlogExpeditionReader).toHaveBeenCalledTimes(1);
});

it("keeps the next offset after an upstream failure and resumes at that page", async () => {
  readPage
    .mockResolvedValueOnce({ totalCount: 30, items: [] })
    .mockRejectedValueOnce(new Error("simulated ZenLOG failure"))
    .mockResolvedValue({ totalCount: 30, items: [] });
  await expect(syncZenlogDaily()).rejects.toThrow("simulated ZenLOG failure");
  expect(await syncZenlogDaily()).toMatchObject({
    status: "complete",
    pages: 2,
  });
  expect(readPage.mock.calls.map(([skip]) => skip)).toEqual([0, 10, 10, 20]);
});

it("blocks a second execution while a scan is in flight", async () => {
  let allowFirstPage: () => void = () => {};
  const hold = new Promise<void>((resolve) => {
    allowFirstPage = resolve;
  });
  let notifyStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  readPage.mockImplementation(async () => {
    notifyStarted();
    await hold;
    return { totalCount: 1, items: [] };
  });
  const running = syncZenlogDaily();
  await started;
  try {
    expect(await syncZenlogDaily()).toEqual({
      status: "already-running-or-completed",
    });
  } finally {
    allowFirstPage();
    await running;
  }
});
