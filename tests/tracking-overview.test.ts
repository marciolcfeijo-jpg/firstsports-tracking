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
