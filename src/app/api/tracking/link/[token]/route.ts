import { db } from "@/lib/db";
import {
  apiError,
  hashToken,
  HttpError,
  noStore,
  rateLimit,
} from "@/lib/security";
import { publicInclude, publicShipment } from "@/lib/shipments";
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    await rateLimit("link:global", 600, 60);
    const { token } = await context.params;
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new HttpError(404, "Link inválido ou expirado");
    const link = await db.trackingLink.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { shipment: { include: publicInclude } },
    });
    if (!link || link.revokedAt || link.expiresAt < new Date())
      throw new HttpError(404, "Link inválido ou expirado");
    return Response.json(publicShipment(link.shipment), { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}
