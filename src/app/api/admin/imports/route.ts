import { limitedFormData } from "@/lib/uploads";
import { requireAdmin } from "@/lib/auth";
import { apiError, checkOrigin, HttpError } from "@/lib/security";
import { db } from "@/lib/db";
import { MAX_BYTES, parseSpreadsheet } from "@/lib/imports";
export const runtime = "nodejs";
export async function GET() {
  try {
    await requireAdmin();
    return Response.json(
      await db.importBatch.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { _count: { select: { rows: true } } },
      }),
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requireAdmin(["ADMIN", "OPERATOR"]);
    if (Number(request.headers.get("content-length")) > MAX_BYTES + 65536)
      throw new HttpError(413, "Arquivo excede o limite");
    const form = await limitedFormData(request, MAX_BYTES + 65536);
    const file = form.get("file");
    if (!(file instanceof File) || file.size > MAX_BYTES)
      throw new HttpError(400, "Selecione um arquivo de até 5 MB");
    const carriers = await db.carrier.findMany({ select: { code: true } });
    const rows = await parseSpreadsheet(
      Buffer.from(await file.arrayBuffer()),
      file.name,
      carriers.map((c) => c.code),
    );
    const batch = await db.importBatch.create({
      data: {
        filename: file.name.slice(0, 160),
        createdBy: actor.id,
        rows: { create: rows },
      },
      include: { rows: { orderBy: { line: "asc" } } },
    });
    await db.auditLog.create({
      data: { actorId: actor.id, action: "IMPORT_PREVIEW", entityId: batch.id },
    });
    return Response.json(batch, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
