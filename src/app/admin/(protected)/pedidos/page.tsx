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
import {
  zenlogOrderPage,
  zenlogOrderSource,
  zenlogOrderSources,
  zenlogOrderSummaries,
} from "@/lib/zenlog-order-list";

const pageSize = 50;

export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<{
    pedido?: string | string[];
    busca?: string | string[];
    pendingDays?: string | string[];
    pending?: string | string[];
    page?: string | string[];
    origem?: string | string[];
    nf?: string | string[];
  }>;
}) {
  const user = await requirePageAdmin();
  const {
    pedido,
    busca,
    pendingDays,
    pending,
    page: pageParam,
    origem,
    nf,
  } = await searchParams;
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
  const unifiedSearch = typeof busca === "string";
  const rawNumber = unifiedSearch ? busca : pedido;
  const number =
    typeof rawNumber === "string" ? rawNumber.trim().slice(0, 120) : "";
  const invoiceNumber =
    unifiedSearch && /^\d{1,12}$/.test(number)
      ? String(Number(number))
      : undefined;
  const source = days ? null : zenlogOrderSource(origem);
  const invoiceLink = !days && (nf === "sem" || nf === "com") ? nf : undefined;
  const skip = (page - 1) * pageSize;
  const ids = source
    ? await zenlogOrderPage(
        source,
        number,
        skip,
        pageSize + 1,
        invoiceNumber,
        invoiceLink,
      )
    : null;
  const orders = await db.order.findMany({
    where: {
      ...(ids
        ? { id: { in: ids } }
        : invoiceNumber
          ? {
              OR: [
                { number },
                {
                  shipments: {
                    some: { invoices: { some: { number: invoiceNumber } } },
                  },
                },
              ],
            }
          : number
            ? { number }
            : {}),
      ...(!ids && invoiceLink
        ? {
            shipments: {
              [invoiceLink === "sem" ? "none" : "some"]: {
                invoices: { some: {} },
              },
            },
          }
        : {}),
      ...(days
        ? { AND: [agedOrdersWithoutShipments(new Date(), days, filter)] }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      number: true,
      stage: true,
      createdAt: true,
      customer: {
        select: {
          name: true,
          responsible: { select: { email: true, active: true } },
        },
      },
      seller: { select: { email: true } },
      shipments: {
        select: {
          status: true,
          seller: { select: { email: true } },
          invoices: { select: { id: true, number: true, series: true } },
        },
      },
    },
    take: pageSize + 1,
    skip: ids ? 0 : skip,
  });

  const visibleOrders = orders.slice(0, pageSize);
  const zenlog = await zenlogOrderSummaries(
    visibleOrders.map((order) => order.id),
  );

  function pageHref(nextPage: number) {
    const query = new URLSearchParams({ page: String(nextPage) });
    if (number) query.set(unifiedSearch ? "busca" : "pedido", number);
    if (days) query.set("pendingDays", String(days));
    if (filter) query.set("pending", filter);
    if (source) query.set("origem", source);
    if (invoiceLink) query.set("nf", invoiceLink);
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
        <div className="actions">
          <Link className="button secondary" href="/admin/remessas">
            Operações de remessas
          </Link>
          {(user.role === "ADMIN" || user.role === "OPERATOR") && (
            <Link className="button" href="/admin/pedidos/zenlog">
              Consultar e importar do ZenLOG
            </Link>
          )}
          {user.role !== "VIEWER" && (
            <Link className="button secondary" href="/admin/pedidos/importar">
              Importar planilha
            </Link>
          )}
        </div>
      </div>
      <form className="card mb-4 orders-filters">
        {filter && <input type="hidden" name="pending" value={filter} />}
        {days && <input type="hidden" name="pendingDays" value={days} />}
        <label className="field">
          Número do pedido ou da NF
          <input name="busca" defaultValue={number} maxLength={120} />
        </label>
        {!days && (
          <label className="field">
            Origem da importação
            <select name="origem" defaultValue={source ?? ""}>
              <option value="">Todos os pedidos</option>
              {Object.entries(zenlogOrderSources).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        {!days && (
          <label className="field">
            Situação da NF
            <select name="nf" defaultValue={invoiceLink ?? ""}>
              <option value="">Todas as situações</option>
              <option value="sem">Sem NF vinculada</option>
              <option value="com">Com NF vinculada</option>
            </select>
          </label>
        )}
        <button className="button">Filtrar</button>
        {!days && (source || number || invoiceLink) && (
          <Link href="/admin/pedidos">Limpar filtros</Link>
        )}
      </form>
      {orders.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>NF</th>
                <th>Status no portal</th>
                <th>ZenLOG</th>
                <th>Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => {
                const details = `/admin/pedidos/${order.id}`;
                const canLinkInvoice =
                  user.role !== "VIEWER" &&
                  !!process.env.ZENLOG_API_ORIGIN &&
                  order.stage !== "CANCELLED" &&
                  order.number.length <= 20;
                const summary = zenlog.get(order.id);
                const invoices = order.shipments.flatMap(
                  (shipment) => shipment.invoices,
                );
                const matchedInvoices = invoices.filter(
                  (invoice) => invoice.number === invoiceNumber,
                );
                const listedInvoices = matchedInvoices.length
                  ? matchedInvoices
                  : invoices;
                const responsible = order.customer.responsible;
                const sellers = [
                  ...new Set(
                    [
                      order.seller?.email ??
                        (responsible
                          ? responsible.email +
                            (responsible.active ? "" : " · acesso inativo")
                          : undefined),
                      ...order.shipments.map(
                        (shipment) => shipment.seller?.email,
                      ),
                    ].filter(Boolean),
                  ),
                ];
                return (
                  <ShipmentRow key={order.id} href={details}>
                    <td>
                      <Link className="shipment-order-link" href={details}>
                        {order.number}
                      </Link>
                    </td>
                    <td>
                      {order.customer.name}
                      <small className="order-row-detail">
                        {sellers.length
                          ? "Vendedor vinculado: " + sellers.join(", ")
                          : "Sem vendedor vinculado"}
                      </small>
                    </td>
                    <td>
                      {listedInvoices.length ? (
                        listedInvoices.slice(0, 2).map((invoice) => (
                          <div key={invoice.id}>
                            <Link href={details + "#nf-" + invoice.id}>
                              NF {invoice.number} · série {invoice.series}
                            </Link>
                          </div>
                        ))
                      ) : (
                        <>
                          Sem NF vinculada
                          {canLinkInvoice && (
                            <div className="mt-2">
                              <Link
                                className="button secondary"
                                prefetch={false}
                                href={
                                  "/admin/pedidos/zenlog?" +
                                  new URLSearchParams({
                                    consultar: "1",
                                    pedido: order.number,
                                  })
                                }
                              >
                                Vincular NF do ZenLOG
                              </Link>
                            </div>
                          )}
                        </>
                      )}
                      {invoices.length > Math.min(listedInvoices.length, 2) && (
                        <small className="order-row-detail">
                          <Link href={details + "#notas-fiscais"}>
                            Ver todas as NFs ({invoices.length})
                          </Link>
                        </small>
                      )}
                    </td>
                    <td>{orderStatus(order.stage, order.shipments)}</td>
                    <td>
                      {summary ? (
                        <>
                          <span
                            className={
                              summary.createdByZenlog
                                ? "badge DELIVERED"
                                : "badge"
                            }
                          >
                            {summary.createdByZenlog
                              ? "Criado pelo ZenLOG"
                              : summary.createdByZenlog === false
                                ? "Já existia no portal"
                                : "Importado · origem sem registro"}
                          </span>
                          <small className="order-row-detail">
                            {[
                              summary.status && "Expedição: " + summary.status,
                              summary.documentStatus &&
                                "Documento: " + summary.documentStatus,
                              summary.integrationStatus &&
                                "Integração: " + summary.integrationStatus,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                          <small className="order-row-detail">
                            <Link href={details + "#status-zenlog"}>
                              Ver status e eventos
                            </Link>
                          </small>
                          <small className="order-row-detail">
                            Registro de importação:{" "}
                            {dateTime(summary.updatedAt)}
                          </small>
                        </>
                      ) : (
                        <span className="muted">Sem importação ZenLOG</span>
                      )}
                    </td>
                    <td>{dateTime(order.createdAt)}</td>
                  </ShipmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p>
          {number
            ? "Nenhum pedido ou NF encontrado com esse número."
            : "Nenhum pedido encontrado."}
        </p>
      )}
      <div className="actions spaced">
        {page > 1 && (
          <Link className="button secondary" href={pageHref(page - 1)}>
            Anterior
          </Link>
        )}
        {orders.length > pageSize && (
          <Link className="button secondary" href={pageHref(page + 1)}>
            Próxima
          </Link>
        )}
        {days && <Link href="/admin/pedidos">Todos os pedidos</Link>}
      </div>
    </>
  );
}
