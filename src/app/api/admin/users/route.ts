import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, checkOrigin, HttpError } from "@/lib/security";
import { z } from "zod";
const role = z.enum(["ADMIN", "OPERATOR", "VIEWER", "SALES"]);
const permissions = z.object({ role, active: z.boolean() });

function validateOwnAccess(
  actorId: string,
  userId: string,
  access: z.infer<typeof permissions>,
) {
  if (actorId === userId && (access.role !== "ADMIN" || !access.active))
    throw new HttpError(
      400,
      "Não é permitido remover seu próprio acesso administrativo",
    );
}

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
      .object({ id: z.uuid(), email: z.email(), ...permissions.shape })
      .parse(await r.json());
    validateOwnAccess(actor.id, body.id, body);
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

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requireAdmin(["ADMIN"]);
    const { id, previous, ...access } = permissions
      .extend({
        id: z.uuid(),
        previous: permissions,
      })
      .parse(await request.json());
    validateOwnAccess(actor.id, id, access);
    await db.$transaction(async (tx) => {
      const { count } = await tx.adminUser.updateMany({
        where: { id, ...previous },
        data: access,
      });
      if (!count)
        throw new HttpError(
          409,
          "O usuário foi alterado ou removido. Recarregue a página e tente novamente.",
        );
      if (previous.role !== access.role || previous.active !== access.active)
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "ADMIN_USER_UPDATE",
            entityId: id,
            snapshot: { previous, current: access },
          },
        });
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
