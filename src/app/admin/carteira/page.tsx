import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageAdmin } from "@/lib/page-auth";
import {
  salesOrdersWhere,
  salesPortfolioShipmentFilter,
} from "@/lib/sales-portfolio";
import { orderStageLabels } from "@/lib/order-status";
import {
  agedOrdersWithoutShipments,
  movementStatuses,
  pendingOrderFilter,
  pendingOrderLabels,
  reportDays,
  shipmentReportParams,
  shipmentReports,
} from "@/lib/operational-report";
import { dateOnly, dateTime, statusLabels } from "@/lib/status";

function textParam(value: string | string[] | undefined, limit = 120) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export default async function SalesPortfolio({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const seller = await requirePageAdmin(["SALES"]);
  const params = await searchParams;
  const query = textParam(params.pedido);
  const customer = textParam(params.cliente);
  const invoice = textParam(params.nf, 12);
  const stage = Object.keys(orderStageLabels).find(
    (key) => key === params.etapa,
  ) as keyof typeof orderStageLabels | undefined;
  const status = Object.keys(statusLabels).find((key) => key === params.status);
  const hasFilters = Boolean(query || customer || invoice || stage || status);
  const requested = Number(params.page);
  const page =
    Number.isSafeInteger(requested) && requested > 0
      ? Math.min(requested, 100_000)
      : 1;
  const report = shipmentReports.find(
    ({ id }) => id === params.report && id !== "no-seller",
  );
  const pending = report ? null : pendingOrderFilter(params.pending);
  const days = reportDays(typeof params.days === "string" ? params.days : null);
  const pendingDays = reportDays(
    typeof params.pendingDays === "string" ? params.pendingDays : null,
  );
  const filters = new URLSearchParams();
  const shipmentQuery = report
    ? shipmentReportParams(report, days)
    : new URLSearchParams();
  if (status) shipmentQuery.set("status", status);
  if (report) {
    filters.set("report", report.id);
    filters.set("days", String(days));
    if (typeof params.carrier === "string") {
      shipmentQuery.set("carrier", params.carrier);
      filters.set("carrier", params.carrier);
    }
  }
  if (pending) {
    filters.set("pending", pending);
    filters.set("pendingDays", String(pendingDays));
  }
  const now = new Date();
  const shipments = salesPortfolioShipmentFilter(
    seller.id,
    shipmentQuery,
    invoice,
    now,
  );
  const matchShipment = Boolean(report || invoice || status);
  const orders = await db.order.findMany({
    where: {
      ...salesOrdersWhere(seller.id),
      ...(query ? { number: query } : {}),
      ...(customer
        ? { customer: { name: { contains: customer, mode: "insensitive" } } }
        : {}),
      ...(stage ? { stage } : {}),
      ...(matchShipment ? { shipments: { some: shipments } } : {}),
      ...(pending
        ? { AND: [agedOrdersWithoutShipments(now, pendingDays, pending)] }
        : {}),
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
        where: shipments,
        select: {
          id: true,
          status: true,
          estimatedDelivery: true,
          carrier: { select: { name: true } },
          invoices: { select: { number: true } },
          events: {
            where: {
              status:
                report?.id === "stalled"
                  ? { in: movementStatuses }
                  : "EXCEPTION",
            },
            orderBy: { occurredAt: "desc" },
            take: 1,
            select: { occurredAt: true, dateOnly: true, description: true },
          },
        },
      },
    },
  });
  const pageLink = (next: number) =>
    "?" +
    new URLSearchParams({
      ...Object.fromEntries(filters),
      pedido: query,
      cliente: customer,
      nf: invoice,
      etapa: stage ?? "",
      status: status ?? "",
      page: String(next),
    });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {report?.label ??
              (pending ? pendingOrderLabels[pending] : "Minha carteira")}
          </h1>
          {report?.id === "stalled" && (
            <p>Última movimentação registrada há {days} dias ou mais.</p>
          )}
          {pending && <p>Pedidos cadastrados há {pendingDays} dias ou mais.</p>}
        </div>
        {(report || pending) && (
          <Link
            href={`/admin/carteira/relatorios?days=${pending ? pendingDays : days}`}
          >
            Voltar aos relatórios
          </Link>
        )}
      </div>
      <form className="toolbar">
        {[...filters].map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <input
          name="pedido"
          aria-label="Número do pedido"
          placeholder="Número do pedido"
          maxLength={120}
          defaultValue={query}
        />
        <input
          name="cliente"
          aria-label="Cliente"
          placeholder="Nome do cliente"
          maxLength={120}
          defaultValue={customer}
        />
        <input
          name="nf"
          aria-label="Número da NF"
          placeholder="Número da NF"
          inputMode="numeric"
          maxLength={12}
          defaultValue={invoice}
        />
        <select
          name="etapa"
          aria-label="Etapa do pedido"
          defaultValue={stage ?? ""}
        >
          <option value="">Todas as etapas do pedido</option>
          {Object.entries(orderStageLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="status"
          aria-label="Status da NF"
          defaultValue={status ?? ""}
        >
          <option value="">Todos os status da NF</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button className="button secondary">Filtrar</button>
        {hasFilters && (
          <Link
            className="button secondary"
            href={
              filters.size ? `/admin/carteira?${filters}` : "/admin/carteira"
            }
          >
            Limpar filtros
          </Link>
        )}
      </form>
      {orders.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Pedido</th>
                <th scope="col">Cliente</th>
                <th scope="col">Etapa do pedido</th>
                <th scope="col">NFs da carteira</th>
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
                    {order.stage
                      ? orderStageLabels[order.stage]
                      : "Sem etapa registrada"}
                  </td>
                  <td>
                    {order.shipments.length ? (
                      <ul className="space-y-2">
                        {order.shipments.map((shipment) => (
                          <li key={shipment.id}>
                            NF{" "}
                            {shipment.invoices
                              .map(({ number }) => number)
                              .join(", ")}{" "}
                            · {statusLabels[shipment.status]}
                            {report && (
                              <div className="small muted">
                                {shipment.carrier.name} · Previsão:{" "}
                                {dateOnly(shipment.estimatedDelivery)}
                                {report.id === "stalled" &&
                                  shipment.events[0] && (
                                    <p>
                                      Última movimentação:{" "}
                                      {shipment.events[0].dateOnly
                                        ? dateOnly(
                                            shipment.events[0].occurredAt,
                                          )
                                        : dateTime(
                                            shipment.events[0].occurredAt,
                                          )}{" "}
                                      · {shipment.events[0].description}
                                    </p>
                                  )}
                                {report.id === "exception" &&
                                  shipment.events[0] && (
                                    <p>{shipment.events[0].description}</p>
                                  )}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "Sem remessa na carteira"
                    )}
                  </td>
                  <td>{dateTime(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>
          {report || pending || hasFilters
            ? "Nenhum pedido da sua carteira corresponde aos filtros selecionados."
            : "Nenhum pedido encontrado na sua carteira."}
        </p>
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
