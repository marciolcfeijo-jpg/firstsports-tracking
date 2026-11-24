import { shipmentWhere } from "./filters";
import type { Prisma } from "@prisma/client";

export function salesOrdersWhere(sellerId: string): Prisma.OrderWhereInput {
  return {
    OR: [{ sellerId }, { shipments: { some: { sellerId } } }],
  };
}

export function salesShipmentsWhere(
  sellerId: string,
): Prisma.ShipmentWhereInput {
  return {
    OR: [{ sellerId }, { sellerId: null, order: { sellerId } }],
  };
}

export function salesReportShipmentWhere(
  sellerId: string,
  params: URLSearchParams,
  now = new Date(),
): Prisma.ShipmentWhereInput {
  return { AND: [salesShipmentsWhere(sellerId), shipmentWhere(params, now)] };
}

export function salesPortfolioShipmentFilter(
  sellerId: string,
  params: URLSearchParams,
  invoiceNumber: string,
  now = new Date(),
): Prisma.ShipmentWhereInput {
  const where = salesReportShipmentWhere(sellerId, params, now);
  if (!invoiceNumber) return where;
  const number = /^\d{1,12}$/.test(invoiceNumber)
    ? String(Number(invoiceNumber))
    : invoiceNumber;
  return { AND: [where, { invoices: { some: { number } } }] };
}

export function salesDeliveryFilters(
  params: Record<string, string | string[] | undefined>,
) {
  const values: Record<string, string> = {};
  for (const key of [
    "q",
    "carrier",
    "status",
    "tracking",
    "state",
    "from",
    "to",
    "sort",
  ]) {
    const value = params[key];
    if (typeof value !== "string" || !value.trim()) continue;
    if ((key === "from" || key === "to") && !/^\d{4}-\d{2}-\d{2}$/.test(value))
      continue;
    values[key] = value.trim().slice(0, 120);
  }
  return values;
}
