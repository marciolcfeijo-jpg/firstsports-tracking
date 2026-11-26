import Link from "next/link";
import { requirePageAdmin } from "@/lib/page-auth";
import { PortfolioForm } from "./portfolio-form";

export default async function ImportCustomerPortfolioPage() {
  await requirePageAdmin(["ADMIN", "OPERATOR"]);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Importar vínculos de clientes</h1>
          <p>
            Envie a lista em texto tabulado. Confira os vínculos antes de
            aplicar.
          </p>
        </div>
        <Link href="/admin/clientes">Voltar aos clientes</Link>
      </div>
      <PortfolioForm />
    </>
  );
}
