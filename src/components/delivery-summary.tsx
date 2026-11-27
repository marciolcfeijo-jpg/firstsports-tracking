import Link from "next/link";
import {
  deliveryAttentionLabels,
  deliveryTimingLabels,
} from "@/lib/delivery-metrics";
import {
  Package,
  Truck,
  PackageCheck,
  CalendarCheck,
  AlertTriangle,
  Clock,
  CalendarClock,
  ArrowUpRight,
} from "lucide-react";
import type { DeliveryMetrics } from "@/lib/delivery-metrics";
const number = (value: number) => value.toLocaleString("pt-BR");
export function DeliverySummary({
  metrics: m,
  filters = {},
  listPath = "/admin/remessas",
  timingPath,
  uniqueOrders,
}: {
  metrics: DeliveryMetrics;
  filters?: Record<string, string>;
  listPath?: string;
  timingPath?: string;
  uniqueOrders?: number;
}) {
  function listHref(attention: keyof typeof deliveryAttentionLabels) {
    const query = new URLSearchParams(filters);
    query.delete("page");
    query.set("attention", attention);
    return listPath + "?" + query;
  }
  function timingHref(timing: keyof typeof deliveryTimingLabels) {
    const query = new URLSearchParams(filters);
    query.delete("page");
    query.set("timing", timing);
    return timingPath + "?" + query;
  }
  const distribution = [
    {
      label: deliveryTimingLabels.early,
      timing: "early" as const,
      value: m.early,
      tone: "early",
      description: "Entregues antes do dia previsto",
    },
    {
      label: deliveryTimingLabels.onDay,
      timing: "onDay" as const,
      value: m.onDay,
      tone: "on-day",
      description: "Entregues no dia da previsão",
    },
    {
      label: deliveryTimingLabels.after,
      timing: "after" as const,
      value: m.after,
      tone: "after",
      description: "Entregues após a data prevista",
    },
  ];
  return (
    <div className="delivery-dashboard">
      <section className="delivery-overview" aria-label="Resumo das remessas">
        {[
          {
            label: "Total de remessas",
            value: m.total,
            Icon: Package,
            note: m.closedOther
              ? `${number(m.closedOther)} devolvidas ou canceladas incluídas no total`
              : "Todas as remessas dos filtros selecionados",
          },
          {
            label: deliveryAttentionLabels.open,
            href: listHref("open"),
            value: m.open,
            Icon: Truck,
            note: "Ainda aguardando a conclusão da entrega",
          },
          {
            label: "Entregues",
            value: m.delivered,
            Icon: PackageCheck,
            note: "Remessas com status de entrega concluída",
          },
        ].map(({ label, value, Icon, note, href }, index) => (
          <div className="card delivery-kpi" key={label}>
            <div className="delivery-kpi-heading">
              <span>{label}</span>
              <Icon size={22} aria-hidden="true" />
            </div>
            <strong>{number(value)}</strong>
            <p>{note}</p>
            {index === 0 && uniqueOrders !== undefined && (
              <p>
                <b>{number(uniqueOrders)}</b>{" "}
                {uniqueOrders === 1 ? "pedido único" : "pedidos únicos"} nessas
                remessas
              </p>
            )}
            {href && (
              <Link className="delivery-details-link" href={href}>
                Ver remessas em aberto →
              </Link>
            )}
          </div>
        ))}
      </section>
      <section
        className="card delivery-performance"
        aria-labelledby="delivery-performance-title"
      >
        <div className="delivery-section-heading">
          <div>
            <h2 id="delivery-performance-title">Como foram as entregas?</h2>
            <p>
              Distribuição das {number(m.delivered)} remessas entregues,
              conforme a última previsão registrada.
            </p>
          </div>
          <CalendarCheck size={26} aria-hidden="true" />
        </div>
        <div className="delivery-performance-body">
          <div className="delivery-rate">
            <span>Dentro do prazo</span>
            <strong>
              {m.onTimeRate === null
                ? "—"
                : m.onTimeRate.toLocaleString("pt-BR", {
                    maximumFractionDigits: 1,
                  }) + "%"}
            </strong>
            <p>Antes do prazo + no dia previsto</p>
            <small>
              {m.comparable
                ? `Calculado sobre ${number(m.comparable)} entregas com datas disponíveis.`
                : "Ainda não há entregas com datas suficientes para calcular."}
            </small>
          </div>
          <div className="delivery-breakdown">
            <div
              className="delivery-distribution"
              role="img"
              aria-label={`${m.early} antes do prazo, ${m.onDay} no dia previsto, ${m.after} depois do prazo e ${m.unclassified} sem comparação disponível.`}
            >
              {m.delivered > 0 &&
                [
                  ...distribution,
                  {
                    label: "Sem comparação",
                    value: m.unclassified,
                    tone: "unknown",
                    description: "",
                  },
                ].map(
                  (item) =>
                    item.value > 0 && (
                      <span
                        key={item.tone}
                        className={"delivery-segment " + item.tone}
                        style={{
                          width: `${(item.value / m.delivered) * 100}%`,
                        }}
                      />
                    ),
                )}
            </div>
            <dl className="delivery-timing-cards">
              {distribution.map((item) => (
                <div
                  className={"delivery-timing-card relative " + item.tone}
                  key={item.tone}
                >
                  <dt>
                    <span className="delivery-dot" aria-hidden="true" />
                    {item.label}
                  </dt>
                  <dd>{number(item.value)}</dd>
                  <p>{item.description}</p>
                  {timingPath && (
                    <Link
                      className="delivery-details-link"
                      href={timingHref(item.timing)}
                      aria-label={`Ver remessas · ${item.label}`}
                    >
                      Ver remessas →
                    </Link>
                  )}
                </div>
              ))}
            </dl>
            <p className="delivery-comparison-note">
              <strong>{number(m.unclassified)} sem comparação de prazo.</strong>{" "}
              Falta a previsão ou a data confirmada de entrega; essas remessas
              não entram no percentual.
              {timingPath && m.unclassified > 0 && (
                <>
                  {" "}
                  <Link
                    className="shipment-order-link inline"
                    href={timingHref("unclassified")}
                  >
                    Ver remessas sem comparação →
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <p className="delivery-date-note">
          Comparação por dia no horário de São Paulo. “No dia previsto” não
          inclui as entregas antecipadas.
        </p>
      </section>
      <section aria-labelledby="delivery-attention-title">
        <div className="delivery-section-heading">
          <div>
            <h2 id="delivery-attention-title">O que precisa de atenção?</h2>
            <p>Remessas que ainda estão em aberto.</p>
          </div>
        </div>
        <dl className="delivery-attention-grid">
          {[
            {
              label: deliveryAttentionLabels.late,
              value: m.overdue,
              Icon: Clock,
              tone: "late" as const,
              note: "A previsão já passou e a entrega não foi concluída",
            },
            {
              label: deliveryAttentionLabels.exception,
              value: m.exceptions,
              Icon: AlertTriangle,
              tone: "exception" as const,
              note: "A última situação da transportadora indica uma ocorrência",
            },
            {
              label: deliveryAttentionLabels["no-forecast"],
              value: m.withoutForecast,
              Icon: CalendarClock,
              tone: "no-forecast" as const,
              note: "A transportadora ainda não informou uma data prevista",
            },
          ].map(({ label, value, Icon, tone, note }) => (
            <div className={"card delivery-attention-card " + tone} key={tone}>
              <dt>
                <Icon size={20} aria-hidden="true" />
                {label}
              </dt>
              <dd>{number(value)}</dd>
              <p>{note}</p>
              <Link
                className="delivery-details-link"
                href={listHref(tone)}
                aria-label={`Ver remessas · ${label}`}
              >
                Ver remessas →
              </Link>
            </div>
          ))}
        </dl>
        <p className="delivery-comparison-note">
          Uma remessa pode estar em atraso e em ocorrência ao mesmo tempo. Esses
          indicadores não devem ser somados.
        </p>
      </section>
      <div className="delivery-integration-note">
        <ArrowUpRight size={20} aria-hidden="true" />
        <p>
          <strong>
            {number(m.failedCarriers)} transportadora(s) com falha na última
            consulta.
          </strong>{" "}
          Esse indicador é de atualização da integração, não uma confirmação de
          problema na entrega.
        </p>
      </div>
    </div>
  );
}
