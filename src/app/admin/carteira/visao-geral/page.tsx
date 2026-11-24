import Link from "next/link";
import { DeliverySummary } from "@/components/delivery-summary";
import { Filters } from "@/components/filters";
import { TrackingAvailability } from "@/components/tracking-availability";
import { db } from "@/lib/db";
import { deliveryMetrics } from "@/lib/delivery-metrics";
import { requirePageAdmin } from "@/lib/page-auth";
import {
  salesDeliveryFilters,
  salesReportShipmentWhere,
} from "@/lib/sales-portfolio";
import { dateTime, statusLabels } from "@/lib/status";

export default async function SalesDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const seller = await requirePageAdmin(["SALES"]);
  const filters = salesDeliveryFilters(await searchParams);
  const now = new Date();
  const shipments = await db.shipment.findMany({
    where: salesReportShipmentWhere(
      seller.id,
      new URLSearchParams(filters),
      now,
    ),
    orderBy: [
      { updatedAt: filters.sort === "asc" ? "asc" : "desc" },
      { id: "asc" },
    ],
    select: {
      id: true,
      orderId: true,
      carrierId: true,
      status: true,
      deliveredAt: true,
      estimatedDelivery: true,
      lastSyncError: true,
      updatedAt: true,
      order: { select: { number: true } },
      carrier: { select: { name: true } },
      invoices: { select: { number: true } },
    },
  });
  const list = new URLSearchParams({ ...filters, deliveries: "1" });

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Visão geral das minhas entregas</h1>
          <p>Indicadores das remessas da sua carteira.</p>
        </div>
      </div>
      <Filters values={filters} sellerId={seller.id} />
      <DeliverySummary
        metrics={deliveryMetrics(shipments, now)}
        filters={filters}
        listPath="/admin/carteira"
        timingPath="/admin/carteira/visao-geral/entregas"
      />
      <div className="page-heading spaced">
        <h2>
          {filters.sort === "asc"
            ? "Atualizações mais antigas"
            : "Últimas atualizações"}
        </h2>
        <Link href={`/admin/carteira?${list}`} className="shipment-order-link">
          Ver todas as remessas →
        </Link>
      </div>
      {shipments.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Pedido / NF</th>
                <th scope="col">Transportadora</th>
                <th scope="col">Status</th>
                <th scope="col">Atualização</th>
              </tr>
            </thead>
            <tbody>
              {shipments.slice(0, 8).map((shipment) => (
                <tr key={shipment.id}>
                  <td>
                    <Link
                      className="shipment-order-link"
                      href={`/admin/carteira/${shipment.orderId}`}
                    >
                      {shipment.order.number}
                      {!!shipment.invoices.length && (
                        <span className="muted">
                          NF{" "}
                          {shipment.invoices
                            .map(({ number }) => number)
                            .join(", ")}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td>{shipment.carrier.name}</td>
                  <td>
                    <span className={"badge " + shipment.status}>
                      {statusLabels[shipment.status]}
                    </span>
                    <TrackingAvailability error={shipment.lastSyncError} />
                  </td>
                  <td>{dateTime(shipment.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Nenhuma remessa da sua carteira corresponde aos filtros.</p>
      )}
    </>
  );
}
