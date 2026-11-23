import {
  agedOrdersWithoutShipments,
  pendingOrderFilter,
  pendingOrderLabels,
  reportDays,
} from "@/lib/operational-report";
import Link from "next/link";
import { ShipmentRow } from "@/components/shipment-row";
import { db } from "@/lib/db";
import { orderStatus } from "@/lib/order-status";
import { requirePageAdmin } from "@/lib/page-auth";
import { dateTime } from "@/lib/status";

export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<{
    pedido?: string | string[];
    pendingDays?: string | string[];
    pending?: string | string[];
    page?: string | string[];
  }>;
}) {
  const user = await requirePageAdmin();
  const { pedido, pendingDays, pending, page: pageParam } = await searchParams;
  const filter = pendingOrderFilter(pending);
  const days =
    typeof pendingDays === "string" || filter
      ? reportDays(typeof pendingDays === "string" ? pendingDays : null)
      : null;
  const requestedPage = Number(pageParam);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage >= 1
      ? Math.min(requestedPage, 100_000)
      : 1;
  const number = typeof pedido === "string" ? pedido.trim().slice(0, 120) : "";
  const orders = await db.order.findMany({
    where: {
      ...(number ? { number } : {}),
      ...(days ? agedOrdersWithoutShipments(new Date(), days, filter) : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      number: true,
      stage: true,
      createdAt: true,
      customer: { select: { name: true } },
      shipments: { select: { status: true } },
    },
    take: 51,
    skip: (page - 1) * 50,
  });

  function pageHref(nextPage: number) {
    const query = new URLSearchParams({ page: String(nextPage) });
    if (number) query.set("pedido", number);
    if (days) query.set("pendingDays", String(days));
    if (filter) query.set("pending", filter);
    return "?" + query;
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {filter
              ? pendingOrderLabels[filter]
              : days
                ? "Pedidos sem remessa"
                : "Pedidos"}
          </h1>
          {days && <p>Pedidos em aberto cadastrados há {days} dias ou mais.</p>}
        </div>
        {user.role !== "VIEWER" && (
          <Link className="button" href="/admin/pedidos/importar">
            Importar pedidos
          </Link>
        )}
      </div>
      <form className="card mb-4">
        {filter && <input type="hidden" name="pending" value={filter} />}
        {days && <input type="hidden" name="pendingDays" value={days} />}
        <label className="field">
          Número do pedido
          <input name="pedido" defaultValue={number} maxLength={120} />
        </label>
        <button className="button">Buscar pedido</button>
      </form>
      {orders.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Status</th>
                <th>Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 50).map((order) => (
                <ShipmentRow key={order.id} href={`/admin/pedidos/${order.id}`}>
                  <td>
                    <Link
                      className="shipment-order-link"
                      href={`/admin/pedidos/${order.id}`}
                    >
                      {order.number}
                    </Link>
                  </td>
                  <td>{order.customer.name}</td>
                  <td>{orderStatus(order.stage, order.shipments)}</td>
                  <td>{dateTime(order.createdAt)}</td>
                </ShipmentRow>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Nenhum pedido encontrado.</p>
      )}
      <div className="actions spaced">
        {page > 1 && (
          <Link className="button secondary" href={pageHref(page - 1)}>
            Anterior
          </Link>
        )}
        {orders.length > 50 && (
          <Link className="button secondary" href={pageHref(page + 1)}>
            Próxima
          </Link>
        )}
        {days && <Link href="/admin/pedidos">Todos os pedidos</Link>}
      </div>
    </>
  );
}
