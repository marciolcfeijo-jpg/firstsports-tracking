import {
  publicEventSelect,
  publicOrderTimelines,
  publicShipmentTimeline,
} from "@/lib/public-tracking-timeline";
import { db } from "@/lib/db";
import { orderStatus } from "@/lib/order-status";
import {
  apiError,
  checkOrigin,
  documentHash,
  HttpError,
  noStore,
  rateLimit,
} from "@/lib/security";
import { orderLookupSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { number, document } = orderLookupSchema.parse(await request.json());
    const hash = documentHash(document);
    await rateLimit("order-lookup:global", 300, 60);
    await rateLimit("order-lookup:" + hash, 8, 900);
    const order = await db.order.findFirst({
      where: { number, customer: { documentHash: hash } },
      select: {
        id: true,
        number: true,
        stage: true,
        shipments: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            status: true,
            estimatedDelivery: true,
            deliveredAt: true,
            issuedAt: true,
            events: { select: publicEventSelect },
            carrier: { select: { name: true } },
            invoices: { select: { number: true } },
          },
        },
      },
    });
    if (!order)
      throw new HttpError(
        404,
        "Confira o número do pedido e o CPF/CNPJ do destinatário.",
      );
    const timelines = await publicOrderTimelines([order.id]);
    return Response.json(
      {
        number: order.number,
        status: orderStatus(order.stage, order.shipments),
        orderTimeline: timelines.get(order.id) ?? [],
        shipments: order.shipments.map(({ events, issuedAt, ...shipment }) => ({
          ...shipment,
          timeline: publicShipmentTimeline({ ...shipment, events, issuedAt }),
        })),
      },
      { headers: noStore },
    );
  } catch (error) {
    return apiError(error);
  }
}
