type ShipmentMetricInput = {
  status: string;
  deliveredAt: Date | string | null;
  estimatedDelivery: Date | string | null;
  carrierId: string;
  lastSyncError?: string | null;
};
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function localDay(value: Date | string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return date.toISOString().slice(0, 10) === value ? value : null;
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function deliveryMetrics(
  shipments: ShipmentMetricInput[],
  now = new Date(),
) {
  const counts = {
    total: shipments.length,
    open: 0,
    delivered: 0,
    closedOther: 0,
    early: 0,
    onDay: 0,
    after: 0,
    unclassified: 0,
    overdue: 0,
    exceptions: 0,
    withoutForecast: 0,
  };
  const failedCarriers = new Set<string>();
  const today = localDay(now)!;
  for (const shipment of shipments) {
    if (shipment.lastSyncError) failedCarriers.add(shipment.carrierId);
    const forecast = localDay(shipment.estimatedDelivery);
    if (shipment.status === "DELIVERED") {
      counts.delivered++;
      const delivered = localDay(shipment.deliveredAt);
      if (!delivered || !forecast) counts.unclassified++;
      else if (delivered < forecast) counts.early++;
      else if (delivered === forecast) counts.onDay++;
      else counts.after++;
    } else if (["RETURNED", "CANCELLED"].includes(shipment.status)) {
      counts.closedOther++;
    } else {
      counts.open++;
      if (!forecast) counts.withoutForecast++;
      else if (forecast < today) counts.overdue++;
      if (shipment.status === "EXCEPTION") counts.exceptions++;
    }
  }
  const comparable = counts.early + counts.onDay + counts.after;
  return {
    ...counts,
    comparable,
    failedCarriers: failedCarriers.size,
    onTimeRate: comparable
      ? ((counts.early + counts.onDay) / comparable) * 100
      : null,
  };
}
export type DeliveryMetrics = ReturnType<typeof deliveryMetrics>;
