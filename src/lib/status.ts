export const statusLabels = {
  INVOICED: "Pedido faturado",
  AWAITING_PICKUP: "Aguardando coleta",
  PICKED_UP: "Coletado",
  IN_TRANSIT: "Em transporte",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  DELIVERED: "Entregue",
  EXCEPTION: "Ocorrência",
  RETURNING: "Em devolução",
  RETURNED: "Devolvido",
  CANCELLED: "Cancelado",
  UNKNOWN: "Aguardando informações",
} as const;
export const terminalStatuses = ["DELIVERED", "RETURNED", "CANCELLED"] as const;
export function dateTime(value: Date | string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(value))
    : "Ainda não informado";
}
export function dateOnly(value: Date | string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(value))
    : "Ainda não informada";
}

// Without an explicit timed delivery event, do not present a converted date as midnight.
export function deliveryDateTime(
  value: Date | string,
  events: { status: string; occurredAt: Date | string; dateOnly: boolean }[],
) {
  const timed = events.some(
    (e) =>
      e.status === "DELIVERED" &&
      !e.dateOnly &&
      +new Date(e.occurredAt) === +new Date(value),
  );
  return timed ? dateTime(value) : dateOnly(value) + " · horário não informado";
}
