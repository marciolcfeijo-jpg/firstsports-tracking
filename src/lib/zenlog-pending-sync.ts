import { randomUUID } from "node:crypto";
import { db } from "./db";
import { HttpError } from "./security";
import { importZenlogPage } from "./zenlog-import";
import { zenlogExpeditionReader, zenlogPageSize } from "./zenlog";

const jobId = "zenlog-pending-sync";
const actorId = "scheduler:zenlog";
const saoPauloDay = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export async function syncZenlogPendingPage({ daily = false } = {}) {
  const token = randomUUID();
  const start = Date.now();
  const day = daily ? saoPauloDay.format(start) : null;
  const lease = {
    token,
    until: new Date(start + 330_000).toISOString(),
    nextAt: new Date(start + 60_000).toISOString(),
    ...(day ? { dailyDay: day } : {}),
  };
  const [run] = await db.$queryRaw<
    { offset: number; dailyDay: string | null }[]
  >`
    INSERT INTO "AuditLog" (id, "actorId", "entityId", action, snapshot)
    VALUES (${jobId}, ${actorId}, ${jobId}, 'ZENLOG_PENDING_SYNC', ${JSON.stringify({ offset: 0, ...lease })}::jsonb)
    ON CONFLICT (id) DO UPDATE
      SET snapshot = "AuditLog".snapshot || ${JSON.stringify(lease)}::jsonb
      WHERE COALESCE(("AuditLog".snapshot->>'until')::timestamptz, '-infinity') <= NOW()
        AND COALESCE(("AuditLog".snapshot->>'nextAt')::timestamptz, '-infinity') <= NOW()
        AND (${day}::text IS NULL OR ("AuditLog".snapshot->>'dailyDay') IS DISTINCT FROM ${day}::text)
    RETURNING (snapshot->>'offset')::integer AS offset, snapshot->>'dailyDay' AS "dailyDay"
  `;
  if (!run) return { status: "waiting" } as const;

  let offset = run.offset;
  async function save(release = false) {
    const updated = await db.auditLog.updateMany({
      where: { id: jobId, snapshot: { path: ["token"], equals: token } },
      data: {
        snapshot: release
          ? { offset, nextAt: lease.nextAt, dailyDay: run.dailyDay }
          : { ...lease, offset, dailyDay: run.dailyDay },
      },
    });
    if (!updated.count)
      throw new HttpError(409, "A sincronização perdeu o bloqueio.");
  }

  const totals = {
    pages: 0,
    totalCount: 0,
    created: 0,
    reused: 0,
    alreadyInPortal: 0,
    linked: 0,
    existing: 0,
    pending: 0,
    skipped: 0,
  };
  try {
    const readPage = daily ? await zenlogExpeditionReader() : undefined;
    const limit = daily ? 100 : 1;
    while (totals.pages < limit && Date.now() - start < 250_000) {
      const result = await importZenlogPage(offset, "", actorId, {
        pendingOnly: true,
        ...(readPage ? { readPage } : {}),
      });
      totals.pages++;
      totals.totalCount = result.totalCount;
      totals.created += result.created;
      totals.reused += result.reused;
      totals.alreadyInPortal += result.alreadyInPortal;
      totals.linked += result.linked;
      totals.existing += result.existing;
      totals.pending += result.pending;
      totals.skipped += result.skipped;
      const next = offset + zenlogPageSize;
      offset = next < result.totalCount ? next : 0;
      if (!offset || totals.pages === limit) break;
      await save();
    }
    return { ...totals, status: "processed", nextOffset: offset } as const;
  } finally {
    await save(true);
  }
}
