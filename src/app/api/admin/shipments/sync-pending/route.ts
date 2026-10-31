import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { apiError, checkOrigin, noStore, rateLimit } from "@/lib/security";
import {
  bulkSummary,
  startBulkSync,
  processBulkSync,
  pauseBulkSync,
  retryBlockedCarriers,
} from "@/lib/bulk-sync";
export const runtime = "nodejs";
export const maxDuration = 120;
const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    shipmentIds: z
      .array(z.string().trim().min(1).max(128))
      .min(1)
      .max(50)
      .optional(),
  }),
  z.object({ action: z.literal("next"), runId: z.uuid() }),
  z.object({ action: z.literal("pause"), runId: z.uuid() }),
  z.object({ action: z.literal("retry"), runId: z.uuid() }),
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
      return Response.json(await startBulkSync(actor.id, body.shipmentIds), {
        headers: noStore,
      });
    }
    if (body.action === "retry") {
      await rateLimit("bulk-sync:retry:" + actor.id, 3, 60);
      return Response.json(await retryBlockedCarriers(body.runId, actor.id), {
        headers: noStore,
      });
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
