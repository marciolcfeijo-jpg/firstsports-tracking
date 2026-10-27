import { requireAdmin } from "@/lib/auth";
import { apiError, checkOrigin } from "@/lib/security";
import { syncShipment } from "@/lib/sync";
import { db } from "@/lib/db";
export async function POST(r: Request, c: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(r);
    const actor = await requireAdmin(["ADMIN", "OPERATOR"]);
    const { id } = await c.params;
    await db.auditLog.create({
      data: { actorId: actor.id, action: "SYNC_REQUEST", entityId: id },
    });
    const result = await syncShipment(id);
    return Response.json(
      {
        ...result,
        ...(result.skipped
          ? {
              error:
                "Outra consulta à transportadora está em andamento. Aguarde e tente novamente.",
            }
          : {}),
      },
      { status: result.ok ? 200 : result.skipped ? 409 : 422 },
    );
  } catch (e) {
    return apiError(e);
  }
}
