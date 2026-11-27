import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";

const forecastAction = "SHIPMENT_FORECAST_UPDATE";
const resetAction = "SHIPMENT_FORECAST_RESET";
const iso = z.iso.datetime({ offset: true });
const snapshot = z.object({
  first: iso.nullable(),
  previous: iso.nullable(),
  current: iso.nullable(),
  dataPrivista: iso.nullable(),
  dataPrevista: iso.nullable(),
});

export async function recordShipmentForecast(
  tx: Prisma.TransactionClient,
  shipmentId: string,
  estimatedDelivery?: string,
  alfa?: { dataPrivista?: string; dataPrevista?: string },
) {
  const shipment = await tx.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    select: { estimatedDelivery: true },
  });
  const last = await tx.auditLog.findFirst({
    where: {
      entityId: shipmentId,
      action: { in: [forecastAction, resetAction] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { action: true, snapshot: true },
  });
  const prior =
    last?.action === forecastAction
      ? snapshot.safeParse(last.snapshot).data
      : undefined;
  const previous = shipment.estimatedDelivery?.toISOString() ?? null;
  const current = estimatedDelivery
    ? new Date(estimatedDelivery).toISOString()
    : previous;
  const dataPrivista = alfa?.dataPrivista
    ? new Date(alfa.dataPrivista).toISOString()
    : (prior?.dataPrivista ?? null);
  const dataPrevista = alfa?.dataPrevista
    ? new Date(alfa.dataPrevista).toISOString()
    : (prior?.dataPrevista ?? null);
  if (
    prior &&
    current === previous &&
    current === prior.current &&
    dataPrivista === prior.dataPrivista &&
    dataPrevista === prior.dataPrevista
  )
    return;
  await tx.auditLog.create({
    data: {
      action: forecastAction,
      actorId: "carrier:tracking",
      entityId: shipmentId,
      snapshot: {
        first: prior?.first ?? previous ?? current,
        previous,
        current,
        dataPrivista,
        dataPrevista,
      },
    },
  });
}

export async function resetShipmentForecast(
  tx: Prisma.TransactionClient,
  shipmentId: string,
  actorId: string,
) {
  await tx.auditLog.create({
    data: { action: resetAction, actorId, entityId: shipmentId },
  });
}

export async function shipmentForecastHistory(shipmentId: string) {
  const records = await db.auditLog.findMany({
    where: {
      entityId: shipmentId,
      action: { in: [forecastAction, resetAction] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
    select: { id: true, action: true, createdAt: true, snapshot: true },
  });
  const active = records.findIndex(({ action }) => action === resetAction);
  return (active < 0 ? records : records.slice(0, active)).flatMap((record) => {
    const parsed = snapshot.safeParse(record.snapshot);
    return parsed.success
      ? [{ id: record.id, at: record.createdAt, ...parsed.data }]
      : [];
  });
}
