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
export function DeliverySummary({ metrics: m }: { metrics: DeliveryMetrics }) {
  const distribution = [
    {
      label: "Antes do prazo",
      value: m.early,
      tone: "early",
      description: "Entregues antes do dia previsto",
    },
    {
      label: "No dia previsto",
      value: m.onDay,
      tone: "on-day",
      description: "Entregues no dia da previsão",
    },
    {
      label: "Depois do prazo",
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
            label: "Em aberto",
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
        ].map(({ label, value, Icon, note }) => (
          <div className="card delivery-kpi" key={label}>
            <div className="delivery-kpi-heading">
              <span>{label}</span>
              <Icon size={22} aria-hidden="true" />
            </div>
            <strong>{number(value)}</strong>
            <p>{note}</p>
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
                  className={"delivery-timing-card " + item.tone}
                  key={item.tone}
                >
                  <dt>
                    <span className="delivery-dot" aria-hidden="true" />
                    {item.label}
                  </dt>
                  <dd>{number(item.value)}</dd>
                  <p>{item.description}</p>
                </div>
              ))}
            </dl>
            <p className="delivery-comparison-note">
              <strong>{number(m.unclassified)} sem comparação de prazo.</strong>{" "}
              Falta a previsão ou a data confirmada de entrega; essas remessas
              não entram no percentual.
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
              label: "Em atraso",
              value: m.overdue,
              Icon: Clock,
              tone: "late",
              note: "A previsão já passou e a entrega não foi concluída",
            },
            {
              label: "Em ocorrência",
              value: m.exceptions,
              Icon: AlertTriangle,
              tone: "exception",
              note: "A última situação da transportadora indica uma ocorrência",
            },
            {
              label: "Sem previsão",
              value: m.withoutForecast,
              Icon: CalendarClock,
              tone: "no-forecast",
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
