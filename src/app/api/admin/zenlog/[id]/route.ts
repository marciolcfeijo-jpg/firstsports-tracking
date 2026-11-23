import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  apiError,
  checkOrigin,
  HttpError,
  noStore,
  rateLimit,
} from "@/lib/security";
import { zenlogExpeditionEvents } from "@/lib/zenlog";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const actor = await requireAdmin(["ADMIN", "OPERATOR"]);
    const { id } = await params;
    const order = await db.order.findUnique({
      where: { id },
      select: { number: true },
    });
    if (!order) throw new HttpError(404, "Pedido não encontrado.");
    if (
      await db.order.findFirst({
        where: { number: order.number, id: { not: id } },
        select: { id: true },
      })
    )
      throw new HttpError(
        409,
        "Há mais de um pedido com este número. Confirme o código da expedição com o ZenLOG.",
      );
    await rateLimit("zenlog:global", 60, 60);
    await rateLimit("zenlog:" + actor.id, 20, 60);
    return Response.json(
      { events: await zenlogExpeditionEvents(order.number) },
      { headers: noStore },
    );
  } catch (error) {
    return apiError(error);
  }
}
