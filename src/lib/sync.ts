import { CorreiosAdapter } from "../../integrations/carriers/correios";
import { db } from "./db";
import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { BraspressAdapter } from "../../integrations/carriers/braspress";
import { AlfaAdapter } from "../../integrations/carriers/alfa";
import {
  CarrierError,
  type CarrierTrackingAdapter,
  type TrackingResult,
  resultSchema,
} from "../../integrations/carriers/types";
import { HttpError } from "./security";
const adapters: Record<string, CarrierTrackingAdapter> = {
  BRASPRESS: new BraspressAdapter(),
  ALFA: new AlfaAdapter(),
  CORREIOS: new CorreiosAdapter(),
};
export const backoff = (failures: number) =>
  Math.min(24 * 3600000, 5 * 60000 * 2 ** Math.min(failures, 12));
export const fingerprint = (event: {
  externalCode?: string;
  occurredAt: string;
  description: string;
  status: string;
}) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        event.externalCode || "",
        new Date(event.occurredAt).toISOString(),
        event.description,
        event.status,
      ]),
    )
    .digest("hex");
export async function persistTracking(
  tx: Prisma.TransactionClient,
  id: string,
  raw: TrackingResult,
) {
  const r = resultSchema.parse(raw);
  await tx.trackingEvent.createMany({
    data: r.events.map((e) => ({
      shipmentId: id,
      fingerprint: fingerprint(e),
      externalCode: e.externalCode,
      occurredAt: new Date(e.occurredAt),
      dateOnly: e.dateOnly ?? false,
      description: e.description,
      location: e.location,
      status: e.status,
    })),
    skipDuplicates: true,
  });
  await tx.shipment.update({
    where: { id },
    data: {
      status: r.currentStatus,
      cte: r.carrier === "CORREIOS" ? undefined : r.trackingNumber || undefined,
      trackingCode: r.carrier === "CORREIOS" ? r.trackingNumber : undefined,
      proofOfDeliveryUrl: r.proofOfDeliveryUrl || undefined,
      estimatedDelivery: r.estimatedDelivery
        ? new Date(r.estimatedDelivery)
        : undefined,
      deliveredAt: r.deliveredAt ? new Date(r.deliveredAt) : undefined,
      lastSyncedAt: new Date(),
      nextSyncAt: new Date(Date.now() + 2 * 3600000),
      syncFailures: 0,
      lastSyncError: null,
      leaseUntil: null,
      version: { increment: 1 },
    },
  });
}
export async function syncShipment(
  id: string,
  adapterOverride?: CarrierTrackingAdapter,
  invoiceNumber?: string,
): Promise<{
  ok: boolean;
  code?: string;
  diagnostics?: TrackingResult["diagnostics"];
}> {
  const claimed = await db.shipment.updateMany({
    where: {
      id,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    data: { leaseUntil: new Date(Date.now() + 120000) },
  });
  if (!claimed.count)
    throw new HttpError(
      409,
      "Sincronização em andamento ou remessa inexistente",
    );
  const started = Date.now();
  const carrierLeaseToken = randomUUID();
  let lockedCarrier: string | undefined;
  try {
    const shipment = await db.shipment.findUniqueOrThrow({
      where: { id },
      include: { carrier: true, invoices: true },
    });
    if (!shipment.carrier.enabled && !adapterOverride)
      throw new CarrierError("INTEGRATION_DISABLED", false);
    const carrierClaim = await db.carrier.updateMany({
      where: {
        id: shipment.carrierId,
        OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lt: new Date() } }],
      },
      data: {
        syncLeaseUntil: new Date(Date.now() + 120000),
        syncLeaseToken: carrierLeaseToken,
      },
    });
    if (!carrierClaim.count) throw new CarrierError("CARRIER_BUSY", true);
    lockedCarrier = shipment.carrierId;
    const adapter = adapterOverride || adapters[shipment.carrier.code];
    if (!adapter) throw new CarrierError("UNSUPPORTED_CARRIER", false);
    const config = adapter.validateConfiguration();
    if (!config.valid)
      throw new CarrierError(config.reason || "CONFIGURATION_ERROR", false);
    const candidates =
      invoiceNumber === undefined
        ? shipment.invoices
        : shipment.invoices.filter((i) => i.number === invoiceNumber);
    if (invoiceNumber !== undefined && candidates.length > 1)
      throw new CarrierError("AMBIGUOUS_INVOICE", false);
    const invoice = candidates[0];
    if (!invoice) throw new CarrierError("INVOICE_MISSING", false);
    const result = await adapter.trackShipment({
      trackingCode: shipment.trackingCode || undefined,
      invoiceNumber: invoice.number,
      invoiceSeries: invoice.series,
      senderDocument: shipment.senderDocument,
      payerDocument: shipment.payerDocument || undefined,
    });
    await db.$transaction(async (tx) => {
      await persistTracking(tx, id, result);
      await tx.syncLog.create({
        data: {
          shipmentId: id,
          success: true,
          durationMs: Date.now() - started,
        },
      });
    });
    return { ok: true, diagnostics: result.diagnostics };
  } catch (e) {
    const code = e instanceof CarrierError ? e.code : "SYNC_FAILED";
    const shipment = await db.shipment.findUniqueOrThrow({ where: { id } });
    await db.$transaction([
      db.shipment.update({
        where: { id },
        data: {
          leaseUntil: null,
          syncFailures: { increment: 1 },
          lastSyncError: code,
          nextSyncAt: new Date(
            Date.now() +
              (e instanceof CarrierError && !e.retryable
                ? 86400000
                : backoff(shipment.syncFailures)),
          ),
        },
      }),
      db.syncLog.create({
        data: {
          shipmentId: id,
          success: false,
          code,
          durationMs: Date.now() - started,
        },
      }),
    ]);
    return { ok: false, code };
  } finally {
    if (lockedCarrier)
      await db.carrier.updateMany({
        where: { id: lockedCarrier, syncLeaseToken: carrierLeaseToken },
        data: { syncLeaseUntil: null, syncLeaseToken: null },
      });
  }
}
export async function syncDue(run: typeof syncShipment = syncShipment) {
  const due = await db.shipment.findMany({
    where: {
      status: { notIn: ["DELIVERED", "RETURNED", "CANCELLED"] },
      nextSyncAt: { lte: new Date() },
      carrier: { enabled: true },
    },
    select: { id: true },
    take: 10,
    orderBy: { nextSyncAt: "asc" },
  });
  const results = [];
  const deadline = Date.now() + 240000;
  for (const s of due) {
    if (Date.now() >= deadline) break;
    try {
      results.push(await run(s.id));
    } catch {
      results.push({ ok: false, code: "BUSY" });
    }
  }
  // Expired pre-validation data contains PII; purge on the scheduled worker.
  await db.importRow.updateMany({
    where: {
      batch: { createdAt: { lt: new Date(Date.now() - 7 * 86400000) } },
    },
    data: { data: { redacted: true } },
  });
  await db.rateLimit.deleteMany({
    where: { resetAt: { lt: new Date(Date.now() - 86400000) } },
  });
  return { processed: results.length, results };
}
