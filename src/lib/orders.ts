import { z } from "zod";
import { readSpreadsheet } from "./imports";
import { db } from "./db";
import { orderTransitions } from "./order-status";
import { documentHash, HttpError } from "./security";
import { orderSchema } from "./validation";

export async function importOrders(
  bytes: Buffer,
  filename: string,
  actorId: string,
) {
  const rows = await readSpreadsheet(
    bytes,
    filename,
    Object.keys(orderSchema.shape),
  );
  const errors: { line: number; messages: string[] }[] = [];
  const customers = new Map<
    string,
    { documentHash: string; name: string; city: string; state: string }
  >();
  const orders: { number: string; hash: string }[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const parsed = orderSchema.safeParse(row.data);
    if (!parsed.success)
      row.errors.push(
        ...parsed.error.issues.map(
          (issue) => issue.path.join(".") + ": " + issue.message,
        ),
      );
    if (row.errors.length || !parsed.success) {
      errors.push({ line: row.line, messages: row.errors });
      continue;
    }
    const data = parsed.data;
    const hash = documentHash(data.cpf_cnpj_destinatario);
    const key = JSON.stringify([data.numero_pedido, hash]);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!customers.has(hash))
      customers.set(hash, {
        documentHash: hash,
        name: data.nome_cliente,
        city: data.cidade_destino,
        state: data.uf_destino,
      });
    orders.push({ number: data.numero_pedido, hash });
  }
  if (errors.length) return { errors, created: 0, skipped: 0 };

  return db.$transaction(
    async (tx) => {
      await tx.customer.createMany({
        data: [...customers.values()].sort((a, b) =>
          a.documentHash.localeCompare(b.documentHash),
        ),
        skipDuplicates: true,
      });
      const recipients = await tx.customer.findMany({
        where: { documentHash: { in: [...customers.keys()] } },
        select: { id: true, documentHash: true },
      });
      const recipientsByHash = new Map(
        recipients.map(({ documentHash, id }) => [documentHash, id]),
      );
      orders.sort(
        (a, b) =>
          a.hash.localeCompare(b.hash) || a.number.localeCompare(b.number),
      );
      const created = await tx.order.createManyAndReturn({
        data: orders.map(({ number, hash }) => {
          const customerId = recipientsByHash.get(hash);
          if (!customerId)
            throw new Error("Destinatário da importação não encontrado");
          return { number, customerId, stage: "RECEIVED" };
        }),
        skipDuplicates: true,
        select: { id: true },
      });
      if (created.length)
        await tx.auditLog.createMany({
          data: created.map(({ id }) => ({
            actorId,
            action: "ORDER_CREATE",
            entityId: id,
          })),
        });
      return {
        errors,
        created: created.length,
        skipped: rows.length - created.length,
      };
    },
    { timeout: 30_000 },
  );
}

const stageUpdate = z.object({
  id: z.string().min(1).max(120),
  from: z
    .enum(["RECEIVED", "PREPARING", "READY_TO_INVOICE", "CANCELLED"])
    .nullable(),
  stage: z.enum(["RECEIVED", "PREPARING", "READY_TO_INVOICE", "CANCELLED"]),
});

export async function updateOrderStage(raw: unknown, actorId: string) {
  const { id, from, stage } = stageUpdate.parse(raw);
  const allowed = from
    ? orderTransitions[from].some((next) => next === stage)
    : stage === "RECEIVED";
  if (!allowed) throw new HttpError(400, "Etapa inválida para este pedido.");
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
    const result = await tx.order.updateMany({
      where: { id, stage: from, shipments: { none: {} } },
      data: { stage },
    });
    if (!result.count)
      throw new HttpError(409, "O pedido foi atualizado. Recarregue a página.");
    await tx.auditLog.create({
      data: {
        actorId,
        action: "ORDER_STAGE_UPDATE",
        entityId: id,
        snapshot: { from, stage },
      },
    });
  });
}
