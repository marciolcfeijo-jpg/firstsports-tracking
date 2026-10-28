import { BulkTracking } from "@/components/bulk-tracking";
import { requirePageAdmin } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { shipmentWhere } from "@/lib/filters";
import { Filters } from "@/components/filters";
import { dateTime, dateOnly, statusLabels } from "@/lib/status";
import Link from "next/link";
export default async function Shipments({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const user = await requirePageAdmin();
  const p = await searchParams;
  const page = Math.max(1, Number(p.page) || 1),
    where = shipmentWhere(new URLSearchParams(p));
  const [items, total] = await Promise.all([
    db.shipment.findMany({
      where,
      include: {
        carrier: true,
        seller: { select: { email: true } },
        order: { include: { customer: true } },
        invoices: true,
      },
      take: 50,
      skip: (page - 1) * 50,
      orderBy: { createdAt: p.sort === "asc" ? "asc" : "desc" },
    }),
    db.shipment.count({ where }),
  ]);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Remessas</h1>
          <p>{total} remessa(s) encontrada(s)</p>
        </div>
        <div className="actions">
          <a
            href={"/api/admin/shipments/export?" + new URLSearchParams(p)}
            className="button secondary"
          >
            Exportar CSV
          </a>
          <Link href="/admin/remessas/nova" className="button">
            + Nova remessa
          </Link>
        </div>
      </div>
      {user.role !== "VIEWER" && <BulkTracking />}
      <Filters values={p} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[
                "Pedido / NF",
                "Cliente",
                "Transportadora",
                "Vendedor / representante",
                "Emissão",
                "Previsão",
                "Status",
                "Última consulta",
                "Ações",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.order.number}</strong>
                  <br />
                  <span className="muted">
                    NF {s.invoices.map((i) => i.number).join(", ")}
                  </span>
                </td>
                <td>{s.order.customer.name}</td>
                <td>{s.carrier.name}</td>
                <td>{s.seller?.email || "Sem vendedor"}</td>
                <td>{dateOnly(s.issuedAt)}</td>
                <td>{dateOnly(s.estimatedDelivery)}</td>
                <td>
                  <span className={"badge " + s.status}>
                    {statusLabels[s.status]}
                  </span>
                </td>
                <td>{dateTime(s.lastSyncedAt)}</td>
                <td>
                  <Link
                    className="text-[var(--brand-purple-dark)]"
                    href={"/admin/remessas/" + s.id}
                  >
                    Visualizar →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && (
          <div className="empty">Nenhuma remessa encontrada.</div>
        )}
      </div>
      <div className="actions spaced">
        {page > 1 && (
          <Link
            className="button secondary"
            href={"?" + new URLSearchParams({ ...p, page: String(page - 1) })}
          >
            Anterior
          </Link>
        )}
        {page * 50 < total && (
          <Link
            className="button secondary"
            href={"?" + new URLSearchParams({ ...p, page: String(page + 1) })}
          >
            Próxima
          </Link>
        )}
      </div>
    </>
  );
}
