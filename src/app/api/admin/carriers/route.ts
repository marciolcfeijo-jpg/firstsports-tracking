import { setCarrierEnabled } from "@/lib/carriers";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, checkOrigin } from "@/lib/security";
import { z } from "zod";
export async function GET() {
  try {
    await requireAdmin();
    return Response.json(
      await db.carrier.findMany({ orderBy: { name: "asc" } }),
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(r: Request) {
  try {
    checkOrigin(r);
    const user = await requireAdmin(["ADMIN"]);
    const body = z
      .object({ id: z.string(), enabled: z.boolean() })
      .parse(await r.json());
    await setCarrierEnabled(body.id, body.enabled, user.id);
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
