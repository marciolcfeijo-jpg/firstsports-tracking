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
        number: true,
        stage: true,
        shipments: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            status: true,
            estimatedDelivery: true,
            deliveredAt: true,
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
    return Response.json(
      {
        number: order.number,
        status: orderStatus(order.stage, order.shipments),
        shipments: order.shipments,
      },
      { headers: noStore },
    );
  } catch (error) {
    return apiError(error);
  }
}
