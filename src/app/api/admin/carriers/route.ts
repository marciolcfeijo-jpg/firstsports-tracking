import { setCarrierCnpj, setCarrierEnabled } from "@/lib/carriers";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiError, checkOrigin, HttpError } from "@/lib/security";
import { digits, validDocument } from "@/lib/validation";
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
    const parsed = z
      .union([
        z.strictObject({ id: z.string(), enabled: z.boolean() }),
        z.strictObject({
          id: z.string(),
          cnpj: z
            .string()
            .trim()
            .refine(
              (value) =>
                value === "" ||
                (/^(?:\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/.test(value) &&
                  validDocument(digits(value))),
            )
            .transform(digits),
        }),
      ])
      .safeParse(await r.json());
    if (!parsed.success) throw new HttpError(400, "Confira o CNPJ informado.");
    const body = parsed.data;
    if ("cnpj" in body) {
      await setCarrierCnpj(body.id, body.cnpj || null, user.id);
    } else {
      await setCarrierEnabled(body.id, body.enabled, user.id);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
