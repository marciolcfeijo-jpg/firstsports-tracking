import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackingHistory } from "@/components/tracking-history";
import { db } from "@/lib/db";
import { orderAuditStageLabel } from "@/lib/order-status";
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
      createdAt: true,
      customer: { select: { name: true } },
      shipments: {
        where: salesShipmentsWhere(seller.id),
        select: {
          id: true,
          status: true,
          issuedAt: true,
          estimatedDelivery: true,
          carrier: { select: { name: true } },
          invoices: { select: { number: true, series: true } },
          events: { orderBy: { occurredAt: "desc" } },
        },
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
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

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
      <section className="card">
        <h2>Etapas internas</h2>
        {history.length ? (
          <ol className="timeline">
            {history.map((entry) => (
              <li key={entry.id}>
                <strong>
                  {orderAuditStageLabel(entry.action, entry.snapshot)}
                </strong>
                <p>{dateTime(entry.createdAt)}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p>Nenhuma etapa interna registrada.</p>
        )}
      </section>
      <section className="spaced">
        <h2>Faturamento e entrega na carteira</h2>
        {!order.shipments.length && (
          <p>Nenhuma NF vinculada à sua carteira para este pedido.</p>
        )}
        {order.shipments.map((shipment) => (
          <article className="card mt-4" key={shipment.id}>
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
            <TrackingHistory events={shipment.events} />
          </article>
        ))}
      </section>
    </>
  );
}
