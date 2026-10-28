import { db } from "./db";
import { CarrierError } from "../../integrations/carriers/types";
import {
  syncDiagnosticSchema,
  type SyncDiagnostic,
} from "./sync-diagnostic-data";

/** Only fixed codes/schema paths. Never persist messages, stacks, requests or responses. */
export async function recordSyncDiagnostic(
  shipmentId: string | undefined,
  requestId: string,
  phase: SyncDiagnostic["phase"],
  error: unknown,
) {
  const databaseCode =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  const code =
    error instanceof CarrierError && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)
      ? error.code
      : typeof databaseCode === "string" && /^P\d{4}$/.test(databaseCode)
        ? databaseCode
        : "UNEXPECTED_ERROR";
  const parsed = syncDiagnosticSchema.safeParse({
    requestId,
    phase,
    code,
    ...(error instanceof CarrierError && error.responseDiagnostics
      ? { response: error.responseDiagnostics }
      : {}),
  });
  const diagnostic: SyncDiagnostic = parsed.success
    ? parsed.data
    : { requestId, phase, code };
  // Also survives a database outage through Vercel function logs, with no raw error object.
  console.error("SHIPMENT_SYNC_DIAGNOSTIC", JSON.stringify(diagnostic));
  if (!shipmentId) return diagnostic;
  try {
    await db.auditLog.create({
      data: {
        actorId: "system:sync",
        action: "SYNC_DIAGNOSTIC",
        entityId: shipmentId,
        snapshot: diagnostic,
      },
    });
  } catch {
    console.error("SHIPMENT_SYNC_DIAGNOSTIC_NOT_PERSISTED", requestId);
  }
  return diagnostic;
}
