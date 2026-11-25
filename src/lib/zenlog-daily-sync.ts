import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { HttpError } from "./security";
import { importZenlogExpeditions } from "./zenlog-import";
import { zenlogExpeditionReader, zenlogPageSize } from "./zenlog";

const jobId = "zenlog-daily-sync";
const jobAction = "ZENLOG_DAILY_SYNC";
const actorId = "scheduler:zenlog";
const checkpoint = z.object({
  skip: z.number().int().nonnegative(),
  through: z.number().int().nonnegative().nullable(),
  completedDay: z.string().nullable(),
});

const initial = { skip: 0, through: null, completedDay: null };
const br = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export async function syncZenlogDaily({ budgetMs = 260_000 } = {}) {
  const start = Date.now();
  const day = br.format(new Date(start));
  const token = randomUUID();
  const lease = { token, until: new Date(start + 310_000).toISOString() };

  // A resumed scan keeps its offset. The lease also prevents replay after a
  // completed scan on the same Brasília calendar day.
  const [job] = await db.$queryRaw<{ snapshot: unknown }[]>`
    INSERT INTO "AuditLog" (id, "actorId", "entityId", action, snapshot)
    VALUES (${jobId}, ${actorId}, ${jobId}, ${jobAction}, ${JSON.stringify({ ...initial, ...lease })}::jsonb)
    ON CONFLICT (id) DO UPDATE
      SET snapshot = "AuditLog".snapshot || ${JSON.stringify(lease)}::jsonb
      WHERE COALESCE(("AuditLog".snapshot->>'until')::timestamptz, '-infinity') <= NOW()
        AND ("AuditLog".snapshot->>'completedDay') IS DISTINCT FROM ${day}
    RETURNING snapshot
  `;
  if (!job) return { status: "already-running-or-completed" } as const;

  let cursor = checkpoint.parse(job.snapshot);
  async function save(release = false) {
    const updated = await db.auditLog.updateMany({
      where: { id: jobId, snapshot: { path: ["token"], equals: token } },
      data: { snapshot: { ...cursor, ...(release ? {} : lease) } },
    });
    if (!updated.count)
      throw new HttpError(409, "A execução do ZenLOG perdeu o bloqueio.");
  }

  const totals = {
    pages: 0,
    created: 0,
    reused: 0,
    linked: 0,
    existing: 0,
    pending: 0,
    skipped: 0,
  };
  try {
    const readPage = await zenlogExpeditionReader();
    while (Date.now() - start < budgetMs) {
      const page = await readPage(cursor.skip, "", "id asc");
      const through = Math.min(
        cursor.through ?? page.totalCount,
        page.totalCount,
      );
      const result = await importZenlogExpeditions(page.items, "", actorId);
      totals.pages++;
      totals.created += result.created;
      totals.reused += result.reused;
      totals.linked += result.linked;
      totals.existing += result.existing;
      totals.pending += result.pending;
      totals.skipped += result.skipped;
      const skip = cursor.skip + zenlogPageSize;
      if (skip >= through) {
        cursor = { ...initial, completedDay: day };
        await save(true);
        return { status: "complete", ...totals } as const;
      }
      cursor = { ...cursor, skip, through };
      await save();
    }
    await save(true);
    return { status: "partial", nextOffset: cursor.skip, ...totals } as const;
  } catch (error) {
    await save(true);
    throw error;
  }
}
