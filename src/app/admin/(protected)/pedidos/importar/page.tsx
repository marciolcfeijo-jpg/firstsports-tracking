import { OrderImport } from "@/components/order-import";
import { requirePageAdmin } from "@/lib/page-auth";

export default async function ImportOrders() {
  await requirePageAdmin(["ADMIN", "OPERATOR"]);
  return (
    <>
      <div className="page-heading">
        <h1>Importar pedidos</h1>
      </div>
      <OrderImport />
    </>
  );
}
