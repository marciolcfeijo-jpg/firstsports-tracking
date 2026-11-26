"use server";

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
