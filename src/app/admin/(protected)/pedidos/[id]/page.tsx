import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderForm } from "@/components/order-form";
import { OrderShipmentSync } from "@/components/order-shipment-sync";
import { TrackingAvailability } from "@/components/tracking-availability";
import { TrackingHistory } from "@/components/tracking-history";
import { db } from "@/lib/db";
import { orderStatus, orderStageLabels } from "@/lib/order-status";
import { requirePageAdmin } from "@/lib/page-auth";
import {
  dateOnly,
  dateTime,
  deliveryDateTime,
  statusLabels,
} from "@/lib/status";

function Details({ fields }: { fields: [string, string | null][] }) {
  return (
    <dl className="data-list">
      {fields.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt>{label}</dt>
          <dd>{value || "Não informado"}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function OrderDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageAdmin();
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: {
      customer: {
        select: { name: true, email: true, city: true, state: true },
      },
      shipments: {
        include: {
          carrier: { select: { name: true, enabled: true } },
          seller: { select: { email: true } },
          invoices: { orderBy: [{ series: "asc" }, { number: "asc" }] },
          events: { orderBy: { occurredAt: "desc" } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!order) notFound();

  const history = await db.auditLog.findMany({
    where: {
      entityId: id,
      action: { in: ["ORDER_CREATE", "ORDER_STAGE_UPDATE"] },
    },
    select: { id: true, action: true, createdAt: true, snapshot: true },
    orderBy: { createdAt: "asc" },
  });
  const canWrite = user.role !== "VIEWER";
  const status = orderStatus(order.stage, order.shipments);

  return (
    <>
      <div className="page-heading">
        <div>
          <Link href="/admin/pedidos">Todos os pedidos</Link>
          <h1>Pedido {order.number}</h1>
          <p>{status}</p>
        </div>
        {canWrite && order.stage !== "CANCELLED" && (
          <Link
            className="button"
            href={`/admin/remessas/nova?pedido=${encodeURIComponent(id)}`}
          >
            Cadastrar remessa
          </Link>
        )}
      </div>
      <div className="grid-2">
        <section className="card">
          <h2>Dados do pedido</h2>
          <Details
            fields={[
              ["Número", order.number],
              ["Cadastro", dateTime(order.createdAt)],
              ["Cliente", order.customer.name],
              ["E-mail", order.customer.email],
              ["Cidade", order.customer.city],
              ["UF", order.customer.state],
              ["Status atual", status],
              ["Remessas vinculadas", String(order.shipments.length)],
            ]}
          />
        </section>
        {canWrite && !order.shipments.length && order.stage !== "CANCELLED" && (
          <OrderForm
            key={order.stage ?? "unregistered"}
            order={{ id, stage: order.stage }}
          />
        )}
      </div>

      <section className="card mt-4">
        <h2>Histórico do pedido</h2>
        {history.length ? (
          <ol>
            {history.map((entry) => {
              const snapshot = entry.snapshot;
              const stage =
                snapshot && typeof snapshot === "object" && "stage" in snapshot
                  ? snapshot.stage
                  : null;
              const label = Object.entries(orderStageLabels).find(
                ([key]) => key === stage,
              )?.[1];
              return (
                <li key={entry.id}>
                  {dateTime(entry.createdAt)} ·{" "}
                  {entry.action === "ORDER_CREATE"
                    ? orderStageLabels.RECEIVED
                    : label}
                </li>
              );
            })}
          </ol>
        ) : (
          <p>Nenhuma etapa do pedido registrada.</p>
        )}
      </section>

      <section className="mt-6">
        <h2>Notas fiscais e remessas</h2>
        {order.shipments.length ? (
          <p className="small">
            Após o faturamento, o status do pedido acompanha as remessas
            vinculadas. Notas da mesma remessa compartilham o rastreamento.
          </p>
        ) : (
          <p>Nenhuma remessa vinculada.</p>
        )}
        {order.shipments.map((shipment) => (
          <article className="card mt-4" key={shipment.id}>
            <h3>
              {shipment.carrier.name} · {statusLabels[shipment.status]}
            </h3>
            <Details
              fields={[
                ["Emissão", dateOnly(shipment.issuedAt)],
                [
                  "Destino",
                  [shipment.destinationCity, shipment.destinationState]
                    .filter(Boolean)
                    .join(" / "),
                ],
                ["Vendedor / representante", shipment.seller?.email ?? null],
                ["CNPJ do remetente", shipment.senderDocument],
                ["CNPJ do tomador", shipment.payerDocument],
                ["CT-e", shipment.cte],
                ["Código de rastreio", shipment.trackingCode],
                ["Previsão de entrega", dateOnly(shipment.estimatedDelivery)],
                [
                  "Entrega confirmada",
                  shipment.deliveredAt
                    ? deliveryDateTime(shipment.deliveredAt, shipment.events)
                    : null,
                ],
                [
                  "Última atualização da transportadora",
                  dateTime(shipment.lastSyncedAt),
                ],
              ]}
            />
            <TrackingAvailability error={shipment.lastSyncError} />
            {shipment.invoices.length > 0 && (
              <div className="table-wrap my-4">
                <table>
                  <caption className="sr-only">
                    Notas fiscais vinculadas à remessa
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">NF</th>
                      <th scope="col">Série</th>
                      <th scope="col">CNPJ emitente</th>
                      <th scope="col">Chave de acesso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipment.invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>{invoice.number}</td>
                        <td>{invoice.series}</td>
                        <td>{invoice.issuerDocument}</td>
                        <td>{invoice.accessKey || "Não informada"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="actions mt-4">
              {canWrite && (
                <OrderShipmentSync
                  shipmentId={shipment.id}
                  enabled={shipment.carrier.enabled}
                />
              )}
              <Link
                className="button secondary"
                href={`/admin/remessas/${shipment.id}`}
              >
                Abrir detalhes da remessa
              </Link>
            </div>
            {shipment.events.length > 0 && (
              <details className="mt-4">
                <summary>Histórico da entrega</summary>
                <TrackingHistory events={shipment.events} />
              </details>
            )}
          </article>
        ))}
      </section>
    </>
  );
}
