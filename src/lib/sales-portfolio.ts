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
