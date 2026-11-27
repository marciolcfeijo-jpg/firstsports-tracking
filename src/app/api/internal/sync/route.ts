import { apiError, HttpError, secretMatches } from "@/lib/security";
import { scheduledTrackingBatches, syncDue } from "@/lib/sync";
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
async function run(r: Request, daily: boolean) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32)
      throw new HttpError(503, "Scheduler não configurado");
    if (
      !secretMatches(r.headers.get("authorization") || "", "Bearer " + secret)
    )
      throw new HttpError(401, "Não autorizado");
    const result = await syncDue(undefined, {
      maxBatches: daily ? scheduledTrackingBatches : 1,
    });
    if (daily)
      console.info("Scheduled tracking sync", {
        processed: result.processed,
        succeeded: result.results.filter(({ ok }) => ok).length,
      });
    return Response.json(result);
  } catch (e) {
    return apiError(e);
  }
}

// Vercel Cron invokes GET; external schedulers may continue using POST.
export async function GET(r: Request) {
  return run(r, true);
}
export async function POST(r: Request) {
  return run(r, false);
}
