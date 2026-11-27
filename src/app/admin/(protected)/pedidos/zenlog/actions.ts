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
        ...result.issues,
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
        orderId: z
          .string()
          .max(100)
          .transform((value) => value || undefined),
        orderNumber: z.string().trim().min(1).max(20),
        recipientRef: z.string().regex(/^[a-f0-9]{64}$/),
        invoiceHash: z.string().regex(/^[a-f0-9]{64}$/),
        invoiceNumber: z.string().regex(/^\d{1,9}$/),
      })
      .safeParse({
        orderId: formData.get("orderId") ?? "",
        orderNumber: formData.get("orderNumber"),
        recipientRef: formData.get("recipientRef"),
        invoiceHash: formData.get("invoiceHash"),
        invoiceNumber: formData.get("invoiceNumber"),
      });
    if (!parsed.success)
      throw new HttpError(400, "Atualize a prévia para conferir esta NF.");
    const target = parsed.data;
    if (target.orderId) {
      const order = await db.order.findUnique({
        where: { id: target.orderId },
        select: { number: true, stage: true },
      });
      if (
        !order ||
        order.number !== target.orderNumber ||
        order.stage === "CANCELLED"
      )
        throw new HttpError(409, "Confira o pedido antes de vincular a NF.");
    }
    await rateLimit("zenlog:import:global", 20, 60);
    await rateLimit("zenlog:import:" + actor.id, 10, 60);
    const result = await importZenlogPage(0, target.orderNumber, actor.id, {
      target,
    });
    if (!result.linked && !result.existing)
      throw new HttpError(
        409,
        result.pending || result.issues.length
          ? result.issues.join(" ") ||
              "O ZenLOG retornou uma NF com dados fiscais incompletos."
          : "Não foi possível confirmar esta NF neste pedido. Atualize a prévia.",
      );
    revalidatePath("/admin/pedidos");
    revalidatePath("/admin/carteira");
    return {
      orderId: result.linkedOrderId,
      message: result.linked
        ? result.created
          ? "Pedido importado e NF vinculada."
          : "NF vinculada ao pedido."
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

export async function syncOrderInvoices(
  _previous: { message: string; error?: boolean } | null,
  formData: FormData,
) {
  try {
    const actor = await requireAdmin(["ADMIN", "OPERATOR"]);
    const id = z.string().min(1).max(100).parse(formData.get("orderId"));
    const order = await db.order.findUnique({
      where: { id },
      select: { number: true, stage: true },
    });
    if (!order || order.stage === "CANCELLED" || order.number.length > 20)
      throw new HttpError(409, "Confira o pedido antes de vincular a NF.");

    await rateLimit("zenlog:import:global", 20, 60);
    await rateLimit("zenlog:import:" + actor.id, 10, 60);
    const result = await importZenlogPage(0, order.number, actor.id, {
      target: { orderId: id },
    });
    revalidatePath("/admin/pedidos");
    revalidatePath("/admin/pedidos/" + id);
    revalidatePath("/admin/carteira");
    const issues = result.issues.join(" ");
    if (result.linked)
      return {
        message:
          (result.linked === 1
            ? "NF vinculada ao pedido."
            : result.linked + " NFs vinculadas ao pedido.") +
          (issues ? " " + issues : ""),
      };
    if (issues) return { error: true, message: issues };
    return {
      message: result.existing
        ? "As NFs encontradas já estão vinculadas ao pedido."
        : "Nenhuma NF foi encontrada no ZenLOG para este pedido e destinatário.",
    };
  } catch (error) {
    return {
      error: true,
      message:
        error instanceof HttpError
          ? error.message
          : "A consulta ao ZenLOG falhou. Tente novamente.",
    };
  }
}
