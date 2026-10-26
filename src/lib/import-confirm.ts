import { db } from "./db";
import { HttpError } from "./security";
import { createShipment } from "./shipments";
import { Prisma } from "@prisma/client";
export async function confirmImport(id: string, actorId: string) {
  const batch = await db.importBatch.findUnique({ where: { id } });
  if (!batch) throw new HttpError(404, "Importação não encontrada");
  if (batch.status === "COMPLETED") return { ok: true, completed: true };
  const claim = await db.importBatch.updateMany({
    where: {
      id,
      OR: [
        { status: "PREVIEW" },
        {
          status: "PROCESSING",
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
      ],
    },
    data: {
      status: "PROCESSING",
      leaseUntil: new Date(Date.now() + 5 * 60000),
    },
  });
  if (!claim.count)
    throw new HttpError(
      409,
      "Lote em processamento. Aguarde antes de retomar.",
    );
  const rows = await db.importRow.findMany({
    where: { batchId: id, result: "PENDING" },
    orderBy: { line: "asc" },
    take: 100,
  });
  for (const row of rows) {
    if (Array.isArray(row.errors) && row.errors.length) {
      await db.importRow.update({
        where: { id: row.id },
        data: { result: "INVALID" },
      });
      continue;
    }
    try {
      await db.$transaction(async (tx) => {
        const result = await createShipment(row.data, actorId, tx);
        const data = row.data as Record<string, Prisma.JsonValue>;
        await tx.importRow.update({
          where: { id: row.id },
          data: {
            result: result.duplicate ? "DUPLICATE" : "IMPORTED",
            shipmentId: result.id,
            data: {
              numero_pedido: data.numero_pedido,
              numero_nf: data.numero_nf,
              serie_nf: data.serie_nf,
              redacted: true,
            },
          },
        });
      });
    } catch {
      await db.importRow.update({
        where: { id: row.id },
        data: {
          result: "ERROR",
          errors: [
            "Não foi possível salvar a linha; confira os dados e reimporte.",
          ],
        },
      });
    }
  }
  const pending = await db.importRow.count({
    where: { batchId: id, result: "PENDING" },
  });
  const completed = pending === 0;
  await db.importBatch.update({
    where: { id },
    data: {
      status: completed ? "COMPLETED" : "PROCESSING",
      leaseUntil: null,
      completedAt: completed ? new Date() : null,
    },
  });
  await db.auditLog.create({
    data: {
      actorId,
      action: completed ? "IMPORT_CONFIRM" : "IMPORT_CHUNK",
      entityId: id,
    },
  });
  return { ok: true, completed, pending };
}
