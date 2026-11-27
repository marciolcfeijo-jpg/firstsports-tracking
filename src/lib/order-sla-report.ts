import type { Prisma, ShipmentStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { salesOrdersWhere } from "./sales-portfolio";
import { issueDateSchema, shipmentSchema } from "./validation";
import {
  zenlogDate,
  zenlogDispatchedEventId,
  zenlogInvoiceEventId,
} from "./zenlog-milestones";

const event = z.object({
  code: z.number().nullish(),
  status: z.string().nullish(),
  start: z.string().nullish(),
  end: z.string().nullish(),
});
const snapshot = z.object({
  registeredAt: z.string().nullish(),
  events: z.array(event).default([]),
});

export const slaColumns = [
  "Inclusão → NF",
  "NF → Expedição",
  "Expedição → Entrega",
  "Inclusão → Entrega",
] as const;
type Metric = { total: number; count: number };
type Group = { state: string; orders: number; measures: Metric[] };
const dateInBrazil = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function slaFilters(
  input: Record<string, string | string[] | undefined>,
) {
  const text = (value: unknown, max = 120) =>
    typeof value === "string" ? value.trim().slice(0, max) : "";
  const start = issueDateSchema.safeParse(text(input.de)).data ?? "";
  const end = issueDateSchema.safeParse(text(input.ate)).data ?? "";
  return {
    start,
    end,
    customer: text(input.cliente),
    sellerId: text(input.vendedor, 100),
    allOrders: input.entrega === "todos",
  };
}

export function orderSlaMilestones(snapshots: unknown[]) {
  let included: Date | undefined;
  let invoiced: Date | undefined;
  let dispatched: Date | undefined;
  for (const item of snapshots) {
    const parsed = snapshot.safeParse(item);
    if (!parsed.success) continue;
    const date = zenlogDate(parsed.data.registeredAt);
    if (date && (!included || date < included)) included = date;
    for (const entry of parsed.data.events) {
      if (entry.status !== "S") continue;
      const time = zenlogDate(entry.end) ?? zenlogDate(entry.start);
      if (!time) continue;
      if (entry.code === zenlogInvoiceEventId && (!invoiced || time < invoiced))
        invoiced = time;
      if (
        entry.code === zenlogDispatchedEventId &&
        (!dispatched || time < dispatched)
      )
        dispatched = time;
    }
  }
  return { included, invoiced, dispatched };
}

function addDuration(
  metric: Metric,
  start: Date | undefined,
  end: Date | undefined,
) {
  if (!start || !end || end < start) return;
  metric.total += (+end - +start) / 3_600_000;
  metric.count++;
}

export const slaShipmentPageSize = 50;
export const missingShipmentState = "sem-uf-na-remessa";

type ShipmentDetail = {
  id?: string;
  orderId: string;
  orderNumber: string;
  customer: string;
  state: string | undefined;
  groupedState: string;
  invoices: { number: string; series: string }[];
  carrier?: string;
  status?: ShipmentStatus;
};

function destinationState(value: string) {
  return shipmentSchema.shape.uf_destino.safeParse(value.trim().toUpperCase())
    .data;
}

export async function orderSlaReport(
  filters: ReturnType<typeof slaFilters>,
  drilldown?: { state: string; page: number },
) {
  const groups = new Map<string, Group>();
  let missingInclusion = 0;
  const excluded = {
    withoutHistory: 0,
    withoutCompletedDelivery: 0,
    byPeriod: 0,
  };
  let missingShipmentStates = 0;
  let matchingShipments = 0;
  let matchingOrders = 0;
  const shipmentDetails: ShipmentDetail[] = [];
  const detailOffset = drilldown
    ? (drilldown.page - 1) * slaShipmentPageSize
    : 0;
  let after: string | undefined;
  const where: Prisma.OrderWhereInput = {
    ...(filters.sellerId ? salesOrdersWhere(filters.sellerId) : {}),
    ...(filters.customer
      ? {
          customer: {
            OR: [
              { name: { contains: filters.customer, mode: "insensitive" } },
              { erpCode: filters.customer },
            ],
          },
        }
      : {}),
  };
  while (true) {
    const orders = await db.order.findMany({
      where: { AND: [where, ...(after ? [{ id: { gt: after } }] : [])] },
      orderBy: { id: "asc" },
      take: 500,
      select: {
        id: true,
        number: true,
        destinationState: true,
        sellerId: true,
        customer: { select: { state: true, name: true, responsibleId: true } },
        shipments: {
          where: { status: { not: "CANCELLED" } },
          orderBy: { id: "asc" },
          select: {
            id: true,
            sellerId: true,
            carrier: { select: { name: true } },
            invoices: {
              select: { number: true, series: true },
              orderBy: { id: "asc" },
            },
            destinationState: true,
            status: true,
            deliveredAt: true,
            events: {
              where: { status: "DELIVERED", dateOnly: false },
              select: { occurredAt: true },
            },
          },
        },
      },
    });
    if (!orders.length) break;
    const logs = await db.auditLog.findMany({
      where: {
        action: "ZENLOG_STATUS",
        entityId: { in: orders.map(({ id }) => id) },
      },
      select: { entityId: true, snapshot: true },
    });
    const byOrder = new Map<string, unknown[]>();
    for (const log of logs) {
      const snapshots = byOrder.get(log.entityId) ?? [];
      snapshots.push(log.snapshot);
      byOrder.set(log.entityId, snapshots);
    }
    for (const order of orders) {
      const history = byOrder.get(order.id);
      if (!history) {
        excluded.withoutHistory++;
        continue;
      }
      const deliveries = order.shipments.flatMap(
        ({ status, deliveredAt, events }) =>
          status === "DELIVERED" &&
          deliveredAt &&
          events.some(({ occurredAt }) => +occurredAt === +deliveredAt)
            ? [deliveredAt]
            : [],
      );
      const delivered =
        deliveries.length &&
        deliveries.length === order.shipments.length &&
        order.shipments.some(({ invoices }) => invoices.length)
          ? new Date(Math.max(...deliveries.map(Number)))
          : undefined;
      if (!filters.allOrders && !delivered) {
        excluded.withoutCompletedDelivery++;
        continue;
      }
      const { included, invoiced, dispatched } = orderSlaMilestones(history);
      if (!included) missingInclusion++;
      if (filters.start || filters.end) {
        const date = included && dateInBrazil.format(included);
        if (
          !date ||
          (filters.start && date < filters.start) ||
          (filters.end && date > filters.end)
        ) {
          excluded.byPeriod++;
          continue;
        }
      }
      const orderSeller = order.sellerId ?? order.customer.responsibleId;
      const shipments = order.shipments.filter(
        (shipment) =>
          shipment.invoices.length &&
          (!filters.sellerId ||
            (shipment.sellerId ?? orderSeller) === filters.sellerId),
      );
      const shipmentStates = [
        ...new Set(
          shipments
            .map((shipment) => destinationState(shipment.destinationState))
            .filter(Boolean),
        ),
      ];
      const state =
        shipmentStates.length > 1
          ? "Múltiplas UFs"
          : (shipmentStates[0] ??
            destinationState(order.destinationState ?? "") ??
            destinationState(order.customer.state) ??
            "Sem UF");
      const orderDetail = {
        orderId: order.id,
        orderNumber: order.number,
        customer: order.customer.name,
        groupedState: state,
      };
      const groupSelected = drilldown?.state === state;
      if (groupSelected) matchingOrders++;
      const showOrder =
        groupSelected &&
        matchingOrders > detailOffset &&
        matchingOrders <= detailOffset + slaShipmentPageSize;
      for (const shipment of shipments) {
        const recordedState = destinationState(shipment.destinationState);
        if (!recordedState) missingShipmentStates++;
        const missingStateSelected =
          drilldown?.state === missingShipmentState && !recordedState;
        if (!groupSelected && !missingStateSelected) continue;
        matchingShipments++;
        const showShipment =
          missingStateSelected &&
          matchingShipments > detailOffset &&
          matchingShipments <= detailOffset + slaShipmentPageSize;
        if (!showOrder && !showShipment) continue;
        shipmentDetails.push({
          ...orderDetail,
          id: shipment.id,
          state: recordedState,
          invoices: shipment.invoices,
          carrier: shipment.carrier.name,
          status: shipment.status,
        });
      }
      if (showOrder && !shipments.length) {
        shipmentDetails.push({
          ...orderDetail,
          state: undefined,
          invoices: [],
        });
      }
      const group = groups.get(state) ?? {
        state,
        orders: 0,
        measures: slaColumns.map(() => ({ total: 0, count: 0 })),
      };
      group.orders++;
      addDuration(group.measures[0], included, invoiced);
      addDuration(group.measures[1], invoiced, dispatched);
      addDuration(group.measures[2], dispatched, delivered);
      addDuration(group.measures[3], included, delivered);
      groups.set(state, group);
    }
    after = orders[orders.length - 1].id;
    if (orders.length < 500) break;
  }
  const brazil = {
    orders: 0,
    measures: slaColumns.map(() => ({ total: 0, count: 0 })),
  };
  for (const group of groups.values()) {
    brazil.orders += group.orders;
    group.measures.forEach(({ total, count }, index) => {
      brazil.measures[index].total += total;
      brazil.measures[index].count += count;
    });
  }
  return {
    groups: [...groups.values()].sort((a, b) =>
      a.state.localeCompare(b.state, "pt-BR"),
    ),
    brazil,
    excluded,
    missingInclusion,
    missingShipmentStates,
    matchingShipments,
    matchingOrders,
    shipmentDetails,
  };
}
