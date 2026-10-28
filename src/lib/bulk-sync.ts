import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { syncShipment } from "./sync";
import { HttpError } from "./security";
const ID = "pending";
const STOP_CARRIER = new Set([
  "AUTH_FAILED",
  "RATE_LIMITED",
  "CREDENTIALS_MISSING",
  "UNSUPPORTED_CARRIER",
  "INTEGRATION_DISABLED",
  "INVALID_CORREIOS_ENVIRONMENT",
  "TIMEOUT",
  "NETWORK_ERROR",
  "UPSTREAM_HTTP_ERROR",
  "INVALID_JSON",
  "INVALID_CARRIER_DATE",
  "EVENT_DATE_MISSING",
  "MISSING_TRACKING_DATA",
  "UPSTREAM_DATABASE_ERROR",
  "INVALID_XML",
  "INVALID_ALFA_XML",
  "RESPONSE_TOO_LARGE",
  "CARRIER_BUSINESS_ERROR",
  "UNKNOWN_CARRIER_ERROR",
  "UNSUPPORTED_RESPONSE_FORMAT",
  "INVALID_BRASPRESS_RESPONSE",
  "INVALID_ALFA_RESPONSE",
  "INVALID_CORREIOS_RESPONSE",
  "INVALID_CORREIOS_TOKEN",
  "INVALID_ICARO_RESPONSE",
  "ICARO_PAGINATION_LOOP",
  "ICARO_HISTORY_LIMIT",
  "SYNC_FAILED",
]);
export type BulkSummary = {
  runId: string;
  status: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  remaining: number;
  eligible: number;
  busy: boolean;
  errors: Record<string, string>;
};
function pendingWhere(
  cutoff: Date,
  blocked: string[] = [],
): Prisma.ShipmentWhereInput {
  return {
    status: { notIn: ["DELIVERED", "RETURNED", "CANCELLED"] },
    nextSyncAt: { lte: cutoff },
    carrier: { enabled: true, code: { notIn: blocked } },
  };
}
export async function bulkSummary(
  expectedRunId?: string,
): Promise<BulkSummary | null> {
  const batch = await db.bulkSync.findUnique({ where: { id: ID } });
  if (!batch) return null;
  if (expectedRunId && batch.runId !== expectedRunId)
    throw new HttpError(
      409,
      "O lote anterior foi encerrado e uma nova atualização já começou. Confira o progresso atual.",
    );
  const [remaining, eligible] = await Promise.all([
    db.shipment.count({ where: pendingWhere(batch.cutoff) }),
    db.shipment.count({
      where: pendingWhere(batch.cutoff, batch.blockedCarriers),
    }),
  ]);
  return {
    runId: batch.runId,
    status: batch.status,
    total: batch.total,
    processed: batch.processed,
    succeeded: batch.succeeded,
    failed: batch.failed,
    remaining,
    eligible,
    busy: !!batch.leaseUntil && batch.leaseUntil > new Date(),
    errors: batch.errors as Record<string, string>,
  };
}
export async function startBulkSync(actorId: string) {
  await db.$transaction(async (tx) => {
    const now = new Date();
    const current = await tx.bulkSync.upsert({
      where: { id: ID },
      create: { id: ID, runId: randomUUID(), cutoff: now },
      update: {},
    });
    if (["ACTIVE", "PAUSED"].includes(current.status)) return;
    const total = await tx.shipment.count({ where: pendingWhere(now) });
    const runId = randomUUID();
    const claim = await tx.bulkSync.updateMany({
      where: { id: ID, runId: current.runId, status: "DONE" },
      data: {
        runId,
        cutoff: now,
        total,
        status: total ? "ACTIVE" : "DONE",
        processed: 0,
        succeeded: 0,
        failed: 0,
        blockedCarriers: [],
        errors: {},
        leaseUntil: null,
        leaseToken: null,
      },
    });
    if (!claim.count)
      throw new HttpError(
        409,
        "Uma atualização em massa já foi iniciada. Aguarde e retome o lote existente.",
      );
    await tx.auditLog.create({
      data: { actorId, action: "BULK_SYNC_START", entityId: runId },
    });
  });
  return bulkSummary();
}
export async function pauseBulkSync(runId: string, actorId: string) {
  const paused = await db.bulkSync.updateMany({
    where: {
      id: ID,
      runId,
      status: { in: ["ACTIVE", "PAUSED"] },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    data: { status: "PAUSED", leaseToken: null, leaseUntil: null },
  });
  if (paused.count)
    await db.auditLog.create({
      data: { actorId, action: "BULK_SYNC_PAUSE", entityId: runId },
    });
  return bulkSummary();
}
export async function processBulkSync(
  runId: string,
  actorId: string,
  run: typeof syncShipment = syncShipment,
  pace: () => Promise<void> = () =>
    new Promise((resolve) => setTimeout(resolve, 1000)),
) {
  const token = randomUUID();
  const claim = await db.bulkSync.updateMany({
    where: {
      id: ID,
      runId,
      status: { in: ["ACTIVE", "PAUSED"] },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    data: {
      status: "ACTIVE",
      leaseToken: token,
      leaseUntil: new Date(Date.now() + 180000),
    },
  });
  if (!claim.count)
    throw new HttpError(
      409,
      "Outro lote está em andamento ou já foi concluído. Aguarde a atualização do progresso.",
    );
  try {
    const batch = await db.bulkSync.findUniqueOrThrow({ where: { id: ID } });
    const blocked = new Set(batch.blockedCarriers);
    const errors = { ...(batch.errors as Record<string, string>) };
    const seen: string[] = [];
    let processed = 0;
    for (let index = 0; index < 3; index++) {
      const now = new Date();
      const shipment = await db.shipment.findFirst({
        where: {
          AND: [
            pendingWhere(batch.cutoff, [...blocked]),
            { id: { notIn: seen } },
            { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
            {
              carrier: {
                OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lt: now } }],
              },
            },
          ],
        },
        select: { id: true, carrier: { select: { code: true } } },
        orderBy: [{ nextSyncAt: "asc" }, { id: "asc" }],
      });
      if (!shipment) break;
      if (index) await pace();
      seen.push(shipment.id);
      let result;
      try {
        result = await run(shipment.id, undefined, undefined, batch.cutoff);
      } catch (error) {
        if (error instanceof HttpError && error.status === 409) continue;
        throw error;
      }
      if (result.skipped) continue;
      processed++;
      if (!result.ok && STOP_CARRIER.has(result.code || "")) {
        blocked.add(shipment.carrier.code);
        errors[shipment.carrier.code] = result.code!;
      }
      await db.bulkSync.updateMany({
        where: { id: ID, runId, leaseToken: token },
        data: {
          processed: { increment: 1 },
          succeeded: { increment: result.ok ? 1 : 0 },
          failed: { increment: result.ok ? 0 : 1 },
          blockedCarriers: [...blocked],
          errors,
        },
      });
    }
    const eligible = await db.shipment.count({
      where: pendingWhere(batch.cutoff, [...blocked]),
    });
    await db.bulkSync.updateMany({
      where: { id: ID, runId, leaseToken: token },
      data: { status: eligible ? (processed ? "ACTIVE" : "PAUSED") : "DONE" },
    });
    await db.auditLog.create({
      data: { actorId, action: "BULK_SYNC_CHUNK", entityId: runId },
    });
  } finally {
    await db.bulkSync.updateMany({
      where: { id: ID, runId, leaseToken: token },
      data: { leaseToken: null, leaseUntil: null },
    });
  }
  return bulkSummary(runId);
}
