import { movementStatuses, reportDays } from "@/lib/operational-report";
import { TrackingAvailability } from "@/components/tracking-availability";
import { ShipmentRow } from "@/components/shipment-row";
import { BulkTracking } from "@/components/bulk-tracking";
import {
  ShipmentSelection,
  ShipmentCheckbox,
  SelectPageCheckbox,
} from "@/components/shipment-selection";
import { requirePageAdmin } from "@/lib/page-auth";
import { db } from "@/lib/db";
import {
  deliveryAttention,
  deliveryAttentionLabels,
} from "@/lib/delivery-metrics";
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
  const attention = deliveryAttention(p.attention);
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
        events: {
          where: {
            status:
              attention === "stalled" ? { in: movementStatuses } : "EXCEPTION",
          },
          orderBy: { occurredAt: "desc" },
          take: 1,
          select: { description: true, occurredAt: true, dateOnly: true },
        },
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
          <h1>
            {attention
              ? `Remessas · ${deliveryAttentionLabels[attention]}`
              : "Remessas"}
          </h1>
          <p>{total} remessa(s) encontrada(s)</p>
          {attention === "stalled" && (
            <p>
              Última movimentação da transportadora há {reportDays(p.days)} dias
              ou mais.
            </p>
          )}
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
      <ShipmentSelection
        key={JSON.stringify([p, items.map((s) => s.id)])}
        ids={items.map((s) => s.id)}
      >
        {user.role !== "VIEWER" && <BulkTracking />}
        <Filters values={p} includeAttention />
        <p className="small">Clique em uma remessa para abrir os detalhes.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {user.role !== "VIEWER" && (
                  <th>
                    <SelectPageCheckbox />
                  </th>
                )}
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
                <ShipmentRow key={s.id} href={"/admin/remessas/" + s.id}>
                  {user.role !== "VIEWER" && (
                    <td>
                      <ShipmentCheckbox
                        id={s.id}
                        label={
                          "Selecionar pedido " +
                          s.order.number +
                          ", NF " +
                          s.invoices.map((i) => i.number).join(", ")
                        }
                      />
                    </td>
                  )}
                  <td>
                    <Link
                      className="shipment-order-link"
                      href={"/admin/remessas/" + s.id}
                      aria-label={"Abrir detalhes do pedido " + s.order.number}
                    >
                      <strong>{s.order.number}</strong>
                      <span className="muted">
                        NF {s.invoices.map((i) => i.number).join(", ")}
                      </span>
                      <span className="shipment-open-hint">Ver detalhes →</span>
                    </Link>
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
                    {attention && s.status === "EXCEPTION" && s.events[0] && (
                      <p className="small mt-2 whitespace-normal min-w-40">
                        {s.events[0].description}
                      </p>
                    )}
                    {attention === "stalled" && s.events[0] && (
                      <div className="small mt-2 whitespace-normal min-w-40">
                        <span>
                          Última movimentação em{" "}
                          {s.events[0].dateOnly
                            ? dateOnly(s.events[0].occurredAt)
                            : dateTime(s.events[0].occurredAt)}
                        </span>
                        <p>{s.events[0].description}</p>
                      </div>
                    )}
                    <TrackingAvailability error={s.lastSyncError} />
                  </td>
                  <td>{dateTime(s.lastSyncedAt)}</td>
                  <td>
                    <Link
                      className="text-[var(--brand-purple-dark)]"
                      href={"/admin/remessas/" + s.id}
                    >
                      Visualizar →
                    </Link>
                    {attention && (
                      <Link
                        className="text-[var(--brand-purple-dark)] block mt-2"
                        href={`/admin/pedidos/${s.orderId}`}
                      >
                        Ficha do pedido →
                      </Link>
                    )}
                  </td>
                </ShipmentRow>
              ))}
            </tbody>
          </table>
          {!items.length && (
            <div className="empty">Nenhuma remessa encontrada.</div>
          )}
        </div>
      </ShipmentSelection>
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
