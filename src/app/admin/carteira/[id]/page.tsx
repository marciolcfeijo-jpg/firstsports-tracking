import { OrderJourney } from "@/components/order-journey";
import { OrderForm } from "@/components/order-form";
import { OrderShipmentSync } from "@/components/order-shipment-sync";
import { TrackingAvailability } from "@/components/tracking-availability";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePageAdmin } from "@/lib/page-auth";
import { salesOrdersWhere, salesShipmentsWhere } from "@/lib/sales-portfolio";
import { dateOnly, dateTime, statusLabels } from "@/lib/status";

export default async function SalesOrder({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const seller = await requirePageAdmin(["SALES"]);
  const { id } = await params;
  const order = await db.order.findFirst({
    where: { id, ...salesOrdersWhere(seller.id) },
    select: {
      number: true,
      stage: true,
      sellerId: true,
      _count: { select: { shipments: true } },
      createdAt: true,
      issuedAt: true,
      customer: { select: { name: true, responsibleId: true } },
      shipments: {
        where: salesShipmentsWhere(seller.id),
        select: {
          id: true,
          status: true,
          issuedAt: true,
          estimatedDelivery: true,
          deliveredAt: true,
          lastSyncError: true,
          carrier: { select: { name: true, enabled: true } },
          invoices: { select: { number: true, series: true } },
          events: { orderBy: { occurredAt: "desc" } },
        },
      },
    },
  });
  if (!order) notFound();
  const ownsOrder =
    (order.sellerId ?? order.customer.responsibleId) === seller.id;

  return (
    <>
      <div className="page-heading">
        <div>
          <Link href="/admin/carteira">Minha carteira</Link>
          <h1>Pedido {order.number}</h1>
          <p>
            {order.customer.name} · Cadastro em {dateTime(order.createdAt)}
          </p>
        </div>
      </div>
      <OrderJourney
        orderId={id}
        createdAt={order.createdAt}
        issuedAt={order.issuedAt}
        stage={order.stage}
        shipments={order.shipments}
        includeZenlog={
          order.sellerId === seller.id ||
          (!order.sellerId &&
            (ownsOrder || order.shipments.length > 0) &&
            order.shipments.length === order._count.shipments)
        }
      />
      {ownsOrder && order._count.shipments === 0 && (
        <OrderForm
          key={order.stage ?? "unregistered"}
          order={{ id, stage: order.stage }}
          canCancel={false}
        />
      )}
      <section className="spaced">
        <h2>Faturamento e entrega na carteira</h2>
        {order.shipments.length > 0 && (
          <p className="small">
            Após o faturamento, o andamento da entrega acompanha o rastreamento
            das NFs vinculadas.
          </p>
        )}
        {!order.shipments.length && (
          <p>Nenhuma NF vinculada à sua carteira para este pedido.</p>
        )}
        {order.shipments.map((shipment) => (
          <article
            className="card mt-4"
            key={shipment.id}
            id={`remessa-${shipment.id}`}
          >
            <h3>
              {shipment.invoices
                .map(({ number, series }) => `NF ${number} · série ${series}`)
                .join(" / ")}{" "}
              · {shipment.carrier.name}
            </h3>
            <p>
              {statusLabels[shipment.status]} · Emissão em{" "}
              {dateOnly(shipment.issuedAt)} · Previsão:{" "}
              {dateOnly(shipment.estimatedDelivery)}
            </p>
            <TrackingAvailability error={shipment.lastSyncError} />
            <div className="mt-3">
              <OrderShipmentSync
                shipmentId={shipment.id}
                enabled={shipment.carrier.enabled}
              />
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
