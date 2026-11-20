import Link from "next/link";
import { ShipmentRow } from "@/components/shipment-row";
import { db } from "@/lib/db";
import { orderStatus } from "@/lib/order-status";
import { requirePageAdmin } from "@/lib/page-auth";
import { dateTime } from "@/lib/status";

export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string | string[] }>;
}) {
  const user = await requirePageAdmin();
  const { pedido } = await searchParams;
  const number = typeof pedido === "string" ? pedido.trim().slice(0, 120) : "";
  const orders = await db.order.findMany({
    where: number ? { number } : {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      number: true,
      stage: true,
      createdAt: true,
      customer: { select: { name: true } },
      shipments: { select: { status: true } },
    },
    take: 51,
  });

  return (
    <>
      <div className="page-heading">
        <h1>Pedidos</h1>
        {user.role !== "VIEWER" && (
          <Link className="button" href="/admin/pedidos/importar">
            Importar pedidos
          </Link>
        )}
      </div>
      <form className="card mb-4">
        <label className="field">
          Número do pedido
          <input name="pedido" defaultValue={number} maxLength={120} />
        </label>
        <button className="button">Buscar pedido</button>
      </form>
      {orders.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Status</th>
                <th>Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 50).map((order) => (
                <ShipmentRow key={order.id} href={`/admin/pedidos/${order.id}`}>
                  <td>
                    <Link
                      className="shipment-order-link"
                      href={`/admin/pedidos/${order.id}`}
                    >
                      {order.number}
                    </Link>
                  </td>
                  <td>{order.customer.name}</td>
                  <td>{orderStatus(order.stage, order.shipments)}</td>
                  <td>{dateTime(order.createdAt)}</td>
                </ShipmentRow>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Nenhum pedido encontrado.</p>
      )}
      {orders.length > 50 && (
        <p className="small">
          Exibindo os 50 pedidos mais recentes. Busque pelo número para
          encontrar outros pedidos.
        </p>
      )}
    </>
  );
}
