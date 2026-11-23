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

export function agedOrdersWithoutShipments(
  now: Date,
  days: number,
): Prisma.OrderWhereInput {
  return {
    OR: [{ stage: null }, { stage: { not: "CANCELLED" } }],
    shipments: { none: {} },
    createdAt: { lte: reportCutoff(now, days) },
  };
}
