import { Prisma, ShipmentStatus } from "@prisma/client";
export function shipmentWhere(p: URLSearchParams): Prisma.ShipmentWhereInput {
  const q = p.get("q")?.slice(0, 120),
    status = p.get("status"),
    carrier = p.get("carrier"),
    state = p.get("state"),
    from = p.get("from"),
    to = p.get("to");
  return {
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
