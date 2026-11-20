import { requireAdmin } from "@/lib/auth";
import { apiError, noStore } from "@/lib/security";
import { orderImportTemplate } from "@/lib/order-import-template";

export async function GET() {
  try {
    await requireAdmin(["ADMIN", "OPERATOR"]);
    return new Response(await orderImportTemplate(), {
      headers: {
        ...noStore,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="modelo-pedidos.xlsx"',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
