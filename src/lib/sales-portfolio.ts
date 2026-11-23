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
