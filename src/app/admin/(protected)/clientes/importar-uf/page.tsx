import Link from "next/link";
import { requirePageAdmin } from "@/lib/page-auth";
import { StateImportForm } from "./state-import-form";

export default async function ImportCustomerStatesPage() {
  await requirePageAdmin(["ADMIN", "OPERATOR"]);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Importar UFs de clientes</h1>
          <p>
            Envie um arquivo tabulado com as colunas Cliente, CNPJ Cliente e UF.
          </p>
        </div>
        <Link href="/admin/clientes">Voltar aos clientes</Link>
      </div>
      <StateImportForm />
    </>
  );
}
