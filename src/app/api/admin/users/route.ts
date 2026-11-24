import { Prisma } from "@prisma/client";
import { verifySupabaseIdentity } from "@/lib/supabase-admin";
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
    const { id, newId, previous, ...access } = permissions
      .extend({
        id: z.uuid(),
        newId: z.string().trim().toLowerCase().pipe(z.uuid()).optional(),
        previous: permissions,
      })
      .parse(await request.json());
    validateOwnAccess(actor.id, id, access);
    const changedId = newId && newId !== id ? newId : null;
    let verifiedEmail: string | undefined;
    if (changedId) {
      if (actor.id === id)
        throw new HttpError(
          400,
          "Outro administrador deve alterar o UUID da sua conta.",
        );
      const user = await db.adminUser.findUnique({
        where: { id },
        select: { email: true },
      });
      if (!user)
        throw new HttpError(
          409,
          "O usuário foi alterado ou removido. Recarregue a página.",
        );
      if (
        await db.adminUser.findUnique({
          where: { id: changedId },
          select: { id: true },
        })
      )
        throw new HttpError(
          409,
          "Este UUID já está vinculado a outro usuário no painel.",
        );
      await verifySupabaseIdentity(changedId, user.email);
      verifiedEmail = user.email;
    }

    try {
      await db.$transaction(async (tx) => {
        const { count } = await tx.adminUser.updateMany({
          where: {
            id,
            ...previous,
            ...(verifiedEmail ? { email: verifiedEmail } : {}),
          },
          data: { ...access, ...(changedId ? { id: changedId } : {}) },
        });
        if (!count)
          throw new HttpError(
            409,
            "O usuário foi alterado ou removido. Recarregue a página e tente novamente.",
          );
        if (
          changedId ||
          previous.role !== access.role ||
          previous.active !== access.active
        )
          await tx.auditLog.create({
            data: {
              actorId: actor.id,
              action: "ADMIN_USER_UPDATE",
              entityId: changedId ?? id,
              snapshot: {
                previous,
                current: access,
                ...(changedId ? { uuid: { from: id, to: changedId } } : {}),
              },
            },
          });
      });
    } catch (error) {
      if (
        changedId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new HttpError(
          409,
          "Este UUID já está vinculado a outro usuário no painel.",
        );
      throw error;
    }
    return Response.json({ ok: true, id: changedId ?? id });
  } catch (error) {
    return apiError(error);
  }
}
