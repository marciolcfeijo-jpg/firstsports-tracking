import { db } from "@/lib/db";
import { z } from "zod";
import {
  apiError,
  checkOrigin,
  documentHash,
  HttpError,
  rateLimit,
  noStore,
} from "@/lib/security";
import { validDocument } from "@/lib/validation";
import { issueLink } from "@/lib/shipments";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = z
      .object({
        number: z.string().trim().min(1).max(120),
        document: z.string().max(25).refine(validDocument),
      })
      .parse(await request.json());
    // Database-backed global and document quotas cannot be bypassed by spoofing forwarded IP headers.
    await rateLimit("lookup:global", 300, 60);
    await rateLimit("lookup:" + documentHash(body.document), 8, 900);
    const shipments = await db.shipment.findMany({
      where: {
        order: { customer: { documentHash: documentHash(body.document) } },
        OR: [
          { order: { number: body.number } },
          {
            invoices: {
              some: {
                number: /^\d+$/.test(body.number)
                  ? String(Number(body.number))
                  : body.number,
              },
            },
          },
        ],
      },
      select: { id: true },
      take: 30,
    });
    if (!shipments.length)
      throw new HttpError(
        404,
        "Não foi possível validar a consulta. Confira os dados ou solicite um link seguro.",
      );
    const links = [];
    for (const s of shipments)
      links.push({
        url: "/rastreio/" + (await issueLink(s.id, "PUBLIC_LOOKUP")),
      });
    return Response.json({ links }, { headers: noStore });
  } catch (e) {
    return apiError(e);
  }
}
