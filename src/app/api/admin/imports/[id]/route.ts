import { requireAdmin } from "@/lib/auth";
import { apiError, checkOrigin, HttpError, noStore } from "@/lib/security";
import { db } from "@/lib/db";
import { confirmImport } from "@/lib/import-confirm";
export const maxDuration = 300;
export async function GET(_r: Request, c: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const batch = await db.importBatch.findUnique({
      where: { id: (await c.params).id },
      include: { rows: { orderBy: { line: "asc" } } },
    });
    if (!batch) throw new HttpError(404, "Importação não encontrada");
    return Response.json(batch, { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(r: Request, c: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(r);
    const actor = await requireAdmin(["ADMIN", "OPERATOR"]);
    return Response.json(await confirmImport((await c.params).id, actor.id));
  } catch (e) {
    return apiError(e);
  }
}
