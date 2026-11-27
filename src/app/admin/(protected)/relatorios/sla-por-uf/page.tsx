import Link from "next/link";
import { db } from "@/lib/db";
import { orderSlaReport, slaColumns, slaFilters } from "@/lib/order-sla-report";
import { requirePageAdmin } from "@/lib/page-auth";

const format = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export default async function SlaByState({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageAdmin();
  const filters = slaFilters(await searchParams);
  const invalidRange =
    !!filters.start && !!filters.end && filters.start > filters.end;
  const [sellers, report] = await Promise.all([
    db.adminUser.findMany({
      where: { role: "SALES" },
      select: { id: true, email: true, active: true },
      orderBy: { email: "asc" },
    }),
    invalidRange ? null : orderSlaReport(filters),
  ]);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>SLA por UF</h1>
          <p>
            Tempo médio em horas corridas por etapa do pedido, agrupado pela UF
            de destino.
          </p>
        </div>
        <Link href="/admin/relatorios">Voltar aos relatórios</Link>
      </div>
      <form className="card mb-4 orders-filters">
        <label className="field">
          Inclusão no ZenLOG de
          <input type="date" name="de" defaultValue={filters.start} />
        </label>
        <label className="field">
          Inclusão no ZenLOG até
          <input type="date" name="ate" defaultValue={filters.end} />
        </label>
        <label className="field">
          Cliente
          <input
            name="cliente"
            placeholder="Nome ou código ERP"
            defaultValue={filters.customer}
            maxLength={120}
          />
        </label>
        <label className="field">
          Vendedor
          <select name="vendedor" defaultValue={filters.sellerId}>
            <option value="">Todos os vendedores</option>
            {sellers.map(({ id, email, active }) => (
              <option key={id} value={id}>
                {email}
                {!active ? " · inativo" : ""}
              </option>
            ))}
          </select>
        </label>
        <button className="button" type="submit">
          Filtrar
        </button>
        <Link href="/admin/relatorios/sla-por-uf">Limpar filtros</Link>
      </form>
      {invalidRange && (
        <p className="error" role="alert">
          A data inicial deve ser anterior ou igual à final.
        </p>
      )}
      {report && (
        <>
          <p className="small mb-4">
            NF e expedição usam os eventos concluídos do ZenLOG. Entrega usa a
            última entrega confirmada das remessas consideradas. Cada média usa
            apenas pedidos com horários válidos para os dois marcos.
          </p>
          {!!report.missingInclusion && (
            <p className="small mb-4">
              {report.missingInclusion.toLocaleString("pt-BR")} pedido(s)
              importado(s) ainda sem data de inclusão no ZenLOG.
              {filters.start || filters.end
                ? " Esses pedidos ficaram fora do período filtrado."
                : " Eles não entram na média de Inclusão → NF."}
            </p>
          )}
          {report.groups.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">UF</th>
                    <th scope="col">Pedidos</th>
                    {slaColumns.map((label) => (
                      <th scope="col" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.groups.map(({ state, orders, measures }) => (
                    <tr key={state}>
                      <th scope="row">{state}</th>
                      <td>{orders.toLocaleString("pt-BR")}</td>
                      {measures.map(({ total, count }, index) => (
                        <td key={slaColumns[index]}>
                          {count ? (
                            <>
                              <strong>{format.format(total / count)} h</strong>
                              <small className="order-row-detail">
                                {count.toLocaleString("pt-BR")}{" "}
                                {count === 1 ? "pedido" : "pedidos"}
                              </small>
                            </>
                          ) : (
                            "Sem amostra"
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Nenhum pedido do ZenLOG encontrado com esses filtros.</p>
          )}
        </>
      )}
    </>
  );
}
