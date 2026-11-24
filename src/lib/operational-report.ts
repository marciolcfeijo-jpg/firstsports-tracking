import type { Prisma, ShipmentStatus } from "@prisma/client";

export const reportDaysDefault = 3;
export const reportDaysMax = 90;

export function reportDays(value: string | null | undefined) {
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= reportDaysMax
    ? days
    : reportDaysDefault;
}

export function reportCutoff(now: Date, days: number) {
  return new Date(now.getTime() - days * 86_400_000);
}

export const movementStatuses: ShipmentStatus[] = [
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "RETURNING",
];

export function stalledShipments(
  now: Date,
  days: number,
): Prisma.ShipmentWhereInput {
  const cutoff = reportCutoff(now, days);
  return {
    status: { in: movementStatuses },
    events: {
      some: { status: { in: movementStatuses }, occurredAt: { lte: cutoff } },
      none: { status: { in: movementStatuses }, occurredAt: { gt: cutoff } },
    },
  };
}

export const pendingOrderLabels = {
  "pre-invoice": "Pedidos antes do faturamento",
  "missing-link": "Pedidos sem remessa para revisar",
} as const;

export function pendingOrderFilter(value: unknown) {
  return value === "pre-invoice" || value === "missing-link" ? value : null;
}

export function agedOrdersWithoutShipments(
  now: Date,
  days: number,
  filter: keyof typeof pendingOrderLabels | null = null,
): Prisma.OrderWhereInput {
  const stage: Prisma.OrderWhereInput =
    filter === "pre-invoice"
      ? { stage: { in: ["RECEIVED", "PREPARING", "READY_TO_INVOICE"] } }
      : filter === "missing-link"
        ? { stage: null }
        : { OR: [{ stage: null }, { stage: { not: "CANCELLED" } }] };
  return {
    ...stage,
    shipments: { none: {} },
    createdAt: { lte: reportCutoff(now, days) },
  };
}

export const shipmentReports = [
  {
    id: "late",
    label: "NFs em atraso",
    query: { attention: "late" },
    help: "A previsão de entrega já passou. Confira com a transportadora uma nova previsão.",
  },
  {
    id: "stalled",
    label: "NFs sem movimentação",
    query: { attention: "stalled" },
    help: "A remessa está em transporte e a última movimentação logística registrada atingiu o limite de dias.",
  },
  {
    id: "exception",
    label: "NFs em ocorrência",
    query: { attention: "exception" },
    help: "A transportadora registrou uma ocorrência. Abra a remessa para verificar o motivo.",
  },
  {
    id: "no-forecast",
    label: "NFs sem previsão",
    query: { attention: "no-forecast" },
    help: "A remessa está em aberto e ainda precisa de previsão de entrega.",
  },
  {
    id: "not-found",
    label: "NFs não localizadas",
    query: { attention: "open", tracking: "not_found" },
    help: "A última consulta não encontrou a remessa. Confira os dados fiscais e o CNPJ do tomador.",
  },
  {
    id: "no-seller",
    label: "NFs sem vendedor",
    query: { attention: "open", seller: "none" },
    help: "A remessa está em aberto e ainda precisa de um vendedor responsável.",
  },
] as const;

export function shipmentReportParams(
  report: (typeof shipmentReports)[number],
  days: number,
) {
  const params = new URLSearchParams(report.query);
  if (report.id === "stalled") params.set("days", String(days));
  return params;
}
