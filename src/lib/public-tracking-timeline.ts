import { db } from "./db";
import { orderStageLabels } from "./order-status";
import { statusLabels } from "./status";
import type { ShipmentStatus } from "@prisma/client";

export type TrackingStep = {
  id: string;
  label: string;
  occurredAt: string;
  dateOnly: boolean;
};

export async function publicOrderTimelines(orderIds: string[]) {
  const timelines = new Map<string, TrackingStep[]>();
  if (!orderIds.length) return timelines;
  const entries = await db.auditLog.findMany({
    where: {
      entityId: { in: orderIds },
      action: { in: ["ORDER_CREATE", "ORDER_STAGE_UPDATE"] },
    },
    select: {
      id: true,
      entityId: true,
      action: true,
      createdAt: true,
      snapshot: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  for (const entry of entries) {
    const snapshot = entry.snapshot;
    const stage =
      snapshot && typeof snapshot === "object" && "stage" in snapshot
        ? snapshot.stage
        : null;
    const label =
      entry.action === "ORDER_CREATE"
        ? orderStageLabels.RECEIVED
        : Object.entries(orderStageLabels).find(([key]) => key === stage)?.[1];
    if (!label) continue;
    const steps = timelines.get(entry.entityId) ?? [];
    steps.push({
      id: entry.id,
      label,
      occurredAt: entry.createdAt.toISOString(),
      dateOnly: false,
    });
    timelines.set(entry.entityId, steps);
  }
  return timelines;
}

export const publicEventSelect = {
  id: true,
  fingerprint: true,
  status: true,
  occurredAt: true,
  dateOnly: true,
} as const;

export function publicShipmentTimeline(shipment: {
  issuedAt: Date;
  deliveredAt: Date | null;
  status: ShipmentStatus;
  events: {
    id: string;
    fingerprint: string;
    status: ShipmentStatus;
    occurredAt: Date;
    dateOnly: boolean;
  }[];
}): TrackingStep[] {
  const steps = shipment.events
    .filter((event) => event.fingerprint !== "invoiced")
    .map((event) => ({
      id: event.id,
      label: statusLabels[event.status],
      occurredAt: event.occurredAt.toISOString(),
      dateOnly: event.dateOnly,
    }));
  if (
    shipment.status === "DELIVERED" &&
    shipment.deliveredAt &&
    !shipment.events.some((event) => event.status === "DELIVERED")
  ) {
    steps.push({
      id: "delivered",
      label: statusLabels.DELIVERED,
      occurredAt: shipment.deliveredAt.toISOString(),
      dateOnly: true,
    });
  }
  steps.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return [
    {
      id: "invoice",
      label: "Nota fiscal emitida",
      occurredAt: shipment.issuedAt.toISOString(),
      dateOnly: true,
    },
    ...steps,
  ];
}
