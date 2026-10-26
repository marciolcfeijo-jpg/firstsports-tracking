import { issueLink } from "@/lib/shipments";
import { requireAdmin } from "@/lib/auth";
import { apiError, checkOrigin, HttpError } from "@/lib/security";
import { db } from "@/lib/db";
import { z } from "zod";
export async function POST(r: Request, c: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(r);
    const user = await requireAdmin(["ADMIN", "OPERATOR"]);
    const { id } = await c.params;
    const token = await issueLink(id, user.id);
    return Response.json({
      url: new URL(
        "/rastreio/" + token,
        process.env.APP_URL || "http://localhost:3000",
      ).toString(),
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(
  r: Request,
  c: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(r);
    const actor = await requireAdmin(["ADMIN", "OPERATOR"]);
    const { id } = await c.params;
    const { linkId } = z.object({ linkId: z.string() }).parse(await r.json());
    await db.$transaction(async (tx) => {
      const result = await tx.trackingLink.updateMany({
        where: { id: linkId, shipmentId: id },
        data: { revokedAt: new Date() },
      });
      if (!result.count) throw new HttpError(404, "Link não encontrado");
      await tx.auditLog.create({
        data: { actorId: actor.id, action: "LINK_REVOKE", entityId: id },
      });
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
