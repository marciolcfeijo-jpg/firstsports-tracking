import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { deliveryTiming, deliveryTimingLabels } from "@/lib/delivery-metrics";
import { requirePageAdmin } from "@/lib/page-auth";
import {
  salesDeliveryFilters,
  salesReportShipmentWhere,
} from "@/lib/sales-portfolio";
import { dateOnly } from "@/lib/status";

const pageSize = 50;

export default async function SalesDeliveryDetails({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const seller = await requirePageAdmin(["SALES"]);
  const params = await searchParams;
  const timing = Object.keys(deliveryTimingLabels).find(
    (key) => key === params.timing,
  ) as keyof typeof deliveryTimingLabels | undefined;
  if (!timing) notFound();

  const filters = salesDeliveryFilters(params);
  const where = {
    AND: [
      salesReportShipmentWhere(seller.id, new URLSearchParams(filters)),
      { status: "DELIVERED" as const },
    ],
  };
  const candidates = await db.shipment.findMany({
    where,
    orderBy: [
      { updatedAt: filters.sort === "asc" ? "asc" : "desc" },
      { id: "asc" },
    ],
    select: { id: true, estimatedDelivery: true, deliveredAt: true },
  });
  const matched = candidates.filter(
    (shipment) => deliveryTiming(shipment) === timing,
  );
  const requested = typeof params.page === "string" ? Number(params.page) : 1;
  const page =
    Number.isSafeInteger(requested) && requested > 0
      ? Math.min(requested, Math.max(1, Math.ceil(matched.length / pageSize)))
      : 1;
  const ids = matched
    .slice((page - 1) * pageSize, page * pageSize)
    .map(({ id }) => id);
  const shipments = ids.length
    ? await db.shipment.findMany({
        where: { ...where, id: { in: ids } },
        select: {
          id: true,
          orderId: true,
          deliveredAt: true,
          estimatedDelivery: true,
          order: {
            select: { number: true, customer: { select: { name: true } } },
          },
          carrier: { select: { name: true } },
          invoices: {
            select: { number: true, series: true },
            orderBy: [{ number: "asc" }, { series: "asc" }],
          },
        },
      })
    : [];
  const byId = new Map(shipments.map((shipment) => [shipment.id, shipment]));
  const pageLink = (number: number) =>
    "?" + new URLSearchParams({ ...filters, timing, page: String(number) });

  return (
    <>
      <div className="page-heading">
        <div>
          <Link
            href={`/admin/carteira/visao-geral?${new URLSearchParams(filters)}`}
          >
            Voltar à visão geral
          </Link>
          <h1>{deliveryTimingLabels[timing]}</h1>
          <p>
            {matched.length.toLocaleString("pt-BR")} remessa(s) da sua carteira
            pelos filtros selecionados.
          </p>
        </div>
      </div>
      {shipments.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "Pedido / NF",
                  "Cliente",
                  "Transportadora",
                  "Previsão",
                  "Entrega",
                ].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ids.map((id) => {
                const shipment = byId.get(id);
                if (!shipment || deliveryTiming(shipment) !== timing)
                  return null;
                return (
                  <tr key={id}>
                    <td>
                      <Link
                        className="shipment-order-link"
                        href={`/admin/carteira/${shipment.orderId}#remessa-${shipment.id}`}
                      >
                        <strong>{shipment.order.number}</strong>
                        {!!shipment.invoices.length && (
                          <span className="muted">
                            NF{" "}
                            {shipment.invoices
                              .map(
                                ({ number, series }) =>
                                  `${number} (série ${series})`,
                              )
                              .join(", ")}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td>{shipment.order.customer.name}</td>
                    <td>{shipment.carrier.name}</td>
                    <td>{dateOnly(shipment.estimatedDelivery)}</td>
                    <td>{dateOnly(shipment.deliveredAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Nenhuma remessa da sua carteira corresponde a este grupo.</p>
      )}
      <nav className="actions spaced" aria-label="Paginação das entregas">
        {page > 1 && (
          <Link className="button secondary" href={pageLink(page - 1)}>
            Anterior
          </Link>
        )}
        {page * pageSize < matched.length && (
          <Link className="button secondary" href={pageLink(page + 1)}>
            Próxima
          </Link>
        )}
      </nav>
    </>
  );
}
