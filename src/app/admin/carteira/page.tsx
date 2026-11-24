import {
  deliveryAttention,
  deliveryAttentionLabels,
} from "@/lib/delivery-metrics";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageAdmin } from "@/lib/page-auth";
import {
  salesOrdersWhere,
  salesDeliveryFilters,
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
  const attention =
    typeof params.attention === "string"
      ? deliveryAttention(params.attention)
      : null;
  const deliveries = params.deliveries === "1";
  const pending =
    report || attention || deliveries
      ? null
      : pendingOrderFilter(params.pending);
  const days = reportDays(typeof params.days === "string" ? params.days : null);
  const pendingDays = reportDays(
    typeof params.pendingDays === "string" ? params.pendingDays : null,
  );
  const deliveryFilters = salesDeliveryFilters(params);
  delete deliveryFilters.status;
  const filters = new URLSearchParams(deliveryFilters);
  const shipmentQuery = report
    ? shipmentReportParams(report, days)
    : new URLSearchParams();
  for (const [key, value] of filters) shipmentQuery.set(key, value);
  if (status) shipmentQuery.set("status", status);
  if (report) {
    filters.set("report", report.id);
    filters.set("days", String(days));
  }
  if (attention && !report) {
    shipmentQuery.set("attention", attention);
    if (attention === "stalled") shipmentQuery.set("days", String(days));
    filters.set("attention", attention);
    if (attention === "stalled") filters.set("days", String(days));
  }
  if (deliveries) filters.set("deliveries", "1");
  if (pending) {
    filters.set("pending", pending);
    filters.set("pendingDays", String(pendingDays));
  }
  const clear = new URLSearchParams();
  for (const key of [
    "report",
    "days",
    "pending",
    "pendingDays",
    "attention",
    "deliveries",
  ]) {
    const value = filters.get(key);
    if (value) clear.set(key, value);
  }
  const hasDeliveryFilters = Object.keys(deliveryFilters).some(
    (key) => key !== "sort",
  );
  const now = new Date();
  const shipments = salesPortfolioShipmentFilter(
    seller.id,
    shipmentQuery,
    invoice,
    now,
  );
  const shipmentView = report || attention || deliveries;
  const matchShipment = Boolean(
    shipmentView || invoice || status || hasDeliveryFilters,
  );
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
    orderBy: [
      { createdAt: deliveryFilters.sort === "asc" ? "asc" : "desc" },
      { id: "desc" },
    ],
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
                report?.id === "stalled" || attention === "stalled"
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
              (pending
                ? pendingOrderLabels[pending]
                : attention
                  ? `Remessas · ${deliveryAttentionLabels[attention]}`
                  : deliveries
                    ? "Remessas da carteira"
                    : "Minha carteira")}
          </h1>
          {report?.id === "stalled" && (
            <p>Última movimentação registrada há {days} dias ou mais.</p>
          )}
          {pending && <p>Pedidos cadastrados há {pendingDays} dias ou mais.</p>}
        </div>
        {(attention || deliveries) && !report && (
          <Link
            href={`/admin/carteira/visao-geral?${new URLSearchParams(salesDeliveryFilters(params))}`}
          >
            Voltar à visão geral
          </Link>
        )}
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
        {(hasFilters || hasDeliveryFilters) && (
          <Link
            className="button secondary"
            href={clear.size ? `/admin/carteira?${clear}` : "/admin/carteira"}
          >
            Limpar filtros
          </Link>
        )}
      </form>
      {hasDeliveryFilters && (attention || deliveries) && (
        <p className="small">
          Os filtros da visão geral também se aplicam a esta lista.
        </p>
      )}
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
                            {shipmentView && (
                              <div className="small muted">
                                {shipment.carrier.name} · Previsão:{" "}
                                {dateOnly(shipment.estimatedDelivery)}
                                {(report?.id === "stalled" ||
                                  attention === "stalled") &&
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
                                {(report?.id === "exception" ||
                                  attention === "exception") &&
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
          {matchShipment || pending || hasFilters
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
