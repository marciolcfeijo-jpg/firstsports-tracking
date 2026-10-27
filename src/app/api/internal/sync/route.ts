import { apiError, HttpError, secretMatches } from "@/lib/security";
import { syncDue } from "@/lib/sync";
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
async function run(r: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32)
      throw new HttpError(503, "Scheduler não configurado");
    if (
      !secretMatches(r.headers.get("authorization") || "", "Bearer " + secret)
    )
      throw new HttpError(401, "Não autorizado");
    return Response.json(await syncDue());
  } catch (e) {
    return apiError(e);
  }
}

// Vercel Cron invokes GET; external schedulers may continue using POST.
export async function GET(r: Request) {
  return run(r);
}
export async function POST(r: Request) {
  return run(r);
}
