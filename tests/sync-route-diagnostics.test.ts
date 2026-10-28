import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  audit: vi.fn(),
  run: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("../src/lib/db", () => ({ db: { auditLog: { create: mock.audit } } }));
vi.mock("../src/lib/auth", () => ({ requireAdmin: mock.auth }));
vi.mock("../src/lib/sync", () => ({ syncShipment: mock.run }));
vi.mock("@prisma/client", async () => ({
  Prisma: await import("@prisma/client/runtime/library"),
}));
import { POST } from "../src/app/api/admin/shipments/[id]/sync/route";
import { HttpError } from "../src/lib/security";
const request = () =>
  new Request("http://localhost:3000/api/admin/shipments/test/sync", {
    method: "POST",
    headers: { origin: "http://localhost:3000" },
  });
const context = { params: Promise.resolve({ id: "test" }) };
beforeEach(() => {
  vi.resetAllMocks();
  mock.auth.mockResolvedValue({ id: "actor" });
  mock.audit.mockResolvedValue({ id: "log" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
it("returns a reference and persists safe diagnostics when sync throws outside carrier handling", async () => {
  mock.run.mockRejectedValue(
    Object.assign(new Error("PRIVATE SQL AND CREDENTIALS"), { code: "P2022" }),
  );
  const response = await POST(request(), context);
  const body = await response.json();
  expect(response.status).toBe(500);
  expect(body.code).toBe("P2022");
  expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(mock.audit).toHaveBeenLastCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        action: "SYNC_DIAGNOSTIC",
        entityId: "test",
        snapshot: expect.objectContaining({
          requestId: body.requestId,
          phase: "sync",
        }),
      }),
    }),
  );
  expect(JSON.stringify(body)).not.toContain("PRIVATE");
});
it("keeps the original carrier failure and safe response diagnostic in the HTTP result", async () => {
  mock.run.mockResolvedValue({
    ok: false,
    code: "INVALID_ALFA_RESPONSE",
    responseDiagnostics: { carrier: "ALFA", format: "json", issues: [] },
  });
  const response = await POST(request(), context);
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({
    code: "INVALID_ALFA_RESPONSE",
    responseDiagnostics: { carrier: "ALFA" },
  });
});
it("does not expose or persist shipment diagnostics before authentication succeeds", async () => {
  mock.auth.mockRejectedValue(new HttpError(401, "Autenticação necessária"));
  const response = await POST(request(), context);
  expect(response.status).toBe(401);
  expect(mock.audit).not.toHaveBeenCalled();
  expect(mock.run).not.toHaveBeenCalled();
});
it("still returns a useful reference if the database cannot write either audit record", async () => {
  mock.audit.mockRejectedValue(
    Object.assign(new Error("PRIVATE"), { code: "P1001" }),
  );
  const response = await POST(request(), context);
  const body = await response.json();
  expect(response.status).toBe(500);
  expect(body.code).toBe("P1001");
  expect(console.error).toHaveBeenCalledWith(
    "SHIPMENT_SYNC_DIAGNOSTIC_NOT_PERSISTED",
    body.requestId,
  );
  expect(mock.run).not.toHaveBeenCalled();
});

it("returns a safe function-log reference for unexpected authentication database failures", async () => {
  mock.auth.mockRejectedValue(
    Object.assign(new Error("PRIVATE CONNECTION"), { code: "P1001" }),
  );
  const response = await POST(request(), context);
  const body = await response.json();
  expect(response.status).toBe(500);
  expect(body.code).toBe("P1001");
  expect(mock.audit).not.toHaveBeenCalled();
  expect(mock.run).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalledWith(
    "SHIPMENT_SYNC_DIAGNOSTIC",
    expect.stringContaining(body.requestId),
  );
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    "PRIVATE",
  );
});
