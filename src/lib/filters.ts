import { Prisma, ShipmentStatus } from "@prisma/client";
import { deliveryAttention, startOfDeliveryDay } from "./delivery-metrics";
import { reportDays, stalledShipments } from "./operational-report";
import { terminalStatuses } from "./status";

export function shipmentWhere(
  p: URLSearchParams,
  now = new Date(),
): Prisma.ShipmentWhereInput {
  const q = p.get("q")?.slice(0, 120),
    status = p.get("status"),
    carrier = p.get("carrier"),
    seller = p.get("seller"),
    state = p.get("state"),
    from = p.get("from"),
    to = p.get("to");
  const attention = deliveryAttention(p.get("attention"));
  return {
    ...(attention
      ? {
          AND: [
            { status: { notIn: [...terminalStatuses] } },
            ...(attention === "stalled"
              ? [stalledShipments(now, reportDays(p.get("days")))]
              : []),
            ...(attention === "late"
              ? [{ estimatedDelivery: { lt: startOfDeliveryDay(now) } }]
              : []),
            ...(attention === "exception"
              ? [{ status: ShipmentStatus.EXCEPTION }]
              : []),
            ...(attention === "no-forecast"
              ? [{ estimatedDelivery: null }]
              : []),
          ],
        }
      : {}),
    ...(q
      ? {
          OR: [
            { order: { number: { contains: q, mode: "insensitive" } } },
            {
              order: {
                customer: { name: { contains: q, mode: "insensitive" } },
              },
            },
            { invoices: { some: { number: { contains: q } } } },
          ],
        }
      : {}),
    ...(status &&
    Object.values(ShipmentStatus).includes(status as ShipmentStatus)
      ? { status: status as ShipmentStatus }
      : {}),
    ...(p.get("tracking") === "not_found"
      ? { lastSyncError: "NOT_FOUND" }
      : {}),
    ...(seller ? { sellerId: seller === "none" ? null : seller } : {}),
    ...(carrier ? { carrier: { code: carrier } } : {}),
    ...(state ? { destinationState: state } : {}),
    ...((from && !Number.isNaN(Date.parse(from))) ||
    (to && !Number.isNaN(Date.parse(to)))
      ? {
          issuedAt: {
            ...(from && !Number.isNaN(Date.parse(from))
              ? { gte: new Date(from) }
              : {}),
            ...(to && !Number.isNaN(Date.parse(to))
              ? { lte: new Date(to + "T23:59:59Z") }
              : {}),
          },
        }
      : {}),
  };
}
