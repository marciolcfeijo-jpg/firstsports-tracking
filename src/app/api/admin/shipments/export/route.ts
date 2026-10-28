import { requireAdmin } from "@/lib/auth";
import { apiError } from "@/lib/security";
import { db } from "@/lib/db";
import { shipmentWhere } from "@/lib/filters";
const cell = (v: unknown) =>
  '"' +
  String(v ?? "")
    .replace(/^[=+@\-\t\r]/, "'$&")
    .replaceAll('"', '""') +
  '"';
export async function GET(r: Request) {
  try {
    await requireAdmin();
    const items = await db.shipment.findMany({
      where: shipmentWhere(new URL(r.url).searchParams),
      include: {
        order: true,
        invoices: true,
        carrier: true,
        seller: { select: { email: true } },
      },
      take: 10000,
      orderBy: { createdAt: "desc" },
    });
    const rows = [
      [
        "pedido",
        "notas_fiscais",
        "transportadora",
        "vendedor",
        "status",
        "previsao",
      ],
      ...items.map((s) => [
        s.order.number,
        s.invoices.map((i) => i.number).join(" / "),
        s.carrier.name,
        s.seller?.email || "",
        s.status,
        s.estimatedDelivery?.toISOString(),
      ]),
    ];
    return new Response(
      "\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n"),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=remessas.csv",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (e) {
    return apiError(e);
  }
}
