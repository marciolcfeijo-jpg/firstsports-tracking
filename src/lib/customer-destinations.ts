import { Prisma } from "@prisma/client";
import { shipmentSchema } from "./validation";

export async function fillMissingCustomerDestinations(
  tx: Prisma.TransactionClient,
  customer: { id: string; city: string; state: string },
) {
  const city = customer.city.trim();
  const state =
    shipmentSchema.shape.uf_destino.safeParse(
      customer.state.trim().toUpperCase(),
    ).data ?? "";
  if (!city && !state) return { orders: 0, shipments: 0 };

  const cityMissing = Prisma.sql`NULLIF(BTRIM(item."destinationCity"), '') IS NULL`;
  const stateMissing = Prisma.sql`NULLIF(BTRIM(item."destinationState"), '') IS NULL`;
  const canFillCity = Prisma.sql`${city} <> '' AND ${cityMissing}
    AND (${state} = '' OR ${stateMissing} OR UPPER(BTRIM(item."destinationState")) = ${state})`;
  const canFillState = Prisma.sql`${state} <> '' AND ${stateMissing}
    AND (${city} = '' OR ${cityMissing} OR LOWER(BTRIM(item."destinationCity")) = LOWER(${city}))`;
  const updates = Prisma.sql`
    "destinationCity" = CASE WHEN ${canFillCity} THEN ${city} ELSE item."destinationCity" END,
    "destinationState" = CASE WHEN ${canFillState} THEN ${state} ELSE item."destinationState" END
  `;
  const orders = await tx.$executeRaw`
    UPDATE "Order" item SET ${updates}
    WHERE item."customerId" = ${customer.id} AND ((${canFillCity}) OR (${canFillState}))
  `;
  const shipments = await tx.$executeRaw`
    UPDATE "Shipment" item SET ${updates}, "version" = item."version" + 1, "updatedAt" = NOW()
    FROM "Order" o WHERE o.id = item."orderId" AND o."customerId" = ${customer.id}
      AND ((${canFillCity}) OR (${canFillState}))
  `;
  return { orders, shipments };
}
