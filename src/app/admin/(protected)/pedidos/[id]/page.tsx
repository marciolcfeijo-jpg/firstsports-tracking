import { OrderJourney } from "@/components/order-journey";
import { ZenlogExpedition } from "@/components/zenlog-expedition";
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
      seller: { select: { email: true } },
      customer: {
        select: {
          name: true,
          email: true,
          city: true,
          state: true,
          responsible: { select: { email: true, active: true } },
        },
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

  const responsible = order.customer.responsible;
  const defaultSeller = responsible
    ? responsible.email + (responsible.active ? "" : " · acesso inativo")
    : null;
  const canWrite = user.role !== "VIEWER";
  const status = orderStatus(order.stage, order.shipments);
  const invoices = order.shipments.flatMap((shipment) => shipment.invoices);

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
      <nav className="actions mb-4" aria-label="Seções do pedido">
        <Link className="button secondary" href="#status-zenlog">
          Jornada do pedido
        </Link>
        <Link className="button secondary" href="#notas-fiscais">
          Notas fiscais ({invoices.length})
        </Link>
      </nav>
      <OrderJourney
        orderId={id}
        createdAt={order.createdAt}
        issuedAt={order.issuedAt}
        stage={order.stage}
        shipments={order.shipments}
      />
      <div className="grid-2">
        <section className="card">
          <h2>Dados do pedido</h2>
          <Details
            fields={[
              ["Número", order.number],
              ["Cadastro", dateTime(order.createdAt)],
              [
                "Emissão do pedido",
                order.issuedAt
                  ? new Intl.DateTimeFormat("pt-BR", {
                      timeZone: "UTC",
                    }).format(order.issuedAt)
                  : null,
              ],
              ["Vendedor do pedido", order.seller?.email ?? defaultSeller],
              ["Cliente", order.customer.name],
              ["E-mail", order.customer.email],
              ["Cidade", order.destinationCity ?? order.customer.city],
              ["UF", order.destinationState ?? order.customer.state],
              ["Status atual", status],
              [
                "Etapa interna",
                order.stage ? orderStageLabels[order.stage] : null,
              ],
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

      {canWrite && process.env.ZENLOG_API_ORIGIN && (
        <ZenlogExpedition orderId={order.id} />
      )}

      <section className="mt-6" id="notas-fiscais">
        <h2>Notas fiscais do pedido</h2>
        {order.shipments.length ? (
          <p className="small">
            Após o faturamento, o status do pedido acompanha as remessas
            vinculadas. Notas da mesma remessa compartilham o rastreamento.
          </p>
        ) : (
          <p>
            {order.stage === null
              ? "O pedido está sem remessa vinculada e sem etapa interna registrada. Confira o faturamento e o histórico antes de vincular outra remessa."
              : "Aguardando NF vinculada para iniciar o rastreio."}
          </p>
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
                [
                  "Vendedor / representante",
                  shipment.seller?.email ??
                    order.seller?.email ??
                    defaultSeller,
                ],
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
                      <tr
                        className="order-invoice"
                        key={invoice.id}
                        id={`nf-${invoice.id}`}
                      >
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
