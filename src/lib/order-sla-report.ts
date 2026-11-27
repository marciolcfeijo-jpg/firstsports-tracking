import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { salesOrdersWhere, salesShipmentsWhere } from "./sales-portfolio";
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

export async function orderSlaReport(filters: ReturnType<typeof slaFilters>) {
  const groups = new Map<string, Group>();
  let missingInclusion = 0;
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
        destinationState: true,
        customer: { select: { state: true } },
        shipments: {
          where: {
            ...(filters.sellerId ? salesShipmentsWhere(filters.sellerId) : {}),
            status: { not: "CANCELLED" },
            invoices: { some: {} },
          },
          select: {
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
      if (!history) continue;
      const { included, invoiced, dispatched } = orderSlaMilestones(history);
      if (!included) {
        missingInclusion++;
        if (filters.start || filters.end) continue;
      }
      if (included) {
        const date = dateInBrazil.format(included);
        if (
          (filters.start && date < filters.start) ||
          (filters.end && date > filters.end)
        )
          continue;
      }
      const shipmentStates = [
        ...new Set(
          order.shipments
            .map(
              ({ destinationState }) =>
                shipmentSchema.shape.uf_destino.safeParse(
                  destinationState.trim().toUpperCase(),
                ).data,
            )
            .filter(Boolean),
        ),
      ];
      const state =
        shipmentStates.length > 1
          ? "Múltiplas UFs"
          : (shipmentStates[0] ??
            shipmentSchema.shape.uf_destino.safeParse(
              (order.destinationState || order.customer.state)
                .trim()
                .toUpperCase(),
            ).data ??
            "Sem UF");
      const group = groups.get(state) ?? {
        state,
        orders: 0,
        measures: slaColumns.map(() => ({ total: 0, count: 0 })),
      };
      group.orders++;
      const deliveries = order.shipments.flatMap(
        ({ status, deliveredAt, events }) =>
          status === "DELIVERED" &&
          deliveredAt &&
          events.some(({ occurredAt }) => +occurredAt === +deliveredAt)
            ? [deliveredAt]
            : [],
      );
      const delivered =
        deliveries.length && deliveries.length === order.shipments.length
          ? new Date(Math.max(...deliveries.map(Number)))
          : undefined;
      addDuration(group.measures[0], included, invoiced);
      addDuration(group.measures[1], invoiced, dispatched);
      addDuration(group.measures[2], dispatched, delivered);
      groups.set(state, group);
    }
    after = orders[orders.length - 1].id;
    if (orders.length < 500) break;
  }
  return {
    groups: [...groups.values()].sort((a, b) =>
      a.state.localeCompare(b.state, "pt-BR"),
    ),
    missingInclusion,
  };
}
