import { db } from "@/lib/db";
import { requirePageAdmin } from "@/lib/page-auth";
import { ShipmentForm } from "@/components/shipment-form";
export default async function New() {
  await requirePageAdmin(["ADMIN", "OPERATOR"]);
  const carriers = await db.carrier.findMany({
    select: { code: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Nova remessa</h1>
          <p>
            Cadastre o pedido e a primeira nota fiscal. Outras notas podem ser
            vinculadas nos detalhes.
          </p>
        </div>
      </div>
      <ShipmentForm carriers={carriers} />
    </>
  );
}
