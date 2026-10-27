import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { apiError, checkOrigin, noStore, rateLimit } from "@/lib/security";
import {
  bulkSummary,
  startBulkSync,
  processBulkSync,
  pauseBulkSync,
} from "@/lib/bulk-sync";
export const runtime = "nodejs";
export const maxDuration = 120;
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("next"), runId: z.uuid() }),
  z.object({ action: z.literal("pause"), runId: z.uuid() }),
]);
export async function GET() {
  try {
    await requireAdmin();
    return Response.json(await bulkSummary(), { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const actor = await requireAdmin(["ADMIN", "OPERATOR"]);
    const body = actionSchema.parse(await request.json());
    if (body.action === "start") {
      await rateLimit("bulk-sync:start:" + actor.id, 3, 60);
      return Response.json(await startBulkSync(actor.id), { headers: noStore });
    }
    return Response.json(
      await (body.action === "next"
        ? processBulkSync(body.runId, actor.id)
        : pauseBulkSync(body.runId, actor.id)),
      { headers: noStore },
    );
  } catch (error) {
    return apiError(error);
  }
}
