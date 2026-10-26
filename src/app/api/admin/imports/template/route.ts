import { requireAdmin } from "@/lib/auth";
import { apiError } from "@/lib/security";
import { template } from "@/lib/imports";
export async function GET() {
  try {
    await requireAdmin();
    const bytes = await template();
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=modelo-firstsports.xlsx",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
