import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TrackingOverview } from "../src/components/tracking-overview";

const shipment = {
  orderNumber: "TEST-100",
  invoices: [{ number: "100", series: "1" }],
  status: "IN_TRANSIT" as const,
  estimatedDelivery: null,
  deliveredAt: null,
  events: [
    {
      occurredAt: "2026-10-20T15:00:00Z",
      dateOnly: false,
      description: "Em transporte",
      location: "Unidade fictícia",
      status: "IN_TRANSIT" as const,
    },
  ],
};
it("shows invoice summary and only confirms stages supported by evidence", () => {
  const html = renderToStaticMarkup(createElement(TrackingOverview, shipment));
  expect(html).toContain("100 / série 1");
  expect(html).toContain("Unidade fictícia");
  expect(html).toContain("Não informado pela integração");
  expect(html.match(/class="recorded"/g)).toHaveLength(1);
  expect(html.match(/Sem registro recebido/g)).toHaveLength(4);
});
it("confirms delivery from the carrier delivery date without inventing intermediate stages", () => {
  const html = renderToStaticMarkup(
    createElement(TrackingOverview, {
      ...shipment,
      events: [],
      status: "DELIVERED",
      deliveredAt: "2026-10-25T15:00:00Z",
    }),
  );
  expect(html).toContain("25/10/2026");
  expect(html.match(/class="recorded"/g)).toHaveLength(1);
  expect(html).not.toContain("Ainda não confirmada");
});

it("does not show midnight as a confirmed delivery time without a timed event", () => {
  const html = renderToStaticMarkup(
    createElement(TrackingOverview, {
      ...shipment,
      events: [],
      status: "DELIVERED",
      deliveredAt: "2026-10-25T03:00:00Z",
    }),
  );
  expect(html).toContain("horário não informado");
  expect(html).not.toContain("00:00");
});

it("shows the documented normal delivery type and confirmed time after a proof record", () => {
  const html = renderToStaticMarkup(
    createElement(TrackingOverview, {
      ...shipment,
      status: "DELIVERED",
      deliveredAt: "2026-09-15T14:57:00Z",
      events: [
        {
          occurredAt: "2026-09-15T14:57:00Z",
          dateOnly: false,
          description: "Entrega Realizada Normalmente",
          status: "DELIVERED",
          location: null,
        },
        {
          occurredAt: "2026-09-15T14:58:00Z",
          dateOnly: false,
          description: "Comprovante digitalizado",
          status: "UNKNOWN",
          location: null,
        },
      ],
    }),
  );
  expect(html).toContain("Normal (conforme ocorrência)");
  expect(html).toContain("Entregue");
  expect(html).toContain("15/09/2026");
  expect(html).toContain("11:57");
  expect(html).not.toContain("Ainda não confirmada");
});
it("does not infer a normal delivery type without explicit carrier evidence", () => {
  const html = renderToStaticMarkup(
    createElement(TrackingOverview, {
      ...shipment,
      status: "DELIVERED",
      deliveredAt: "2026-09-15T14:57:00Z",
      events: [
        {
          occurredAt: "2026-09-15T14:57:00Z",
          dateOnly: false,
          description: "Entrega concluída",
          status: "DELIVERED",
          location: null,
        },
      ],
    }),
  );
  expect(html).toContain("Não informado pela integração");
  expect(html).not.toContain("Normal (conforme ocorrência)");
});

it("uses the same Em viagem label in the summary and journey stage", () => {
  const html = renderToStaticMarkup(createElement(TrackingOverview, shipment));
  expect(html.match(/Em viagem/g)).toHaveLength(2);
  expect(html).not.toContain("Aguardando informações");
});
