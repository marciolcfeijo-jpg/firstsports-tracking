import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  auth: vi.fn(),
  start: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("../src/lib/auth", () => ({ requireAdmin: mock.auth }));
vi.mock("../src/lib/db", () => ({ db: {} }));
vi.mock("@prisma/client", async () => ({
  Prisma: await import("@prisma/client/runtime/library"),
}));
vi.mock("../src/lib/security", async (original) => ({
  ...(await original<typeof import("../src/lib/security")>()),
  rateLimit: mock.limit,
}));
vi.mock("../src/lib/bulk-sync", () => ({
  startBulkSync: mock.start,
  bulkSummary: vi.fn(),
  processBulkSync: vi.fn(),
  pauseBulkSync: vi.fn(),
  retryBlockedCarriers: vi.fn(),
}));
import { POST } from "../src/app/api/admin/shipments/sync-pending/route";
import { HttpError } from "../src/lib/security";
function request(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/admin/shipments/sync-pending", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.auth.mockResolvedValue({ id: "operator" });
  mock.start.mockResolvedValue({ runId: "run", selectedCount: 2 });
});
it("sends the selected IDs through the existing authorized, rate-limited bulk start", async () => {
  const response = await POST(
    request({ action: "start", shipmentIds: ["one", "two"] }),
  );
  expect(response.status).toBe(200);
  expect(mock.auth).toHaveBeenCalledWith(["ADMIN", "OPERATOR"]);
  expect(mock.limit).toHaveBeenCalledWith("bulk-sync:start:operator", 3, 60);
  expect(mock.start).toHaveBeenCalledWith("operator", ["one", "two"]);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
it.each(
  [
    [],
    [""],
    ["x".repeat(129)],
    Array.from({ length: 51 }, (_, i) => String(i)),
  ].map((shipmentIds) => ({ shipmentIds })),
)(
  "rejects an invalid selection %# without starting the global queue",
  async ({ shipmentIds }) => {
    expect((await POST(request({ action: "start", shipmentIds }))).status).toBe(
      400,
    );
    expect(mock.start).not.toHaveBeenCalled();
  },
);
it("preserves global start when selection is omitted", async () => {
  expect((await POST(request({ action: "start" }))).status).toBe(200);
  expect(mock.start).toHaveBeenCalledWith("operator", undefined);
});
it.each([401, 403])("denies unauthorized selection (%s)", async (status) => {
  mock.auth.mockRejectedValue(new HttpError(status, "Acesso não autorizado"));
  expect(
    (await POST(request({ action: "start", shipmentIds: ["one"] }))).status,
  ).toBe(status);
  expect(mock.start).not.toHaveBeenCalled();
});
it("keeps origin and rate-limit protections for selected updates", async () => {
  expect(
    (
      await POST(
        request(
          { action: "start", shipmentIds: ["one"] },
          "https://evil.example",
        ),
      )
    ).status,
  ).toBe(403);
  expect(mock.auth).not.toHaveBeenCalled();
  mock.limit.mockRejectedValue(new HttpError(429, "Aguarde"));
  expect(
    (await POST(request({ action: "start", shipmentIds: ["one"] }))).status,
  ).toBe(429);
  expect(mock.start).not.toHaveBeenCalled();
});
