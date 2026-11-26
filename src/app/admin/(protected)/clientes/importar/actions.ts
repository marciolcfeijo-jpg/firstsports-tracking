"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePortfolio, portfolioPlan } from "@/lib/customer-portfolio-import";
import { HttpError } from "@/lib/security";

export async function importPortfolio(form: FormData) {
  try {
    const actor = await requireAdmin(["ADMIN", "OPERATOR"]);
    const file = form.get("arquivo");
    if (!(file instanceof File) || !file.size || file.size > 300_000)
      throw new HttpError(400, "Selecione um arquivo de texto de até 300 KB.");
    const rows = parsePortfolio(await file.text());
    const confirmation = form.get("confirmacao");
    if (confirmation === null) {
      const { detail, summary, confirmation } = await portfolioPlan(db, rows);
      return { detail, summary, confirmation };
    }
    const updated = await db.$transaction(
      async (tx) => {
        const plan = await portfolioPlan(tx, rows);
        if (plan.confirmation !== confirmation)
          throw new HttpError(
            409,
            "Os vínculos mudaram. Consulte a prévia novamente.",
          );
        if (!plan.changes.length) return 0;
        const count = await tx.$executeRaw`
        UPDATE "Customer" c
        SET "erpCode" = data.code, "responsibleId" = data."responsibleId", "updatedAt" = NOW()
        FROM jsonb_to_recordset(${JSON.stringify(plan.changes)}::jsonb) AS data(id text, code text, "responsibleId" text)
        WHERE c.id = data.id
          AND (c."erpCode" IS NULL OR c."erpCode" = data.code)
          AND (c."responsibleId" IS NULL OR c."responsibleId" = data."responsibleId")
      `;
        if (count !== plan.changes.length)
          throw new HttpError(
            409,
            "Alguns vínculos mudaram. Consulte a prévia novamente.",
          );
        await tx.auditLog.create({
          data: {
            action: "CUSTOMER_PORTFOLIO_IMPORT",
            actorId: actor.id,
            entityId: "clientes",
            snapshot: { updated: count },
          },
        });
        return count;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15_000,
      },
    );
    revalidatePath("/admin/clientes");
    return { updated };
  } catch (error) {
    return {
      error:
        error instanceof HttpError
          ? error.message
          : "A importação não foi gravada. Consulte a prévia e tente novamente.",
    };
  }
}
