"use client";

import { useActionState } from "react";
import { importZenlog } from "./actions";

export function ZenlogImportForm({
  order,
  page,
}: {
  order: string;
  page: number;
}) {
  const [result, action, pending] = useActionState(importZenlog, null);
  return (
    <form action={action} className="card mb-4">
      <input type="hidden" name="pedido" value={order} />
      <input type="hidden" name="pagina" value={page} />
      <p>Grave os pedidos, as NFs e os status do ZenLOG desta página.</p>
      <button className="button" type="submit" disabled={pending}>
        {pending
          ? "Importando…"
          : order
            ? "Importar pedido"
            : "Importar esta página"}
      </button>
      {result && (
        <p role={result.error ? "alert" : "status"}>{result.message}</p>
      )}
    </form>
  );
}
