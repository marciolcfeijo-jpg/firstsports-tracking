import {
  apiError,
  checkOrigin,
  documentHash,
  rateLimit,
  noStore,
} from "@/lib/security";
import { trackingLookupSchema } from "@/lib/validation";
import { lookupInvoice } from "@/lib/tracking-lookup";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = trackingLookupSchema.parse(await request.json());
    await rateLimit("lookup:global", 300, 60);
    await rateLimit("lookup:" + documentHash(body.document), 8, 900);
    return Response.json(await lookupInvoice(body), { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}
