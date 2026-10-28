import { Prisma } from "@prisma/client";
import { db } from "./db";
import { shipmentSchema, type ShipmentInput } from "./validation";
import { documentHash, HttpError, newToken, hashToken } from "./security";
export async function createShipment(
  raw: unknown,
  actorId: string,
  tx: Prisma.TransactionClient = db,
) {
  const data = shipmentSchema.parse(raw);
  if (data.transportadora === "CORREIOS" && !data.codigo_rastreio)
    throw new HttpError(400, "Informe o código de rastreamento dos Correios");
  const issuerDocument = data.cnpj_remetente,
    series = String(Number(data.serie_nf)),
    number = String(Number(data.numero_nf));
  const existing = await tx.shipmentInvoice.findUnique({
    where: { issuerDocument_series_number: { issuerDocument, series, number } },
    include: {
      shipment: {
        include: { order: { include: { customer: true } }, carrier: true },
      },
    },
  });
  if (existing) {
    if (
      existing.shipment.order.number !== data.numero_pedido ||
      existing.shipment.order.customer.documentHash !==
        documentHash(data.cpf_cnpj_destinatario)
    )
      throw new HttpError(
        409,
        "Nota fiscal já vinculada a outro pedido ou destinatário",
      );
    if (existing.shipment.carrier.code !== data.transportadora)
      throw new HttpError(
        409,
        "Nota fiscal já cadastrada com outra transportadora. Corrija a remessa existente no painel.",
      );
    return { id: existing.shipmentId, duplicate: true };
  }
  const carrier = await tx.carrier.findUnique({
    where: { code: data.transportadora },
  });
  if (!carrier) throw new HttpError(400, "Transportadora não cadastrada");
  if (
    data.vendedor_id &&
    !(await tx.adminUser.findFirst({
      where: { id: data.vendedor_id, active: true },
    }))
  )
    throw new HttpError(400, "Selecione um vendedor ativo cadastrado");
  const customer = await tx.customer.upsert({
    where: { documentHash: documentHash(data.cpf_cnpj_destinatario) },
    create: {
      name: data.nome_cliente,
      documentHash: documentHash(data.cpf_cnpj_destinatario),
      email: data.email_cliente || null,
      city: data.cidade_destino,
      state: data.uf_destino,
    },
    update: {},
  });
  const order = await tx.order.upsert({
    where: {
      number_customerId: {
        number: data.numero_pedido,
        customerId: customer.id,
      },
    },
    create: { number: data.numero_pedido, customerId: customer.id },
    update: {},
  });
  const shipment = await tx.shipment.create({
    data: {
      orderId: order.id,
      sellerId: data.vendedor_id || null,
      carrierId: carrier.id,
      destinationCity: data.cidade_destino,
      destinationState: data.uf_destino,
      senderDocument: issuerDocument,
      payerDocument: data.cnpj_tomador || null,
      cte: data.numero_cte || null,
      trackingCode: data.codigo_rastreio || null,
      issuedAt: new Date(data.data_emissao + "T15:00:00Z"),
      invoices: { create: { issuerDocument, series, number } },
      events: {
        create: {
          fingerprint: "invoiced",
          dateOnly: true,
          occurredAt: new Date(data.data_emissao + "T15:00:00Z"),
          description:
            "Nota fiscal cadastrada pela First Sports. Aguardando informações da transportadora.",
          status: "INVOICED",
        },
      },
    },
  });
  await tx.auditLog.create({
    data: { actorId, action: "SHIPMENT_CREATE", entityId: shipment.id },
  });
  return { id: shipment.id, duplicate: false };
}
export async function createShipmentTransaction(
  data: ShipmentInput,
  actor: string,
) {
  return db.$transaction((tx) => createShipment(data, actor, tx));
}
export async function issueLink(shipmentId: string, actorId: string) {
  const token = newToken();
  await db.$transaction(async (tx) => {
    await tx.trackingLink.create({
      data: {
        shipmentId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    await tx.auditLog.create({
      data: { actorId, action: "LINK_CREATE", entityId: shipmentId },
    });
  });
  return token;
}
export const publicInclude = {
  carrier: true,
  invoices: true,
  order: { include: { customer: true } },
  events: { orderBy: { occurredAt: "desc" as const } },
};
export function publicShipment(
  s: Prisma.ShipmentGetPayload<{ include: typeof publicInclude }>,
) {
  return {
    id: s.id,
    orderNumber: s.order.number,
    invoices: s.invoices.map((i) => ({ number: i.number, series: i.series })),
    carrier: s.carrier.name,
    cte: s.cte,
    trackingCode: s.trackingCode,
    proofOfDeliveryUrl: s.proofOfDeliveryUrl,
    status: s.status,
    estimatedDelivery: s.estimatedDelivery,
    deliveredAt: s.deliveredAt,
    lastSyncedAt: s.lastSyncedAt,
    updatedAt: s.updatedAt,
    stale:
      !s.lastSyncedAt || Date.now() - s.lastSyncedAt.getTime() > 6 * 3600000,
    integrationError: !!s.lastSyncError,
    events: s.events.map((e) => ({
      id: e.id,
      occurredAt: e.occurredAt,
      dateOnly: e.dateOnly,
      description: e.description,
      location: e.location,
      status: e.status,
    })),
  };
}
