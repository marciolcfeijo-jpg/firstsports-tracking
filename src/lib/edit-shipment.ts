import { z } from "zod";
import { shipmentSchema } from "./validation";
import { db } from "./db";
import { HttpError } from "./security";
export const editSchema = z
  .object({
    version: z.number().int().nonnegative(),
    cte: z.string().max(60).nullable().optional(),
    estimatedDelivery: z.iso.datetime().nullable().optional(),
    name: shipmentSchema.shape.nome_cliente.optional(),
    email: shipmentSchema.shape.email_cliente,
    city: shipmentSchema.shape.cidade_destino.optional(),
    state: shipmentSchema.shape.uf_destino.optional(),
    payerDocument: shipmentSchema.shape.cnpj_tomador,
    carrierCode: shipmentSchema.shape.transportadora.optional(),
  })
  .strict();
export async function editShipment(id: string, raw: unknown, actorId: string) {
  const data = editSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const s = await tx.shipment.findUnique({
      where: { id },
      include: { order: true },
    });
    if (!s) throw new HttpError(404, "Remessa não encontrada");
    if (s.leaseUntil && s.leaseUntil > new Date())
      throw new HttpError(409, "Aguarde a sincronização em andamento");
    const carrier = data.carrierCode
      ? await tx.carrier.findUnique({ where: { code: data.carrierCode } })
      : null;
    if (data.carrierCode && !carrier)
      throw new HttpError(400, "Transportadora não cadastrada");
    if (carrier && carrier.id !== s.carrierId && s.lastSyncedAt)
      throw new HttpError(
        409,
        "Remessa já sincronizada; abra uma remessa separada para outra transportadora.",
      );
    const result = await tx.shipment.updateMany({
      where: {
        id,
        version: data.version,
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: {
        cte: data.cte,
        estimatedDelivery: data.estimatedDelivery
          ? new Date(data.estimatedDelivery)
          : data.estimatedDelivery,
        destinationCity: data.city,
        destinationState: data.state,
        payerDocument: data.payerDocument,
        carrierId: carrier?.id,
        version: { increment: 1 },
      },
    });
    if (!result.count)
      throw new HttpError(
        409,
        "Remessa alterada por outro usuário; recarregue.",
      );
    if (data.name !== undefined || data.email !== undefined)
      await tx.customer.update({
        where: { id: s.order.customerId },
        data: {
          name: data.name,
          email: data.email === undefined ? undefined : data.email || null,
        },
      });
    await tx.auditLog.create({
      data: { actorId, action: "SHIPMENT_UPDATE", entityId: id },
    });
    return { ok: true };
  });
}
