import { db } from "./db";
import { startOfDeliveryDay } from "./delivery-metrics";

export const zenlogSchedulerActor = "scheduler:zenlog";
export const trackingSchedulerActor = "scheduler:tracking";
export const automaticOrderUpdate = "SCHEDULED_ZENLOG_ORDER_UPDATE";
export const automaticShipmentUpdate = "SCHEDULED_SHIPMENT_TRACKING_UPDATE";

export async function automaticUpdates(days: number) {
  const today = startOfDeliveryDay(new Date());
  const start = new Date(today.getTime() - (days - 1) * 86_400_000);
  const rows = await db.auditLog.findMany({
    where: {
      action: { in: [automaticOrderUpdate, automaticShipmentUpdate] },
      createdAt: { gte: start },
    },
    distinct: ["action", "entityId"],
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { action: true, entityId: true, createdAt: true, snapshot: true },
  });
  return {
    pedidos: rows.filter(({ action }) => action === automaticOrderUpdate),
    remessas: rows.filter(({ action }) => action === automaticShipmentUpdate),
  };
}
