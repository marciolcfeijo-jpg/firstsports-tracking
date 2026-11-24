import { requireAdmin } from "@/lib/auth";
import { importOrders, updateOrderStage } from "@/lib/orders";
import { apiError, checkOrigin, HttpError, noStore } from "@/lib/security";

import { MAX_BYTES } from "@/lib/imports";
import { limitedFormData } from "@/lib/uploads";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireAdmin(["ADMIN", "OPERATOR"]);
    if (Number(request.headers.get("content-length")) > MAX_BYTES)
      throw new HttpError(413, "Arquivo excede o limite");
    const form = await limitedFormData(request, MAX_BYTES);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 4 * 1024 * 1024)
      throw new HttpError(400, "Selecione uma planilha de até 4 MB");
    const result = await importOrders(
      Buffer.from(await file.arrayBuffer()),
      file.name,
      user.id,
    );
    return Response.json(result, {
      status: result.errors.length ? 422 : 200,
      headers: noStore,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireAdmin(["ADMIN", "OPERATOR", "SALES"]);
    await updateOrderStage(
      await request.json(),
      user.id,
      user.role === "SALES" ? user.id : undefined,
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
