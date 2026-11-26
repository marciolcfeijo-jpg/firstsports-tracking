import type { OrderStage, ShipmentStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { orderAuditStageLabel, orderStatus } from "@/lib/order-status";
import {
  dateOnly,
  dateTime,
  deliveryDateTime,
  statusLabels,
} from "@/lib/status";

const snapshot = z.object({
  registeredAt: z.string().nullish(),
  expeditionStatus: z.string().nullable(),
  integrationStatus: z.string().nullable(),
  documentStatus: z.string().nullable(),
  events: z.array(
    z.object({
      id: z.number().nullish(),
      code: z.number().nullable(),
      name: z.string().nullish(),
      sequence: z.number().nullable(),
      status: z.string().nullable(),
      start: z.string().nullable(),
      end: z.string().nullable(),
    }),
  ),
});

const eventLabels: Record<string, string> = {
  A: "Alerta",
  E: "Erro",
  S: "Sucesso",
};
const catalogSchema = z.record(
  z.string().regex(/^\d+$/),
  z.string().trim().min(1).max(120),
);

// From Evento/GetAll for the First Sports installation.
const confirmedEventNames: Record<string, string> = {
  5: "Solicitado",
  6: "Separado",
  7: "Conferido",
  8: "Embarcado",
  9: "Expedido",
  10: "Nota Fiscal",
};

function eventCatalog(): Record<string, string> {
  try {
    const configured = catalogSchema.safeParse(
      JSON.parse(process.env.ZENLOG_EVENT_NAMES ?? "{}"),
    ).data;
    return { ...confirmedEventNames, ...configured };
  } catch {
    return confirmedEventNames;
  }
}

const expeditionSteps = [
  [5, "Solicitado"],
  [6, "Separado"],
  [7, "Conferido"],
  [10, "Nota Fiscal"],
  [8, "Embarcado"],
  [9, "Expedido"],
] as const;

function zenlogDate(value: string | null | undefined) {
  if (!value) return;
  const date = new Date(
    /(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : value + "-03:00",
  );
  return Number.isFinite(+date) ? date : undefined;
}

type DateEvent = {
  occurredAt: Date;
  dateOnly: boolean;
  status: ShipmentStatus;
};
type Shipment = {
  id: string;
  issuedAt: Date;
  deliveredAt: Date | null;
  status: ShipmentStatus;
  carrier: { name: string };
  invoices: { number: string; series: string }[];
  events: (DateEvent & {
    id: string;
    fingerprint: string;
    description: string;
    location: string | null;
  })[];
};
type TimelineEntry = {
  key: string;
  title: string;
  source: string;
  detail?: string;
  time?: Date;
  displayTime?: string;
};

export async function OrderJourney({
  orderId,
  createdAt,
  issuedAt,
  stage,
  shipments,
  includeZenlog = true,
}: {
  orderId: string;
  createdAt: Date;
  issuedAt: Date | null;
  stage: OrderStage | null;
  shipments: Shipment[];
  includeZenlog?: boolean;
}) {
  const records = await db.auditLog.findMany({
    where: {
      entityId: orderId,
      action: {
        in: ["ORDER_STAGE_UPDATE", ...(includeZenlog ? ["ZENLOG_STATUS"] : [])],
      },
    },
    select: { id: true, action: true, createdAt: true, snapshot: true },
  });
  const expeditions = records.flatMap((record) => {
    if (record.action !== "ZENLOG_STATUS") return [];
    const parsed = snapshot.safeParse(record.snapshot);
    return parsed.success ? [{ id: record.id, ...parsed.data }] : [];
  });
  const registered = expeditions
    .map(({ registeredAt }) => zenlogDate(registeredAt))
    .filter((date): date is Date => !!date)
    .sort((a, b) => +a - +b)[0];
  const catalog = eventCatalog();
  const timeline: TimelineEntry[] = [
    {
      key: "received",
      title: registered
        ? "Pedido registrado no ZenLOG"
        : issuedAt
          ? "Data do pedido"
          : "Pedido cadastrado no portal",
      source: registered ? "ZenLOG" : "Portal First Sports",
      time: registered ?? issuedAt ?? createdAt,
      displayTime:
        !registered && issuedAt
          ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
              issuedAt,
            )
          : undefined,
    },
  ];

  for (const record of records) {
    if (record.action !== "ORDER_STAGE_UPDATE") continue;
    const title = orderAuditStageLabel(record.action, record.snapshot);
    if (title)
      timeline.push({
        key: record.id,
        title,
        source: "Portal First Sports",
        time: record.createdAt,
      });
  }

  const completedSteps = new Map<number, Date>();
  const seenZenlogEvents = new Set<number>();
  for (const expedition of expeditions) {
    expedition.events.forEach((event, index) => {
      if (event.id != null) {
        if (seenZenlogEvents.has(event.id)) return;
        seenZenlogEvents.add(event.id);
      }
      const code = event.code ?? null;
      const label =
        event.name || (code === null ? undefined : catalog[String(code)]);
      const start = zenlogDate(event.start);
      const end = zenlogDate(event.end);
      const time = end ?? start;
      if (code !== null && time && event.status === "S") {
        const previous = completedSteps.get(code);
        if (!previous || time < previous) completedSteps.set(code, time);
      }
      timeline.push({
        key: expedition.id + "-" + index,
        title:
          label ||
          (code !== null
            ? "Evento ZenLOG · código " + code
            : "Evento de expedição"),
        source: "ZenLOG",
        detail: [
          event.status &&
            (eventLabels[event.status] ?? "Situação " + event.status),
          start && end && +start !== +end && "Início " + dateTime(start),
        ]
          .filter(Boolean)
          .join(" · "),
        time: end ?? start,
      });
    });
  }

  for (const shipment of shipments) {
    const invoices = shipment.invoices
      .map(({ number, series }) => "NF " + number + " · série " + series)
      .join(" / ");
    const reference = [invoices, shipment.carrier.name]
      .filter(Boolean)
      .join(" · ");
    if (shipment.invoices.length) {
      timeline.push({
        key: "invoice-" + shipment.id,
        title: "Nota fiscal emitida",
        source: "Faturamento",
        detail: reference,
        time: shipment.issuedAt,
        displayTime: dateOnly(shipment.issuedAt),
      });
    }
    for (const event of shipment.events) {
      if (event.fingerprint === "invoiced" && shipment.invoices.length)
        continue;
      timeline.push({
        key: event.id,
        title: statusLabels[event.status],
        source: "Rastreamento",
        detail: [reference, event.description, event.location]
          .filter(Boolean)
          .join(" · "),
        time: event.occurredAt,
        displayTime: event.dateOnly ? dateOnly(event.occurredAt) : undefined,
      });
    }
    if (
      shipment.deliveredAt &&
      !shipment.events.some(({ status }) => status === "DELIVERED")
    ) {
      timeline.push({
        key: "delivered-" + shipment.id,
        title: "Entrega confirmada",
        source: "Rastreamento",
        detail: reference,
        time: shipment.deliveredAt,
        displayTime: deliveryDateTime(shipment.deliveredAt, shipment.events),
      });
    }
  }
  timeline.sort(
    (a, b) => (a.time ? +a.time : Infinity) - (b.time ? +b.time : Infinity),
  );

  const expeditionStatuses = [
    ...new Set(
      expeditions
        .map((expedition) =>
          [
            expedition.expeditionStatus &&
              "Expedição " + expedition.expeditionStatus,
            expedition.documentStatus &&
              "Documento " + expedition.documentStatus,
            expedition.integrationStatus &&
              "Integração " + expedition.integrationStatus,
          ]
            .filter(Boolean)
            .join(" · "),
        )
        .filter(Boolean),
    ),
  ];
  const firstInvoice = shipments
    .filter(({ invoices }) => invoices.length)
    .sort((a, b) => +a.issuedAt - +b.issuedAt)[0];
  const activeShipments = shipments.filter(
    ({ status }) => status !== "CANCELLED",
  );
  const deliveredShipments = activeShipments.filter(
    ({ status }) => status === "DELIVERED",
  );
  const lastDelivery = deliveredShipments.reduce<Shipment | undefined>(
    (latest, shipment) =>
      shipment.deliveredAt &&
      (!latest?.deliveredAt || shipment.deliveredAt > latest.deliveredAt)
        ? shipment
        : latest,
    undefined,
  );
  const zenlogStages = [
    {
      label: "Inclusão no ZenLOG",
      complete: !!registered,
      value: registered ? dateTime(registered) : "Data não informada",
    },
    ...expeditionSteps.map(([id, label]) => {
      const time = completedSteps.get(id);
      return {
        label,
        complete: !!time,
        value: time ? dateTime(time) : "Aguardando registro",
      };
    }),
  ];
  const delivered =
    deliveredShipments.length > 0 &&
    deliveredShipments.length === activeShipments.length;
  const missingDate = deliveredShipments.some(
    ({ deliveredAt }) => !deliveredAt,
  );
  const portalStages = [
    {
      label: "NF impressa · data de emissão",
      complete: !!firstInvoice,
      value: firstInvoice ? dateOnly(firstInvoice.issuedAt) : "Aguardando NF",
    },
    {
      label: "Entrega ao cliente",
      complete: delivered,
      value: delivered
        ? !missingDate && lastDelivery?.deliveredAt
          ? deliveryDateTime(lastDelivery.deliveredAt, lastDelivery.events)
          : "Data não informada"
        : shipments.length > 0 || stage === "CANCELLED"
          ? orderStatus(stage, shipments)
          : "Aguardando remessa",
    },
  ];

  return (
    <section
      className="card mb-4"
      id="status-zenlog"
      aria-labelledby="order-journey-title"
    >
      <h2 id="order-journey-title">Jornada do pedido e da entrega</h2>
      {includeZenlog && (
        <>
          <h3>Expedição no ZenLOG</h3>
          <JourneyStages stages={zenlogStages} />
          {expeditions.length > 0 && (
            <p className="small mb-4">
              Os horários detalhados de separação, conferência e pesagem do
              Senior WMS ainda não estão disponíveis nesta integração.
            </p>
          )}
        </>
      )}
      <h3>Faturamento e entrega no portal</h3>
      <JourneyStages stages={portalStages} />
      {expeditionStatuses.length > 0 && (
        <details className="mb-4">
          <summary>Status técnicos do ZenLOG</summary>
          <ul>
            {expeditionStatuses.map((status) => (
              <li key={status}>{status}</li>
            ))}
          </ul>
        </details>
      )}
      <details open>
        <summary>Ver movimentações em ordem cronológica</summary>
        <ol
          className="timeline"
          aria-label="Movimentações em ordem cronológica"
        >
          {timeline.map(({ key, title, source, detail, time, displayTime }) => (
            <li key={key}>
              <strong>{title}</strong> <span className="badge">{source}</span>
              {detail && <p>{detail}</p>}
              {time ? (
                <time dateTime={time.toISOString()}>
                  {displayTime ?? dateTime(time)}
                </time>
              ) : (
                <p>Data não informada</p>
              )}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

function JourneyStages({
  stages,
}: {
  stages: { label: string; complete: boolean; value: string }[];
}) {
  return (
    <dl className="order-journey-stages">
      {stages.map(({ label, complete, value }) => (
        <div key={label}>
          <dt>
            {label}{" "}
            {complete && <span className="badge DELIVERED">Concluído</span>}
          </dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
