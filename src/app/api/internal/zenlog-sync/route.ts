import { apiError, HttpError, noStore, secretMatches } from "@/lib/security";
import { syncZenlogDaily } from "@/lib/zenlog-daily-sync";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32)
      throw new HttpError(503, "Scheduler não configurado");
    if (
      !secretMatches(
        request.headers.get("authorization") || "",
        "Bearer " + secret,
      )
    )
      throw new HttpError(401, "Não autorizado");
    const result = await syncZenlogDaily();
    console.info("ZenLOG daily sync", result);
    return Response.json(result, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}
