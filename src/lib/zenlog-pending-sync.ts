import { randomUUID } from "node:crypto";
import { db } from "./db";
import { HttpError } from "./security";
import { importZenlogPage } from "./zenlog-import";
import { zenlogPageSize } from "./zenlog";

const jobId = "zenlog-pending-sync";
const actorId = "scheduler:zenlog";

export async function syncZenlogPendingPage() {
  const token = randomUUID();
  const start = Date.now();
  const lease = {
    token,
    until: new Date(start + 90_000).toISOString(),
    nextAt: new Date(start + 60_000).toISOString(),
  };
  const [run] = await db.$queryRaw<{ offset: number }[]>`
    INSERT INTO "AuditLog" (id, "actorId", "entityId", action, snapshot)
    VALUES (${jobId}, ${actorId}, ${jobId}, 'ZENLOG_PENDING_SYNC', ${JSON.stringify({ offset: 0, ...lease })}::jsonb)
    ON CONFLICT (id) DO UPDATE
      SET snapshot = "AuditLog".snapshot || ${JSON.stringify(lease)}::jsonb
      WHERE COALESCE(("AuditLog".snapshot->>'until')::timestamptz, '-infinity') <= NOW()
        AND COALESCE(("AuditLog".snapshot->>'nextAt')::timestamptz, '-infinity') <= NOW()
    RETURNING (snapshot->>'offset')::integer AS offset
  `;
  if (!run) return { status: "waiting" } as const;

  let offset = run.offset;
  try {
    const result = await importZenlogPage(offset, "", actorId, {
      pendingOnly: true,
    });
    const next = offset + zenlogPageSize;
    offset = next < result.totalCount ? next : 0;
    return { ...result, status: "processed", nextOffset: offset } as const;
  } finally {
    const released = await db.auditLog.updateMany({
      where: { id: jobId, snapshot: { path: ["token"], equals: token } },
      data: { snapshot: { offset, nextAt: lease.nextAt } },
    });
    if (!released.count)
      throw new HttpError(409, "A sincronização perdeu o bloqueio.");
  }
}
