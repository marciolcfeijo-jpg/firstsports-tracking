import { apiError, HttpError, noStore, secretMatches } from "@/lib/security";
import { syncZenlogPendingPage } from "@/lib/zenlog-pending-sync";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function run(request: Request, daily: boolean) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32)
      throw new HttpError(503, "Scheduler não configurado.");
    if (
      !secretMatches(
        request.headers.get("authorization") || "",
        "Bearer " + secret,
      )
    )
      throw new HttpError(401, "Não autorizado.");
    const result = await syncZenlogPendingPage({ daily });
    console.info("ZenLOG pending sync", result);
    return Response.json(result, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(request: Request) {
  return run(request, true);
}

export async function POST(request: Request) {
  return run(request, false);
}
