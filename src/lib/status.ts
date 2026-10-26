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
