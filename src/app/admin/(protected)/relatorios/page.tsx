import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageAdmin } from "@/lib/page-auth";
import { shipmentWhere } from "@/lib/filters";
import {
  agedOrdersWithoutShipments,
  pendingOrderLabels,
  reportDays,
  reportDaysMax,
} from "@/lib/operational-report";
import { dateTime } from "@/lib/status";

const shipmentReports = [
  {
    label: "NFs em atraso",
    query: { attention: "late" },
    help: "A previsão de entrega já passou. Confira com a transportadora uma nova previsão.",
  },
  {
    label: "NFs sem movimentação",
    query: { attention: "stalled" },
    help: "A remessa está em transporte e a última movimentação logística registrada atingiu o limite de dias.",
  },
  {
    label: "NFs em ocorrência",
    query: { attention: "exception" },
    help: "A transportadora registrou uma ocorrência. Abra a remessa para verificar o motivo.",
  },
  {
    label: "NFs sem previsão",
    query: { attention: "no-forecast" },
    help: "A remessa está em aberto e ainda precisa de previsão de entrega.",
  },
  {
    label: "NFs não localizadas",
    query: { attention: "open", tracking: "not_found" },
    help: "A última consulta não encontrou a remessa. Confira os dados fiscais e o CNPJ do tomador.",
  },
  {
    label: "NFs sem vendedor",
    query: { attention: "open", seller: "none" },
    help: "A remessa está em aberto e ainda precisa de um vendedor responsável.",
  },
] as const;

const number = (count: number) => count.toLocaleString("pt-BR");

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  await requirePageAdmin();
  const { days: requestedDays } = await searchParams;
  const days = reportDays(
    typeof requestedDays === "string" ? requestedDays : null,
  );
  const now = new Date();
  const categories = shipmentReports.map(({ label, query, help }) => {
    const params = new URLSearchParams(query);
    if (query.attention === "stalled") params.set("days", String(days));
    return { label, help, params, where: shipmentWhere(params, now) };
  });

  const [counts, pendingBilling, missingLink, delayedCarriers] =
    await Promise.all([
      Promise.all(
        categories.map(({ where }) =>
          db.shipmentInvoice.count({ where: { shipment: where } }),
        ),
      ),
      db.order.count({
        where: agedOrdersWithoutShipments(now, days, "pre-invoice"),
      }),
      db.order.count({
        where: agedOrdersWithoutShipments(now, days, "missing-link"),
      }),
      db.shipment.groupBy({
        by: ["carrierId"],
        where: categories[0].where,
        _count: { carrierId: true },
        orderBy: [{ _count: { carrierId: "desc" } }, { carrierId: "asc" }],
        take: 5,
      }),
    ]);

  const carriers = delayedCarriers.length
    ? await db.carrier.findMany({
        where: {
          id: { in: delayedCarriers.map(({ carrierId }) => carrierId) },
        },
        select: { id: true, name: true, code: true },
      })
    : [];
  const carrierById = new Map(carriers.map((carrier) => [carrier.id, carrier]));
  const priority = [
    counts[0]
      ? `${number(counts[0])} ${counts[0] === 1 ? "NF já passou" : "NFs já passaram"} da previsão`
      : "",
    counts[1]
      ? `${number(counts[1])} ${counts[1] === 1 ? "NF está" : "NFs estão"} sem movimentação registrada há ${days} dias ou mais`
      : "",
    pendingBilling
      ? `${number(pendingBilling)} ${pendingBilling === 1 ? "pedido está em uma etapa" : "pedidos estão em etapa"} anterior ao faturamento e sem remessa`
      : "",
    missingLink
      ? `${number(missingLink)} ${missingLink === 1 ? "pedido precisa" : "pedidos precisam"} de revisão do vínculo com a remessa`
      : "",
  ].filter(Boolean);

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Relatórios operacionais</h1>
          <p>Dados da base em {dateTime(now)}.</p>
        </div>
        <form className="toolbar">
          <label className="field">
            Limite de inatividade (dias)
            <input
              name="days"
              type="number"
              min={1}
              max={reportDaysMax}
              defaultValue={days}
              required
            />
          </label>
          <button className="button secondary">Aplicar</button>
        </form>
      </div>

      <section className="card" aria-labelledby="report-summary">
        <h2 id="report-summary">Resumo automático</h2>
        {priority.length ? (
          <ul className="list-disc pl-5 mt-3 space-y-1">
            {priority.map((line) => (
              <li key={line}>{line}.</li>
            ))}
          </ul>
        ) : (
          <p>
            Sem atrasos, remessas paradas ou pedidos sem remessa no período
            analisado. Confira as demais pendências abaixo.
          </p>
        )}
      </section>

      <section className="spaced" aria-labelledby="report-pending">
        <h2 id="report-pending">Pendências para investigar</h2>
        <div className="grid-3 mt-4">
          {categories.map(({ label, help, params }, index) => (
            <article className="card delivery-kpi" key={label}>
              <h3>{label}</h3>
              <strong>{number(counts[index])}</strong>
              <p>{help}</p>
              <Link
                className="delivery-details-link"
                href={`/admin/remessas?${params}`}
                aria-label={`Ver remessas · ${label}`}
              >
                Ver remessas →
              </Link>
            </article>
          ))}
          <article className="card delivery-kpi">
            <h3>{pendingOrderLabels["pre-invoice"]}</h3>
            <strong>{number(pendingBilling)}</strong>
            <p>
              Pedidos cadastrados há {days} dias ou mais, sem remessa, com etapa
              de recebimento, preparação ou faturamento pendente.
            </p>
            <Link
              className="delivery-details-link"
              href={`/admin/pedidos?pendingDays=${days}&pending=pre-invoice`}
            >
              Ver pedidos antes do faturamento →
            </Link>
          </article>
          <article className="card delivery-kpi">
            <h3>{pendingOrderLabels["missing-link"]}</h3>
            <strong>{number(missingLink)}</strong>
            <p>
              Pedidos cadastrados há {days} dias ou mais, sem remessa e sem
              etapa interna registrada. Confira se a remessa foi removida ou se
              o vínculo está faltando.
            </p>
            <Link
              className="delivery-details-link"
              href={`/admin/pedidos?pendingDays=${days}&pending=missing-link`}
            >
              Revisar vínculo com a remessa →
            </Link>
          </article>
        </div>
        <p className="small mt-3">
          Uma NF pode aparecer em mais de um indicador. Os links abrem remessas,
          que podem agrupar várias NFs.
        </p>
      </section>

      <section className="card spaced" aria-labelledby="report-carriers">
        <h2 id="report-carriers">
          Transportadoras com mais remessas em atraso
        </h2>
        {delayedCarriers.length ? (
          <div className="table-wrap mt-3">
            <table>
              <thead>
                <tr>
                  <th scope="col">Transportadora</th>
                  <th scope="col">Remessas em atraso</th>
                </tr>
              </thead>
              <tbody>
                {delayedCarriers.map(({ carrierId, _count }) => {
                  const carrier = carrierById.get(carrierId);
                  return (
                    carrier && (
                      <tr key={carrierId}>
                        <td>
                          <Link
                            className="shipment-order-link"
                            href={`/admin/remessas?attention=late&carrier=${encodeURIComponent(carrier.code)}`}
                          >
                            {carrier.name}
                          </Link>
                        </td>
                        <td>{number(_count.carrierId)}</td>
                      </tr>
                    )
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Nenhuma transportadora com remessa em atraso.</p>
        )}
      </section>
    </>
  );
}
