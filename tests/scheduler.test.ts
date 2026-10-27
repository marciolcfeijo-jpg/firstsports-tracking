import { afterEach, expect, it, vi } from "vitest";
vi.mock("../src/lib/sync", () => ({
  syncDue: vi.fn().mockResolvedValue({ processed: 0, results: [] }),
}));
import { syncDue } from "../src/lib/sync";
import { GET, POST } from "../src/app/api/internal/sync/route";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("refuses scheduler calls without configuration or authentication", async () => {
  vi.stubEnv("CRON_SECRET", "");
  expect(
    (await GET(new Request("https://example.test/api/internal/sync"))).status,
  ).toBe(503);
  vi.stubEnv("CRON_SECRET", "isolated-scheduler-secret-at-least-32-characters");
  expect(
    (await GET(new Request("https://example.test/api/internal/sync"))).status,
  ).toBe(401);
  expect(syncDue).not.toHaveBeenCalled();
});
it.each([GET, POST])(
  "runs the existing worker for authenticated scheduler calls",
  async (handler) => {
    const secret = "isolated-scheduler-secret-at-least-32-characters";
    vi.stubEnv("CRON_SECRET", secret);
    const response = await handler(
      new Request("https://example.test/api/internal/sync", {
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 0, results: [] });
    expect(syncDue).toHaveBeenCalledOnce();
  },
);
