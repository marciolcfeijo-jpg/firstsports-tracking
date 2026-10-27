import { db } from "./db";
import { documentHash, HttpError } from "./security";
import { issueLink } from "./shipments";
import { syncShipment } from "./sync";
import { trackingLookupSchema } from "./validation";

// No carrier request is allowed before the recipient has been matched locally.
// Fresh data and retry backoff are respected; the remaining due shipments stay queued.
export async function lookupInvoice(
  raw: unknown,
  run: typeof syncShipment = syncShipment,
) {
  const body = trackingLookupSchema.parse(raw);
  const shipments = await db.shipment.findMany({
    where: {
      order: { customer: { documentHash: documentHash(body.document) } },
      invoices: { some: { number: String(Number(body.number)) } },
    },
    include: { carrier: { select: { name: true, enabled: true, code: true } } },
    orderBy: { createdAt: "asc" },
    take: 30,
  });
  if (!shipments.length)
    throw new HttpError(
      404,
      "Não foi possível validar a consulta. Confira a nota fiscal e o documento ou solicite um link seguro à First Sports.",
    );
  let refreshes = 0;
  for (const shipment of shipments) {
    if (refreshes >= 3) break;
    if (
      !shipment.carrier.enabled ||
      ["DELIVERED", "RETURNED", "CANCELLED"].includes(shipment.status) ||
      shipment.nextSyncAt > new Date() ||
      (shipment.leaseUntil && shipment.leaseUntil > new Date())
    )
      continue;
    const requestCost = shipment.carrier.code === "CORREIOS" ? 2 : 1;
    if (refreshes + requestCost > 3) continue;
    refreshes += requestCost;
    try {
      await run(shipment.id, undefined, String(Number(body.number)));
    } catch {
      /* Keep serving the last persisted information if upstream is unavailable. */
    }
  }
  // Read again after refresh so the table shows the newly persisted carrier data.
  const rows = await db.shipment.findMany({
    where: {
      id: { in: shipments.map((s) => s.id) },
      order: { customer: { documentHash: documentHash(body.document) } },
      invoices: { some: { number: String(Number(body.number)) } },
    },
    include: {
      order: { include: { customer: { select: { name: true } } } },
      carrier: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const links = [];
  for (const shipment of rows)
    links.push({
      url: "/rastreio/" + (await issueLink(shipment.id, "PUBLIC_LOOKUP")),
      carrier: shipment.carrier.name,
      invoiceNumber: String(Number(body.number)),
      orderNumber: shipment.order.number,
      customerName: shipment.order.customer.name,
      issuedAt: shipment.issuedAt.toISOString(),
      estimatedDelivery: shipment.estimatedDelivery?.toISOString() || null,
      status: shipment.status,
      lastSyncedAt: shipment.lastSyncedAt?.toISOString() || null,
    });
  return { links };
}
