import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, checkOrigin, HttpError } from "@/lib/security";
import { z } from "zod";
export async function GET() {
  try {
    await requireAdmin(["ADMIN"]);
    return Response.json(
      await db.adminUser.findMany({ orderBy: { createdAt: "desc" } }),
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(r: Request) {
  try {
    checkOrigin(r);
    const actor = await requireAdmin(["ADMIN"]);
    const body = z
      .object({
        id: z.uuid(),
        email: z.email(),
        role: z.enum(["ADMIN", "OPERATOR", "VIEWER"]),
        active: z.boolean(),
      })
      .parse(await r.json());
    if (actor.id === body.id && (body.role !== "ADMIN" || !body.active))
      throw new HttpError(
        400,
        "Não é permitido remover seu próprio acesso administrativo",
      );
    await db.$transaction(async (tx) => {
      await tx.adminUser.upsert({
        where: { id: body.id },
        create: body,
        update: { role: body.role, active: body.active, email: body.email },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "ADMIN_USER_UPDATE",
          entityId: body.id,
        },
      });
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
