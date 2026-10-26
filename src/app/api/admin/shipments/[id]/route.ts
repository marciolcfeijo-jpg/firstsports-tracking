import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { apiError, checkOrigin, HttpError, noStore } from "@/lib/security";
import { editShipment } from "@/lib/edit-shipment";
export async function GET(
  _request: Request,
  c: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await c.params;
    const s = await db.shipment.findUnique({
      where: { id },
      include: {
        order: { include: { customer: true } },
        carrier: true,
        invoices: true,
        events: { orderBy: { occurredAt: "desc" } },
        syncLogs: { orderBy: { createdAt: "desc" }, take: 20 },
        links: { orderBy: { createdAt: "desc" }, take: 30 },
      },
    });
    if (!s) throw new HttpError(404, "Remessa não encontrada");
    return Response.json(s, { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(
  request: Request,
  c: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const actor = await requireAdmin(["ADMIN", "OPERATOR"]);
    return Response.json(
      await editShipment((await c.params).id, await request.json(), actor.id),
    );
  } catch (e) {
    return apiError(e);
  }
}
