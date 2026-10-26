import React from "react";
import { Package, Truck, Warehouse, Route, PackageCheck } from "lucide-react";
import type { ShipmentStatus } from "@prisma/client";
import {
  deliveryDateTime,
  dateOnly,
  dateTime,
  statusLabels,
} from "@/lib/status";

type Event = {
  occurredAt: Date | string;
  dateOnly: boolean;
  description: string;
  location: string | null;
  status: ShipmentStatus;
};
type Props = {
  orderNumber: string;
  invoices: { number: string; series: string }[];
  status: ShipmentStatus;
  estimatedDelivery: Date | string | null;
  deliveredAt: Date | string | null;
  events: Event[];
};
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
const stages = [
  {
    label: "Na origem / coletado",
    Icon: Package,
    matches: (e: Event) =>
      e.status === "PICKED_UP" ||
      /(?:ENCOMENDA|FILIAL|UNIDADE).*ORIGEM/.test(normalize(e.description)),
  },
  {
    label: "Em viagem",
    Icon: Truck,
    matches: (e: Event) =>
      e.status === "IN_TRANSIT" ||
      /TRANSFERENCIA|EM VIAGEM/.test(normalize(e.description)),
  },
  {
    label: "Chegada ao destino",
    Icon: Warehouse,
    matches: (e: Event) =>
      /(?:CHEGADA|CHEGOU|ENCOMENDA NA|RECEBID).*DESTINO/.test(
        normalize(e.description),
      ),
  },
  {
    label: "Em rota de entrega",
    Icon: Route,
    matches: (e: Event) => e.status === "OUT_FOR_DELIVERY",
  },
  {
    label: "Entrega realizada",
    Icon: PackageCheck,
    matches: (e: Event) => e.status === "DELIVERED",
  },
];
export function TrackingOverview(s: Props) {
  const chronological = [...s.events].sort(
    (a, b) => +new Date(a.occurredAt) - +new Date(b.occurredAt),
  );
  return (
    <section
      className="card tracking-overview"
      aria-label="Resumo do rastreamento"
    >
      <h2>Rastreamento da encomenda</h2>
      <dl className="tracking-summary">
        <div>
          <dt>Pedido</dt>
          <dd>{s.orderNumber}</dd>
        </div>
        <div>
          <dt>Nota fiscal</dt>
          <dd>
            {s.invoices
              .map((i) => `${i.number} / série ${i.series}`)
              .join(", ")}
          </dd>
        </div>
        <div>
          <dt>Previsão de entrega</dt>
          <dd>{dateOnly(s.estimatedDelivery)}</dd>
        </div>
        <div>
          <dt>Tipo de entrega</dt>
          <dd>Não informado pela integração</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{statusLabels[s.status]}</dd>
        </div>
        <div>
          <dt>Entregue em</dt>
          <dd>
            {s.deliveredAt
              ? deliveryDateTime(s.deliveredAt, s.events)
              : "Ainda não confirmada"}
          </dd>
        </div>
      </dl>
      <ol className="tracking-stages" aria-label="Etapas da entrega">
        {stages.map(({ label, Icon, matches }) => {
          const event = chronological.find(matches);
          const confirmedDelivery =
            label === "Entrega realizada" ? s.deliveredAt : null;
          const occurredAt = event?.occurredAt || confirmedDelivery;
          return (
            <li key={label} className={occurredAt ? "recorded" : ""}>
              <span className="stage-icon">
                <Icon size={26} aria-hidden="true" />
              </span>
              <strong>{label}</strong>
              <span>
                {occurredAt
                  ? event?.dateOnly
                    ? dateOnly(occurredAt) + " · horário não informado"
                    : confirmedDelivery && !event
                      ? deliveryDateTime(occurredAt, s.events)
                      : dateTime(occurredAt)
                  : "Sem registro recebido"}
              </span>
              {event?.location && <span>{event.location}</span>}
            </li>
          );
        })}
      </ol>
      <p className="small !mb-0">
        As etapas mostram somente registros recebidos. Consulte abaixo todas as
        movimentações e ocorrências.
      </p>
    </section>
  );
}
