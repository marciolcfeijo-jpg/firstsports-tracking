"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { HttpError, rateLimit } from "@/lib/security";
import { importZenlogPage } from "@/lib/zenlog-import";
import { zenlogPageSize } from "@/lib/zenlog";

export async function importZenlog(
  _previous: { message: string; error?: boolean } | null,
  formData: FormData,
) {
  try {
    const actor = await requireAdmin(["ADMIN", "OPERATOR"]);
    const rawOrder = formData.get("pedido");
    const order = typeof rawOrder === "string" ? rawOrder.trim() : "";
    const page = Number(formData.get("pagina"));
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 100_000 ||
      order.length > 20
    )
      throw new HttpError(400, "Confira o pedido e a página selecionada.");
    await rateLimit("zenlog:import:global", 20, 60);
    await rateLimit("zenlog:import:" + actor.id, 10, 60);
    const onlyNew = formData.get("filtro") === "novos";
    const result = await importZenlogPage(
      (page - 1) * zenlogPageSize,
      order,
      actor.id,
      { onlyNew },
    );
    revalidatePath("/admin/pedidos");
    revalidatePath("/admin/carteira");
    return {
      message: [
        `Pedidos criados: ${result.created}`,
        onlyNew
          ? `Já estavam no portal: ${result.alreadyInPortal}`
          : `Pedidos reaproveitados: ${result.reused}`,
        `NFs vinculadas: ${result.linked}`,
        `NFs já vinculadas: ${result.existing}`,
        `NFs para revisão: ${result.pending}`,
        `Registros não importados: ${result.skipped}`,
      ].join(" · "),
    };
  } catch (error) {
    return {
      error: true,
      message:
        error instanceof HttpError && error.status < 600
          ? error.message
          : "A importação foi interrompida. Você pode repetir a página para concluir os registros restantes.",
    };
  }
}

export async function linkZenlogInvoice(
  _previous: { message: string; error?: boolean } | null,
  formData: FormData,
) {
  try {
    const actor = await requireAdmin(["ADMIN", "OPERATOR"]);
    const parsed = z
      .object({
        orderId: z.string().min(1).max(100),
        invoiceHash: z.string().regex(/^[a-f0-9]{64}$/),
        invoiceNumber: z.string().regex(/^\d{1,9}$/),
      })
      .safeParse({
        orderId: formData.get("orderId"),
        invoiceHash: formData.get("invoiceHash"),
        invoiceNumber: formData.get("invoiceNumber"),
      });
    if (!parsed.success)
      throw new HttpError(400, "Atualize a prévia para conferir esta NF.");
    const target = parsed.data;
    const order = await db.order.findUnique({
      where: { id: target.orderId },
      select: { number: true, stage: true },
    });
    if (!order || order.number.length > 20 || order.stage === "CANCELLED")
      throw new HttpError(409, "Confira o pedido antes de vincular a NF.");
    await rateLimit("zenlog:import:global", 20, 60);
    await rateLimit("zenlog:import:" + actor.id, 10, 60);
    const result = await importZenlogPage(0, order.number, actor.id, {
      target,
    });
    if (!result.linked && !result.existing)
      throw new HttpError(
        409,
        result.pending
          ? "NF pendente de revisão. Confira os dados fiscais ou o vínculo existente."
          : "Não foi possível confirmar esta NF neste pedido. Atualize a prévia.",
      );
    revalidatePath("/admin/pedidos");
    revalidatePath("/admin/carteira");
    return {
      message: result.linked
        ? "NF vinculada ao pedido."
        : "A NF já estava vinculada ao pedido.",
    };
  } catch (error) {
    return {
      error: true,
      message:
        error instanceof HttpError
          ? error.message
          : "Não foi possível concluir o vínculo. Tente novamente.",
    };
  }
}
