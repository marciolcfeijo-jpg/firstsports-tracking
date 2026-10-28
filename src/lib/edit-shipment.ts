import { z } from "zod";
import { Prisma } from "@prisma/client";
import { shipmentSchema, trackingCodeSchema } from "./validation";
import { db } from "./db";
import { documentHash, HttpError } from "./security";
const invoiceSchema = z.object({
  id: z.string().optional(),
  number: shipmentSchema.shape.numero_nf.transform((v) => String(Number(v))),
  series: shipmentSchema.shape.serie_nf.transform((v) => String(Number(v))),
});
export const editSchema = z
  .object({
    sellerId: z.string().trim().max(100).nullable().optional(),
    version: z.number().int().nonnegative(),
    orderNumber: shipmentSchema.shape.numero_pedido.optional(),
    recipientDocument: z
      .union([shipmentSchema.shape.cpf_cnpj_destinatario, z.literal("")])
      .optional(),
    senderDocument: shipmentSchema.shape.cnpj_remetente.optional(),
    issuedAt: shipmentSchema.shape.data_emissao.optional(),
    invoices: z
      .array(invoiceSchema)
      .min(1, "Mantenha ao menos uma nota fiscal")
      .max(50)
      .optional(),
    trackingCode: trackingCodeSchema.optional(),
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
  const parsed = editSchema.safeParse(raw);
  if (!parsed.success)
    throw new HttpError(
      400,
      parsed.error.issues.map((i) => i.message).join("; "),
    );
  const data = parsed.data;
  return db.$transaction(
    async (tx) => {
      const s = await tx.shipment.findUnique({
        where: { id },
        include: {
          order: { include: { customer: true } },
          carrier: true,
          invoices: true,
          events: true,
        },
      });
      if (!s) throw new HttpError(404, "Remessa não encontrada");
      if (s.version !== data.version)
        throw new HttpError(
          409,
          "Remessa alterada por outro usuário; recarregue.",
        );
      if (s.leaseUntil && s.leaseUntil > new Date())
        throw new HttpError(409, "Aguarde a sincronização em andamento");
      const carrier = data.carrierCode
        ? await tx.carrier.findUnique({ where: { code: data.carrierCode } })
        : s.carrier;
      if (!carrier) throw new HttpError(400, "Transportadora não cadastrada");
      if (
        data.sellerId &&
        data.sellerId !== s.sellerId &&
        !(await tx.adminUser.findFirst({
          where: { id: data.sellerId, active: true },
        }))
      )
        throw new HttpError(400, "Selecione um vendedor ativo cadastrado");
      const trackingCode = data.trackingCode ?? s.trackingCode;
      if (carrier.code === "CORREIOS" && !trackingCode)
        throw new HttpError(
          400,
          "Informe o código de rastreamento dos Correios",
        );
      const senderDocument = data.senderDocument ?? s.senderDocument;
      const invoices = data.invoices ?? s.invoices;
      if (
        invoices.some(
          (i) => i.id && !s.invoices.some((existing) => existing.id === i.id),
        )
      )
        throw new HttpError(400, "Nota fiscal não pertence à remessa");
      const keys = invoices.map((i) => i.series + ":" + i.number);
      if (new Set(keys).size !== keys.length)
        throw new HttpError(400, "Notas fiscais duplicadas na remessa");
      for (const invoice of invoices) {
        const existing = await tx.shipmentInvoice.findUnique({
          where: {
            issuerDocument_series_number: {
              issuerDocument: senderDocument,
              series: invoice.series,
              number: invoice.number,
            },
          },
        });
        if (existing && existing.shipmentId !== id)
          throw new HttpError(
            409,
            "Nota fiscal já vinculada a outra remessa. Confira remetente, série e número.",
          );
      }
      const oldKeys = s.invoices
        .map((i) => i.series + ":" + i.number)
        .sort()
        .join("|");
      const invoiceChanged =
        oldKeys !== [...keys].sort().join("|") ||
        senderDocument !== s.senderDocument;
      const recipientHash = data.recipientDocument
        ? documentHash(data.recipientDocument)
        : s.order.customer.documentHash;
      const recipientChanged = recipientHash !== s.order.customer.documentHash;
      const resetTracking =
        (carrier.code === "ICARO" &&
          data.orderNumber !== undefined &&
          data.orderNumber !== s.order.number) ||
        recipientChanged ||
        invoiceChanged ||
        carrier.id !== s.carrierId ||
        (trackingCode || "") !== (s.trackingCode || "") ||
        (data.payerDocument !== undefined &&
          (data.payerDocument || "") !== (s.payerDocument || ""));
      // Claim this version before changing any shared records. A concurrent sync/editor must roll back.
      const claimed = await tx.shipment.updateMany({
        where: {
          id,
          version: data.version,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        data: { version: { increment: 1 } },
      });
      if (!claimed.count)
        throw new HttpError(
          409,
          "Remessa alterada por outro usuário; recarregue.",
        );
      const customer = recipientChanged
        ? await tx.customer.upsert({
            where: { documentHash: recipientHash },
            update: {},
            create: {
              documentHash: recipientHash,
              name: data.name ?? s.order.customer.name,
              email: data.email || null,
              city: data.city ?? s.destinationCity,
              state: data.state ?? s.destinationState,
            },
          })
        : s.order.customer;
      // Never change the old recipient's profile when moving this shipment to a new document.
      // An existing target profile is retained unless the operator explicitly changed its fields.
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          name:
            data.name !== undefined &&
            (!recipientChanged || data.name !== s.order.customer.name)
              ? data.name
              : undefined,
          email:
            data.email !== undefined &&
            (!recipientChanged ||
              (data.email || null) !== s.order.customer.email)
              ? data.email || null
              : undefined,
        },
      });
      const order = await tx.order.upsert({
        where: {
          number_customerId: {
            number: data.orderNumber ?? s.order.number,
            customerId: customer.id,
          },
        },
        create: {
          number: data.orderNumber ?? s.order.number,
          customerId: customer.id,
        },
        update: {},
      });
      const issuedAt = data.issuedAt
        ? new Date(data.issuedAt + "T15:00:00Z")
        : s.issuedAt;
      // Keep previous normalized records privately; no plaintext recipient document or credentials.
      const snapshot = JSON.parse(
        JSON.stringify({
          version: s.version,
          sellerId: s.sellerId,
          orderNumber: s.order.number,
          customerName: s.order.customer.name,
          customerId: s.order.customerId,
          carrier: s.carrier.name,
          customerEmail: s.order.customer.email,
          destinationCity: s.destinationCity,
          destinationState: s.destinationState,
          senderDocument: s.senderDocument,
          payerDocument: s.payerDocument,
          issuedAt: s.issuedAt,
          invoices: s.invoices,
          status: s.status,
          trackingCode: s.trackingCode,
          cte: s.cte,
          estimatedDelivery: s.estimatedDelivery,
          deliveredAt: s.deliveredAt,
          lastSyncedAt: s.lastSyncedAt,
          proofOfDeliveryUrl: s.proofOfDeliveryUrl,
          events: s.events,
        }),
      ) as Prisma.InputJsonValue;
      await tx.auditLog.create({
        data: { actorId, action: "SHIPMENT_UPDATE", entityId: id, snapshot },
      });
      if (invoiceChanged) {
        await tx.shipmentInvoice.deleteMany({ where: { shipmentId: id } });
        await tx.shipmentInvoice.createMany({
          data: invoices.map((i) => ({
            shipmentId: id,
            issuerDocument: senderDocument,
            series: i.series,
            number: i.number,
          })),
        });
      }
      if (resetTracking)
        await tx.trackingEvent.deleteMany({ where: { shipmentId: id } });
      if (resetTracking)
        await tx.trackingEvent.create({
          data: {
            shipmentId: id,
            fingerprint: "invoiced",
            dateOnly: true,
            occurredAt: issuedAt,
            description:
              "Cadastro corrigido pela First Sports. Aguardando nova consulta à transportadora.",
            status: "INVOICED",
          },
        });
      else if (data.issuedAt)
        await tx.trackingEvent.updateMany({
          where: { shipmentId: id, fingerprint: "invoiced" },
          data: { occurredAt: issuedAt },
        });
      const revoked = resetTracking
        ? await tx.trackingLink.updateMany({
            where: { shipmentId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          })
        : { count: 0 };
      await tx.shipment.update({
        where: { id },
        data: {
          orderId: order.id,
          sellerId:
            data.sellerId === undefined ? undefined : data.sellerId || null,
          senderDocument,
          issuedAt,
          carrierId: carrier.id,
          cte: resetTracking
            ? data.cte !== undefined && data.cte !== s.cte
              ? data.cte
              : null
            : data.cte,
          trackingCode: trackingCode || null,
          estimatedDelivery: resetTracking
            ? null
            : data.estimatedDelivery
              ? new Date(data.estimatedDelivery)
              : data.estimatedDelivery,
          destinationCity: data.city,
          destinationState: data.state,
          payerDocument: data.payerDocument,
          ...(resetTracking
            ? {
                status: "INVOICED",
                deliveredAt: null,
                proofOfDeliveryUrl: null,
                lastSyncedAt: null,
                lastSyncError: null,
                syncFailures: 0,
                nextSyncAt: new Date(),
              }
            : {}),
        },
      });
      return { ok: true, resetTracking, linksRevoked: revoked.count };
    },
    { timeout: 15000 },
  );
}
