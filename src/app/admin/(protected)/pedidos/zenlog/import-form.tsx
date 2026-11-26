"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importZenlog } from "./actions";

export function ZenlogImportForm({
  order,
  page,
  onlyNew,
  hasRows,
}: {
  order: string;
  page: number;
  onlyNew: boolean;
  hasRows: boolean;
}) {
  const [result, action, pending] = useActionState(importZenlog, null);
  if (!hasRows && !result && !pending) return null;
  return (
    <form action={action} className="card mb-4">
      <input type="hidden" name="pedido" value={order} />
      <input type="hidden" name="pagina" value={page} />
      {onlyNew && <input type="hidden" name="filtro" value="novos" />}
      {hasRows && (
        <>
          <p>
            {onlyNew
              ? "Importe os pedidos desta página que ainda faltam no portal."
              : "Grave os pedidos, as NFs e os status do ZenLOG desta página."}
          </p>
          <button className="button" type="submit" disabled={pending}>
            {pending
              ? "Importando…"
              : order
                ? "Importar pedido"
                : onlyNew
                  ? "Importar pedidos novos"
                  : "Importar esta página"}
          </button>
        </>
      )}
      {result && (
        <div>
          <p role={result.error ? "alert" : "status"}>{result.message}</p>
          {!result.error && (
            <div className="actions">
              <Link href="/admin/pedidos?origem=novos">
                Ver pedidos criados pelo ZenLOG
              </Link>
              <Link href="/admin/pedidos?origem=atualizados">
                Ver pedidos que já existiam
              </Link>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
