"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  customerStatePlan,
  parseCustomerStates,
} from "@/lib/customer-state-import";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/security";

export async function importCustomerStates(form: FormData) {
  try {
    const actor = await requireAdmin(["ADMIN", "OPERATOR"]);
    const file = form.get("arquivo");
    if (!(file instanceof File) || !file.size || file.size > 300_000)
      throw new HttpError(400, "Selecione um arquivo de texto de até 300 KB.");

    const rows = parseCustomerStates(await file.text());
    const confirmation = form.get("confirmacao");
    if (confirmation === null) {
      const plan = await customerStatePlan(db, rows);
      return {
        detail: plan.detail,
        summary: plan.summary,
        confirmation: plan.confirmation,
        canApply: Boolean(plan.updates.length || plan.inserts.length),
      };
    }

    const result = await db.$transaction(
      async (tx) => {
        const plan = await customerStatePlan(tx, rows);
        if (plan.confirmation !== confirmation)
          throw new HttpError(
            409,
            "Os cadastros mudaram. Consulte a prévia novamente.",
          );

        const updated = plan.updates.length
          ? await tx.$executeRaw`
            UPDATE public."Customer" c
            SET state = data.state, "erpCode" = data.code, "updatedAt" = NOW()
            FROM jsonb_to_recordset(${JSON.stringify(plan.updates)}::jsonb)
              AS data(id text, code text, state text)
            WHERE c.id = data.id
          `
          : 0;
        const created = plan.inserts.length
          ? (await tx.customer.createMany({ data: plan.inserts })).count
          : 0;
        if (updated !== plan.updates.length || created !== plan.inserts.length)
          throw new HttpError(
            409,
            "Os cadastros mudaram. Consulte a prévia novamente.",
          );
        if (updated || created)
          await tx.auditLog.create({
            data: {
              action: "CUSTOMER_STATE_IMPORT",
              actorId: actor.id,
              entityId: "clientes",
              snapshot: { updated, created },
            },
          });
        return { updated, created };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15_000,
      },
    );

    revalidatePath("/admin/clientes");
    return { updated: result.updated, created: result.created };
  } catch (error) {
    return {
      error:
        error instanceof HttpError
          ? error.message
          : "A importação não foi gravada. Consulte a prévia e tente novamente.",
    };
  }
}
