import { beforeEach, afterEach, expect, it, vi } from "vitest";
const create = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/db", () => ({ db: { auditLog: { create } } }));
import { recordSyncDiagnostic } from "../src/lib/sync-diagnostics";
import { CarrierError } from "../integrations/carriers/types";
import { syncDiagnosticSchema } from "../src/lib/sync-diagnostic-data";
const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
beforeEach(() => {
  create.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
it("persists safe Alfa validation details and a request reference", async () => {
  const error = new CarrierError("INVALID_ALFA_RESPONSE", false, {
    carrier: "ALFA",
    format: "json",
    issues: [
      {
        field: "dadosCte.numeroNota",
        code: "invalid_union",
        receivedType: "object",
      },
    ],
  });
  const diagnostic = await recordSyncDiagnostic(
    "shipment",
    requestId,
    "carrier_request",
    error,
  );
  expect(diagnostic.response?.issues[0].field).toBe("dadosCte.numeroNota");
  expect(create).toHaveBeenCalledWith({
    data: {
      actorId: "system:sync",
      action: "SYNC_DIAGNOSTIC",
      entityId: "shipment",
      snapshot: diagnostic,
    },
  });
});
it("reports database codes without messages, SQL, stacks or credentials", async () => {
  const error = Object.assign(new Error("PRIVATE CUSTOMER AND TOKEN"), {
    code: "P2022",
    meta: { query: "PRIVATE SQL" },
  });
  const diagnostic = await recordSyncDiagnostic(
    "shipment",
    requestId,
    "save_tracking",
    error,
  );
  expect(diagnostic).toEqual({
    requestId,
    phase: "save_tracking",
    code: "P2022",
  });
  expect(JSON.stringify(create.mock.calls)).not.toContain("PRIVATE");
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    "PRIVATE",
  );
});
it("keeps diagnostics in function logs when database persistence fails", async () => {
  create.mockRejectedValue(new Error("PRIVATE DATABASE URL"));
  await expect(
    recordSyncDiagnostic("shipment", requestId, "sync", new Error("PRIVATE")),
  ).resolves.toMatchObject({ code: "UNEXPECTED_ERROR" });
  expect(console.error).toHaveBeenCalledWith(
    "SHIPMENT_SYNC_DIAGNOSTIC_NOT_PERSISTED",
    requestId,
  );
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    "PRIVATE",
  );
});
it("strips additional fields from stored diagnostics and rejects arbitrary type values", () => {
  const parsed = syncDiagnosticSchema.parse({
    requestId,
    phase: "sync",
    code: "SYNC_FAILED",
    rawResponse: "PRIVATE",
  });
  expect(parsed).not.toHaveProperty("rawResponse");
  expect(
    syncDiagnosticSchema.safeParse({
      ...parsed,
      response: {
        carrier: "ALFA",
        format: "json",
        issues: [
          { field: "dadosCte", code: "invalid_type", receivedType: "PRIVATE" },
        ],
      },
    }).success,
  ).toBe(false);
});
it("discards invalid response diagnostics instead of accidentally logging sensitive values", async () => {
  const error = new CarrierError("INVALID_ALFA_RESPONSE", false);
  error.responseDiagnostics = {
    carrier: "ALFA",
    format: "json",
    issues: [
      {
        field: "private@example.test",
        code: "invalid_type",
        receivedType: "string",
      },
    ],
  };
  const diagnostic = await recordSyncDiagnostic(
    "shipment",
    requestId,
    "carrier_request",
    error,
  );
  expect(diagnostic).not.toHaveProperty("response");
  expect(JSON.stringify(create.mock.calls)).not.toContain(
    "private@example.test",
  );
});
