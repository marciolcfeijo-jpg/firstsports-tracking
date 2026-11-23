import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageAdmin } from "@/lib/page-auth";
import { salesOrdersWhere, salesShipmentsWhere } from "@/lib/sales-portfolio";
import { orderStageLabels } from "@/lib/order-status";
import { dateTime, statusLabels } from "@/lib/status";

export default async function SalesPortfolio({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pedido?: string }>;
}) {
  const seller = await requirePageAdmin(["SALES"]);
  const params = await searchParams;
  const query =
    typeof params.pedido === "string" ? params.pedido.trim().slice(0, 120) : "";
  const requested = Number(params.page);
  const page =
    Number.isSafeInteger(requested) && requested > 0
      ? Math.min(requested, 100_000)
      : 1;
  const orders = await db.order.findMany({
    where: {
      ...salesOrdersWhere(seller.id),
      ...(query ? { number: query } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * 50,
    take: 51,
    select: {
      id: true,
      number: true,
      stage: true,
      createdAt: true,
      customer: { select: { name: true } },
      shipments: {
        where: salesShipmentsWhere(seller.id),
        select: { status: true, invoices: { select: { number: true } } },
      },
    },
  });
  const pageLink = (next: number) =>
    "?" + new URLSearchParams({ pedido: query, page: String(next) });
  return (
    <>
      <div className="page-heading">
        <h1>Minha carteira</h1>
      </div>
      <form className="toolbar">
        <input
          name="pedido"
          aria-label="Número do pedido"
          placeholder="Número do pedido"
          maxLength={120}
          defaultValue={query}
        />
        <button className="button secondary">Buscar</button>
      </form>
      {orders.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Pedido</th>
                <th scope="col">Cliente</th>
                <th scope="col">Etapa e NFs da carteira</th>
                <th scope="col">Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 50).map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link
                      className="shipment-order-link"
                      href={`/admin/carteira/${order.id}`}
                    >
                      {order.number}
                    </Link>
                  </td>
                  <td>{order.customer.name}</td>
                  <td>
                    {order.shipments.length
                      ? order.shipments
                          .map(
                            ({ invoices, status }) =>
                              `NF ${invoices.map(({ number }) => number).join(", ")} · ${statusLabels[status]}`,
                          )
                          .join(" / ")
                      : order.stage
                        ? orderStageLabels[order.stage]
                        : "Sem remessa na carteira"}
                  </td>
                  <td>{dateTime(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Nenhum pedido encontrado na sua carteira.</p>
      )}
      <nav className="actions spaced" aria-label="Paginação da carteira">
        {page > 1 && (
          <Link className="button secondary" href={pageLink(page - 1)}>
            Anterior
          </Link>
        )}
        {orders.length > 50 && (
          <Link className="button secondary" href={pageLink(page + 1)}>
            Próxima
          </Link>
        )}
      </nav>
    </>
  );
}
