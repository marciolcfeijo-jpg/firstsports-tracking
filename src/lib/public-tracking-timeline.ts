import { statusLabels } from "./status";
import type { ShipmentStatus } from "@prisma/client";

export type TrackingStep = {
  id: string;
  label: string;
  occurredAt: string;
  dateOnly: boolean;
};

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
