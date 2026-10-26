import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { apiError, checkOrigin, HttpError } from "@/lib/security";
import { shipmentSchema } from "@/lib/validation";
export async function POST(
  request: Request,
  c: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const actor = await requireAdmin(["ADMIN", "OPERATOR"]);
    const { id } = await c.params;
    const data = shipmentSchema
      .pick({ cnpj_remetente: true, serie_nf: true, numero_nf: true })
      .parse(await request.json());
    await db.$transaction(async (tx) => {
      const s = await tx.shipment.findUnique({ where: { id } });
      if (!s) throw new HttpError(404, "Remessa não encontrada");
      if (s.senderDocument !== data.cnpj_remetente)
        throw new HttpError(400, "Emitente deve corresponder à remessa");
      await tx.shipmentInvoice.create({
        data: {
          shipmentId: id,
          issuerDocument: data.cnpj_remetente,
          series: String(Number(data.serie_nf)),
          number: String(Number(data.numero_nf)),
        },
      });
      await tx.auditLog.create({
        data: { actorId: actor.id, action: "INVOICE_ATTACH", entityId: id },
      });
    });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
