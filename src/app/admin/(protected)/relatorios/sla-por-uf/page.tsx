import Link from "next/link";
import { db } from "@/lib/db";
import {
  missingShipmentState,
  orderSlaReport,
  slaColumns,
  slaFilters,
  slaShipmentPageSize,
} from "@/lib/order-sla-report";
import { statusLabels } from "@/lib/status";
import { requirePageAdmin } from "@/lib/page-auth";

const format = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function SlaMeasures({
  measures,
}: {
  measures: Awaited<ReturnType<typeof orderSlaReport>>["brazil"]["measures"];
}) {
  return (
    <>
      {" "}
      {measures.map(({ total, count }, index) => (
        <td key={slaColumns[index]}>
          {count ? (
            <>
              <strong>{format.format(total / count / 24)} d</strong>
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
    </>
  );
}

export default async function SlaByState({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageAdmin();
  const params = await searchParams;
  const filters = slaFilters(params);
  const selectedState =
    typeof params.uf === "string" &&
    (/^[A-Z]{2}$/.test(params.uf) ||
      ["Sem UF", "Múltiplas UFs", missingShipmentState].includes(params.uf))
      ? params.uf
      : "";
  const requestedPage =
    typeof params.pagina === "string" ? Number(params.pagina) : 1;
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 100_000)
      : 1;
  function reportHref(state = "", nextPage = 1) {
    const query = new URLSearchParams();
    if (filters.start) query.set("de", filters.start);
    if (filters.end) query.set("ate", filters.end);
    if (filters.customer) query.set("cliente", filters.customer);
    if (filters.sellerId) query.set("vendedor", filters.sellerId);
    if (filters.allOrders) query.set("entrega", "todos");
    if (state) query.set("uf", state);
    if (nextPage > 1) query.set("pagina", String(nextPage));
    return (
      "/admin/relatorios/sla-por-uf" +
      (query.size ? "?" + query : "") +
      (state ? "#remessas" : "")
    );
  }
  const invalidRange =
    !!filters.start && !!filters.end && filters.start > filters.end;
  const [sellers, report] = await Promise.all([
    db.adminUser.findMany({
      where: { role: "SALES" },
      select: { id: true, email: true, active: true },
      orderBy: { email: "asc" },
    }),
    invalidRange
      ? null
      : orderSlaReport(
          filters,
          selectedState ? { state: selectedState, page } : undefined,
        ),
  ]);
  const shipmentView = selectedState === missingShipmentState;
  const totalDetails = shipmentView
    ? report?.matchingShipments
    : report?.matchingOrders;
  const detailLabel = shipmentView ? "remessas" : "pedidos";
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>SLA por UF</h1>
          <p>
            Tempo médio em dias corridos por etapa do pedido, agrupado pela UF
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
        <label className="field">
          Entrega
          <select
            name="entrega"
            defaultValue={filters.allOrders ? "todos" : "concluida"}
          >
            <option value="concluida">Pedidos com entrega concluída</option>
            <option value="todos">Todos com histórico no ZenLOG</option>
          </select>
        </label>
        {selectedState && (
          <input type="hidden" name="uf" value={selectedState} />
        )}
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
          <section
            className="card mb-4"
            aria-label="Pedidos considerados no SLA"
          >
            <h2>{format.format(report.brazil.orders)} pedidos no SLA</h2>
            <p>
              Cada pedido com histórico no ZenLOG conta uma vez, mesmo com
              várias remessas. Na visão geral, o total de remessas conta cada
              remessa separadamente. O período deste relatório usa a data de
              inclusão no ZenLOG. Na visão geral, o período usa a emissão da
              remessa.
            </p>
            <ul>
              <li>
                {format.format(report.excluded.withoutHistory)} pedidos sem
                histórico no ZenLOG ficaram fora.
              </li>
              {!filters.allOrders && (
                <li>
                  {format.format(report.excluded.withoutCompletedDelivery)}{" "}
                  pedidos com histórico ficaram fora pelo critério de entrega
                  concluída.
                </li>
              )}
              {(filters.start || filters.end) && (
                <li>
                  {format.format(report.excluded.byPeriod)} pedidos restantes
                  ficaram fora por data de inclusão ausente ou fora do período.
                </li>
              )}
            </ul>
          </section>
          <p className="small mb-4">
            NF e expedição usam os eventos concluídos do ZenLOG. Entrega usa a
            última entrega confirmada do pedido. Inclusão → Entrega mede o prazo
            total desde a primeira inclusão no ZenLOG. Cada média usa apenas
            pedidos com horários válidos para os dois marcos. Para considerar a
            entrega concluída, o pedido precisa de pelo menos uma remessa ativa
            com NF e de entrega confirmada em todas as remessas ativas.
          </p>
          {!!report.missingInclusion && (
            <p className="small mb-4">
              {report.missingInclusion.toLocaleString("pt-BR")} pedido(s)
              importado(s) ainda sem data de inclusão no ZenLOG.
              {filters.start || filters.end
                ? " Esses pedidos ficaram fora do período filtrado."
                : " Eles ficam fora das médias que começam na inclusão."}
            </p>
          )}
          {report.missingShipmentStates > 0 && (
            <p className="mb-4">
              <Link
                className="button secondary"
                prefetch={false}
                href={reportHref(missingShipmentState)}
              >
                Remessas sem UF no cadastro (
                {report.missingShipmentStates.toLocaleString("pt-BR")})
              </Link>
            </p>
          )}
          {report.groups.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">UF</th>
                    <th scope="col">Pedidos no SLA</th>
                    {slaColumns.map((label) => (
                      <th scope="col" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Média Brasil</th>
                    <td>
                      <strong>
                        {report.brazil.orders.toLocaleString("pt-BR")}
                      </strong>
                    </td>
                    <SlaMeasures measures={report.brazil.measures} />
                  </tr>
                  {report.groups.map(({ state, orders, measures }) => (
                    <tr key={state}>
                      <th scope="row">
                        <Link
                          className="shipment-order-link"
                          prefetch={false}
                          href={reportHref(state)}
                          aria-label={`Ver pedidos do grupo ${state}`}
                          aria-current={
                            selectedState === state ? "location" : undefined
                          }
                        >
                          {state}
                        </Link>
                      </th>
                      <td>{orders.toLocaleString("pt-BR")}</td>
                      <SlaMeasures measures={measures} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Nenhum pedido do ZenLOG encontrado com esses filtros.</p>
          )}
          {selectedState && (
            <section id="remessas" className="card spaced">
              <div className="page-heading">
                <div>
                  <h2>
                    {shipmentView
                      ? "Remessas sem UF no cadastro"
                      : `Pedidos · ${selectedState}`}
                  </h2>
                  <p>
                    {totalDetails?.toLocaleString("pt-BR")}{" "}
                    {totalDetails === 1
                      ? detailLabel.slice(0, -1)
                      : detailLabel}
                    nos filtros selecionados.
                  </p>
                </div>
                <Link href={reportHref()}>Fechar lista</Link>
              </div>
              {report.shipmentDetails.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Pedido</th>
                        <th>Cliente</th>
                        <th>NF</th>
                        <th>UF da remessa</th>
                        <th>Grupo no SLA</th>
                        <th>Transportadora</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.shipmentDetails.map((shipment) => (
                        <tr key={shipment.id ?? shipment.orderId}>
                          <td>
                            <Link href={`/admin/pedidos/${shipment.orderId}`}>
                              {shipment.orderNumber}
                            </Link>
                          </td>
                          <td>{shipment.customer}</td>
                          <td>
                            {shipment.id ? (
                              <Link href={`/admin/remessas/${shipment.id}`}>
                                {shipment.invoices
                                  .map(
                                    ({ number, series }) =>
                                      `NF ${number} · série ${series}`,
                                  )
                                  .join(" / ")}
                              </Link>
                            ) : (
                              "Sem remessa com NF"
                            )}
                          </td>
                          <td>
                            {shipment.id ? shipment.state || "Sem UF" : "—"}
                          </td>
                          <td>{shipment.groupedState}</td>
                          <td>{shipment.carrier ?? "—"}</td>
                          <td>
                            {shipment.status
                              ? statusLabels[shipment.status]
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>Nenhum resultado nesta página.</p>
              )}
              <nav
                className="actions mt-4"
                aria-label={`Páginas de ${detailLabel}`}
              >
                {page > 1 && (
                  <Link
                    className="button secondary"
                    prefetch={false}
                    href={reportHref(selectedState, page - 1)}
                  >
                    Anterior
                  </Link>
                )}
                {page * slaShipmentPageSize < (totalDetails ?? 0) && (
                  <Link
                    className="button secondary"
                    prefetch={false}
                    href={reportHref(selectedState, page + 1)}
                  >
                    Próxima
                  </Link>
                )}
              </nav>
            </section>
          )}
        </>
      )}
    </>
  );
}
