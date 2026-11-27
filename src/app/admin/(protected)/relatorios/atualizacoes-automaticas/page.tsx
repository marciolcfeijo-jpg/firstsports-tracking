import Link from "next/link";
import { automaticUpdates } from "@/lib/automatic-updates";
import { db } from "@/lib/db";
import { requirePageAdmin } from "@/lib/page-auth";
import { dateTime } from "@/lib/status";
import { z } from "zod";

const pageSize = 50;
const orderResult = z.object({ created: z.boolean(), linked: z.number() });
const shipmentResult = z.object({
  invoiceNumber: z.string(),
  invoiceSeries: z.string(),
});

export default async function AutomaticUpdatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageAdmin();
  const params = await searchParams;
  const type = params.tipo === "remessas" ? "remessas" : "pedidos";
  const days = params.dias === "1" ? 1 : params.dias === "30" ? 30 : 7;
  const results = await automaticUpdates(days);
  const pageCount = Math.max(1, Math.ceil(results[type].length / pageSize));
  const requestedPage =
    typeof params.pagina === "string" ? Number(params.pagina) : 1;
  const page = Number.isSafeInteger(requestedPage)
    ? Math.min(pageCount, Math.max(1, requestedPage))
    : 1;
  const rows = results[type].slice((page - 1) * pageSize, page * pageSize);
  const ids = rows.map(({ entityId }) => entityId);
  const records =
    type === "pedidos"
      ? await db.order.findMany({
          where: { id: { in: ids } },
          select: { id: true, number: true },
        })
      : (
          await db.shipment.findMany({
            where: { id: { in: ids } },
            select: { id: true, order: { select: { number: true } } },
          })
        ).map(({ id, order }) => ({ id, number: order.number }));
  const numbers = new Map(records.map(({ id, number }) => [id, number]));

  function href(kind = type, nextPage = 1) {
    return (
      "/admin/relatorios/atualizacoes-automaticas?" +
      new URLSearchParams({
        tipo: kind,
        dias: String(days),
        ...(nextPage > 1 ? { pagina: String(nextPage) } : {}),
      })
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Atualizações automáticas</h1>
          <p>
            Cada pedido ou remessa conta uma vez no período. A lista mostra o
            último resultado gravado com sucesso.
          </p>
        </div>
        <Link href="/admin/relatorios">Voltar aos relatórios</Link>
      </div>
      <form className="card mb-4 orders-filters">
        <input type="hidden" name="tipo" value={type} />
        <label className="field">
          Período
          <select name="dias" defaultValue={days}>
            <option value="1">Hoje</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
          </select>
        </label>
        <button className="button">Filtrar</button>
      </form>
      <nav className="actions mb-4" aria-label="Tipo de atualização">
        <Link
          className="button secondary"
          aria-current={type === "pedidos" ? "page" : undefined}
          href={href("pedidos")}
        >
          Pedidos atualizados ({results.pedidos.length.toLocaleString("pt-BR")})
        </Link>
        <Link
          className="button secondary"
          aria-current={type === "remessas" ? "page" : undefined}
          href={href("remessas")}
        >
          Remessas atualizadas (
          {results.remessas.length.toLocaleString("pt-BR")})
        </Link>
      </nav>
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Resultado</th>
                <th>Data e hora de Brasília</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entityId, snapshot, createdAt }) => {
                const order = orderResult.safeParse(snapshot).data;
                const shipment = shipmentResult.safeParse(snapshot).data;
                const number = numbers.get(entityId);
                const label =
                  type === "pedidos"
                    ? [
                        order?.created
                          ? "Pedido importado"
                          : "Pedido sincronizado",
                        order?.linked
                          ? order.linked +
                            (order.linked === 1
                              ? " NF vinculada"
                              : " NFs vinculadas")
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "Rastreio consultado" +
                      (shipment
                        ? ` · NF ${shipment.invoiceNumber} / série ${shipment.invoiceSeries}`
                        : "");
                return (
                  <tr key={entityId}>
                    <td>
                      {number ? (
                        <Link href={`/admin/${type}/${entityId}`}>
                          {number}
                        </Link>
                      ) : (
                        "Registro indisponível"
                      )}
                    </td>
                    <td>{label}</td>
                    <td>{dateTime(createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p>
          Sem atualizações automáticas registradas para este tipo e período.
        </p>
      )}
      {pageCount > 1 && (
        <nav className="actions mt-4" aria-label="Paginação das atualizações">
          {page > 1 && <Link href={href(type, page - 1)}>Anterior</Link>}
          <span>
            Página {page} de {pageCount}
          </span>
          {page < pageCount && <Link href={href(type, page + 1)}>Próxima</Link>}
        </nav>
      )}
    </>
  );
}
