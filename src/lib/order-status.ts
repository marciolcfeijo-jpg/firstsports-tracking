import type { OrderStage, ShipmentStatus } from "@prisma/client";

export const orderStageLabels = {
  RECEIVED: "Pedido recebido",
  PREPARING: "Em preparação",
  READY_TO_INVOICE: "Pronto para faturar",
  CANCELLED: "Pedido cancelado",
} satisfies Record<OrderStage, string>;

export function orderAuditStageLabel(action: string, snapshot: unknown) {
  const stage =
    snapshot && typeof snapshot === "object" && "stage" in snapshot
      ? snapshot.stage
      : null;
  return (
    Object.entries(orderStageLabels).find(([code]) => code === stage)?.[1] ??
    (action === "ORDER_CREATE" ? orderStageLabels.RECEIVED : undefined)
  );
}

export const orderTransitions = {
  RECEIVED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY_TO_INVOICE", "CANCELLED"],
  READY_TO_INVOICE: ["CANCELLED"],
  CANCELLED: [],
} satisfies Record<OrderStage, OrderStage[]>;

export function orderStatus(
  stage: OrderStage | null,
  shipments: { status: ShipmentStatus }[],
) {
  if (stage === "CANCELLED") return orderStageLabels.CANCELLED;
  if (!shipments.length)
    return stage ? orderStageLabels[stage] : "Sem remessa vinculada";

  const active = shipments.filter(({ status }) => status !== "CANCELLED");
  if (!active.length) return "Remessas canceladas";
  if (active.some(({ status }) => status === "EXCEPTION"))
    return "Ocorrência na entrega";
  if (active.some(({ status }) => status === "RETURNING"))
    return "Remessa em devolução";
  if (active.some(({ status }) => status === "RETURNED"))
    return "Remessa devolvida";
  if (active.every(({ status }) => status === "DELIVERED"))
    return shipments.length === active.length
      ? "Entregue"
      : "Entrega com remessa cancelada";
  if (active.some(({ status }) => status === "DELIVERED"))
    return "Parcialmente entregue";
  if (active.every(({ status }) => status === "OUT_FOR_DELIVERY"))
    return "Em rota de entrega";
  if (
    active.some(
      ({ status }) =>
        status === "PICKED_UP" ||
        status === "IN_TRANSIT" ||
        status === "OUT_FOR_DELIVERY",
    )
  )
    return "Em transporte";
  return "Faturado · aguardando envio";
}
