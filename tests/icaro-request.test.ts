import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ resetAt: null as Date | null }));
vi.mock("../src/lib/db", () => ({
  db: {
    rateLimit: {
      findUnique: vi.fn(async () =>
        state.resetAt ? { resetAt: state.resetAt } : null,
      ),
      upsert: vi.fn(
        async ({
          create,
          update,
        }: {
          create: { resetAt: Date };
          update: { resetAt: Date };
        }) => {
          state.resetAt = state.resetAt ? update.resetAt : create.resetAt;
        },
      ),
      update: vi.fn(async ({ data }: { data: { resetAt: Date } }) => {
        state.resetAt = data.resetAt;
      }),
    },
  },
}));
import { icaroRequest } from "../src/lib/icaro-request";
beforeEach(() => {
  state.resetAt = null;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());
it("keeps two seconds between completed requests across callers sharing persisted state", async () => {
  const calls: number[] = [];
  await icaroRequest(async () => {
    calls.push(Date.now());
  });
  const next = icaroRequest(async () => {
    calls.push(Date.now());
  });
  await vi.advanceTimersByTimeAsync(1999);
  expect(calls).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  await next;
  expect(calls[1] - calls[0]).toBe(2000);
});
it("preserves the cooldown after upstream errors", async () => {
  const start = Date.now();
  await expect(
    icaroRequest(async () => {
      throw new Error("upstream");
    }),
  ).rejects.toThrow("upstream");
  const request = vi.fn(async () => {});
  const next = icaroRequest(request);
  await vi.advanceTimersByTimeAsync(1999);
  expect(request).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await next;
  expect(Date.now() - start).toBe(2000);
});
it("honors a reservation left by a terminated process before sending", async () => {
  state.resetAt = new Date(Date.now() + 17000);
  const request = vi.fn(async () => {});
  const next = icaroRequest(request);
  await vi.advanceTimersByTimeAsync(16999);
  expect(request).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await next;
  expect(request).toHaveBeenCalledOnce();
});
it("reserves the HTTP timeout plus cooldown while the request is in flight", async () => {
  const now = Date.now();
  await icaroRequest(async () => {
    expect(state.resetAt?.getTime()).toBe(now + 17000);
  });
  expect(state.resetAt?.getTime()).toBe(now + 2000);
});
