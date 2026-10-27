import Link from "next/link";
import type { ShipmentStatus } from "@prisma/client";
import { dateOnly, dateTime, statusLabels } from "@/lib/status";
export type LookupRow = {
  url: string;
  carrier: string;
  invoiceNumber: string;
  orderNumber: string;
  customerName: string;
  issuedAt: string;
  estimatedDelivery: string | null;
  status: ShipmentStatus;
  lastSyncedAt: string | null;
};
export function LookupResults({ rows }: { rows: LookupRow[] }) {
  return (
    <section
      className="lookup-results"
      aria-labelledby="lookup-results-heading"
    >
      <h2 id="lookup-results-heading" tabIndex={-1}>
        Resultado da consulta
      </h2>
      <p role="status">
        {rows.length} remessa(s) encontrada(s) para a nota fiscal pesquisada.
      </p>
      <div
        className="table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Remessas da nota fiscal pesquisada"
      >
        <table>
          <caption className="sr-only">
            Remessas correspondentes à NF e ao CPF/CNPJ informados
          </caption>
          <thead>
            <tr>
              {[
                "Pedido / NF",
                "Cliente",
                "Transportadora",
                "Emissão",
                "Previsão",
                "Status",
                "Última consulta",
                "Ações",
              ].map((label) => (
                <th scope="col" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.url}>
                <td>
                  <strong>{row.orderNumber}</strong>
                  <br />
                  <span className="muted">NF {row.invoiceNumber}</span>
                </td>
                <td className="lookup-customer">{row.customerName}</td>
                <td>{row.carrier}</td>
                <td>{dateOnly(row.issuedAt)}</td>
                <td>{dateOnly(row.estimatedDelivery)}</td>
                <td>
                  <span className={"badge " + row.status}>
                    {statusLabels[row.status]}
                  </span>
                </td>
                <td>{dateTime(row.lastSyncedAt)}</td>
                <td>
                  <Link
                    className="lookup-view"
                    href={row.url}
                    aria-label={`Visualizar rastreamento da NF ${row.invoiceNumber}, pedido ${row.orderNumber}`}
                  >
                    Visualizar →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small">
        No celular, deslize a tabela para ver todas as colunas. Clique em
        Visualizar para abrir o histórico completo.
      </p>
    </section>
  );
}
