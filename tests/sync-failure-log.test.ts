import { expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  shipment: vi
    .fn()
    .mockResolvedValue({
      id: "s",
      carrierId: "c",
      syncFailures: 0,
      carrier: { code: "ALFA", enabled: true },
      order: { number: "synthetic" },
      issuedAt: new Date("2026-10-01T15:00:00Z"),
      invoices: [{ number: "123", series: "1" }],
      senderDocument: "synthetic",
    }),
  audit: vi.fn().mockResolvedValue({}),
  log: vi.fn().mockResolvedValue({}),
}));
vi.mock("../src/lib/db", () => ({
  db: {
    shipment: {
      updateMany: mock.updateMany,
      findUniqueOrThrow: mock.shipment,
      update: vi.fn().mockResolvedValue({}),
    },
    carrier: { updateMany: mock.updateMany },
    auditLog: { create: mock.audit },
    syncLog: { create: mock.log },
    $transaction: async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
  },
}));
import { syncShipment } from "../src/lib/sync";
import { CarrierError } from "../integrations/carriers/types";
it("persists the original carrier diagnostic before saving the failed attempt", async () => {
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const responseDiagnostics = {
      carrier: "ALFA" as const,
      format: "json" as const,
      issues: [
        { field: "dadosCte", code: "invalid_type", receivedType: "array" },
      ],
    };
    const result = await syncShipment("s", {
      validateConfiguration: () => ({ valid: true }),
      trackShipment: async () => {
        throw new CarrierError(
          "INVALID_ALFA_RESPONSE",
          false,
          responseDiagnostics,
        );
      },
      normalizeEvents: () => [],
      healthCheck: async () => ({ ok: true }),
    });
    expect(result).toMatchObject({
      ok: false,
      code: "INVALID_ALFA_RESPONSE",
      responseDiagnostics,
    });
    expect(mock.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityId: "s",
          action: "SYNC_DIAGNOSTIC",
          snapshot: expect.objectContaining({
            phase: "carrier_request",
            response: responseDiagnostics,
          }),
        }),
      }),
    );
    expect(mock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          success: false,
          code: "INVALID_ALFA_RESPONSE",
        }),
      }),
    );
  } finally {
    consoleSpy.mockRestore();
  }
});
