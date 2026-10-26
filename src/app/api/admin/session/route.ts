import { supabase, requireAdmin } from "@/lib/auth";
import { apiError, checkOrigin, rateLimit, HttpError } from "@/lib/security";
import { z } from "zod";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await rateLimit("login:global", 30, 300);
    const body = z
      .object({
        email: z.email().max(254),
        password: z.string().min(1).max(256),
      })
      .parse(await request.json());
    const client = await supabase();
    const { error } = await client.auth.signInWithPassword(body);
    if (error) throw new HttpError(401, "E-mail ou senha inválidos");
    try {
      await requireAdmin();
    } catch (e) {
      await client.auth.signOut();
      throw e;
    }
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    await (await supabase()).auth.signOut();
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
