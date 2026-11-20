import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderForm } from "@/components/order-form";
import { db } from "@/lib/db";
import { orderStatus, orderStageLabels } from "@/lib/order-status";
import { requirePageAdmin } from "@/lib/page-auth";
import { dateTime, statusLabels } from "@/lib/status";

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
      customer: { select: { name: true } },
      shipments: {
        include: {
          carrier: { select: { name: true } },
          invoices: { select: { number: true } },
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

  return (
    <>
      <div className="page-heading">
        <div>
          <Link href="/admin/pedidos">Todos os pedidos</Link>
          <h1>Pedido {order.number}</h1>
          <p>
            {order.customer.name} · {orderStatus(order.stage, order.shipments)}
          </p>
        </div>
      </div>
      {order.stage && !order.shipments.length && user.role !== "VIEWER" && (
        <OrderForm key={order.stage} order={{ id, stage: order.stage }} />
      )}
      {history.length > 0 && (
        <section className="card mt-4">
          <h2>Histórico do pedido</h2>
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
        </section>
      )}
      <section className="card mt-4">
        <h2>Remessas</h2>
        {order.shipments.length ? (
          <ul>
            {order.shipments.map((shipment) => (
              <li key={shipment.id}>
                <Link href={`/admin/remessas/${shipment.id}`}>
                  {shipment.carrier.name} · NF{" "}
                  {shipment.invoices.map(({ number }) => number).join(", ")} ·{" "}
                  {statusLabels[shipment.status]}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nenhuma remessa vinculada.</p>
        )}
        {user.role !== "VIEWER" && order.stage !== "CANCELLED" && (
          <Link
            className="button mt-4"
            href={`/admin/remessas/nova?pedido=${encodeURIComponent(order.id)}`}
          >
            Cadastrar remessa
          </Link>
        )}
      </section>
    </>
  );
}
