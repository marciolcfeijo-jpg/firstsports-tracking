import { randomUUID } from "node:crypto";
import { recordSyncDiagnostic } from "@/lib/sync-diagnostics";
import { requireAdmin } from "@/lib/auth";
import { apiError, checkOrigin, HttpError } from "@/lib/security";
import { syncShipment } from "@/lib/sync";
import { db } from "@/lib/db";
export const maxDuration = 60;
export async function POST(r: Request, c: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  let shipmentId: string | undefined;
  let phase: "authentication" | "request_audit" | "sync" = "authentication";
  try {
    checkOrigin(r);
    const actor = await requireAdmin(["ADMIN", "OPERATOR"]);
    const { id } = await c.params;
    shipmentId = id;
    phase = "request_audit";
    await db.auditLog.create({
      data: { actorId: actor.id, action: "SYNC_REQUEST", entityId: id },
    });
    phase = "sync";
    const result = await syncShipment(
      id,
      undefined,
      undefined,
      undefined,
      requestId,
    );
    return Response.json(
      {
        ...result,
        requestId,
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
    if (!(e instanceof HttpError && e.status < 500)) {
      const diagnostic = await recordSyncDiagnostic(
        shipmentId,
        requestId,
        phase,
        e,
      );
      return Response.json(
        {
          error:
            "Não foi possível concluir a atualização. Consulte o diagnóstico registrado abaixo.",
          code: diagnostic.code,
          requestId,
        },
        { status: 500 },
      );
    }
    return apiError(e);
  }
}
