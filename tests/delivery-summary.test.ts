import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DeliverySummary } from "../src/components/delivery-summary";
import { deliveryMetrics } from "../src/lib/delivery-metrics";
it("explains the distribution, missing dates and overlapping attention indicators", () => {
  const html = renderToStaticMarkup(
    createElement(DeliverySummary, { metrics: deliveryMetrics([]) }),
  );
  for (const label of [
    "Antes do prazo",
    "No dia previsto",
    "Depois do prazo",
    "Em atraso",
    "Em ocorrência",
    "Sem previsão",
    "sem comparação de prazo",
    "não devem ser somados",
  ])
    expect(html).toContain(label);
  expect(html).toContain("Ainda não há entregas com datas suficientes");
  expect(html).not.toContain("NaN");
  expect(html).not.toContain("Infinity");
});
it("labels the on-time percentage as before plus on the promised date", () => {
  const metrics = deliveryMetrics([
    {
      status: "DELIVERED",
      deliveredAt: "2026-10-27T15:00:00Z",
      estimatedDelivery: "2026-10-28T15:00:00Z",
      carrierId: "carrier",
    },
  ]);
  const html = renderToStaticMarkup(
    createElement(DeliverySummary, { metrics }),
  );
  expect(html).toContain("100%");
  expect(html).toContain("Antes do prazo + no dia previsto");
  expect(html).toContain('role="img"');
});

it("links the open shipment cards to the same filters on the shipment list", () => {
  const html = renderToStaticMarkup(
    createElement(DeliverySummary, {
      metrics: deliveryMetrics([]),
      filters: { carrier: "BRASPRESS", state: "SP", page: "3" },
    }),
  );
  for (const attention of ["open", "late", "exception", "no-forecast"])
    expect(html).toContain(
      `/admin/remessas?carrier=BRASPRESS&amp;state=SP&amp;attention=${attention}`,
    );
  expect(html).not.toContain("page=3");
});

it("keeps the seller dashboard drilldowns in the authenticated portfolio", () => {
  const html = renderToStaticMarkup(
    createElement(DeliverySummary, {
      metrics: deliveryMetrics([]),
      filters: { status: "IN_TRANSIT", carrier: "BRASPRESS" },
      listPath: "/admin/carteira",
    }),
  );
  expect(html).toContain(
    "/admin/carteira?status=IN_TRANSIT&amp;carrier=BRASPRESS&amp;attention=late",
  );
  expect(html).not.toContain("/admin/remessas");
});

it("opens each delivery timing group in the seller portfolio and preserves the selected filters", () => {
  const html = renderToStaticMarkup(
    createElement(DeliverySummary, {
      metrics: deliveryMetrics([
        {
          status: "DELIVERED",
          deliveredAt: null,
          estimatedDelivery: null,
          carrierId: "carrier",
        },
      ]),
      filters: { carrier: "BRASPRESS", page: "2" },
      timingPath: "/admin/carteira/visao-geral/entregas",
    }),
  );
  for (const timing of ["early", "onDay", "after", "unclassified"])
    expect(html).toContain(
      `/admin/carteira/visao-geral/entregas?carrier=BRASPRESS&amp;timing=${timing}`,
    );
  expect(html).not.toContain("page=2");
});
