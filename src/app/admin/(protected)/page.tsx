import { db } from "@/lib/db";
import { requirePageAdmin } from "@/lib/page-auth";
import { shipmentWhere } from "@/lib/filters";
import { Filters } from "@/components/filters";
import { statusLabels, dateTime } from "@/lib/status";
import Link from "next/link";
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requirePageAdmin();
  const p = await searchParams;
  const where = shipmentWhere(new URLSearchParams(p));
  const base = await db.shipment.findMany({
    where,
    include: { carrier: true, order: true },
    orderBy: { updatedAt: "desc" },
  });
  const delivered = base.filter((s) => s.status === "DELIVERED"),
    open = base.filter(
      (s) => !["DELIVERED", "RETURNED", "CANCELLED"].includes(s.status),
    ),
    late = open.filter(
      (s) => s.estimatedDelivery && s.estimatedDelivery < new Date(),
    ),
    ontime = delivered.filter(
      (s) =>
        s.deliveredAt &&
        s.estimatedDelivery &&
        s.deliveredAt <= s.estimatedDelivery,
    ),
    failed = new Set(
      base.filter((s) => s.lastSyncError).map((s) => s.carrierId),
    ).size;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Painel de controle</div>
          <h1>Visão geral das entregas</h1>
          <p>Acompanhe a operação e identifique o que precisa de atenção.</p>
        </div>
        <Link href="/admin/importacoes" className="button">
          Importar pedidos
        </Link>
      </div>
      <Filters values={p} />
      <div className="grid-3">
        {[
          ["Total de remessas", base.length],
          ["Remessas em aberto", open.length],
          ["Entregues", delivered.length],
          ["Em atraso", late.length],
          [
            "Com ocorrências",
            base.filter((s) => s.status === "EXCEPTION").length,
          ],
          ["Entregues dentro do prazo", ontime.length],
          ["Transportadoras com falha", failed],
        ].map(([label, n]) => (
          <div key={label} className="card metric">
            <p>{label}</p>
            <h2>{n}</h2>
          </div>
        ))}
      </div>
      <div className="page-heading spaced">
        <h2>Últimas atualizações</h2>
        <Link className="text-blue-600 small" href="/admin/remessas">
          Ver todas →
        </Link>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Transportadora</th>
              <th>Status</th>
              <th>Atualização</th>
            </tr>
          </thead>
          <tbody>
            {base.slice(0, 8).map((s) => (
              <tr key={s.id}>
                <td>
                  <Link
                    href={"/admin/remessas/" + s.id}
                    className="text-blue-600"
                  >
                    {s.order.number}
                  </Link>
                </td>
                <td>{s.carrier.name}</td>
                <td>
                  <span className={"badge " + s.status}>
                    {statusLabels[s.status]}
                  </span>
                </td>
                <td>{dateTime(s.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!base.length && (
          <div className="empty">
            Nenhuma remessa cadastrada. Importe uma planilha ou cadastre a
            primeira entrega.
          </div>
        )}
      </div>
    </>
  );
}
