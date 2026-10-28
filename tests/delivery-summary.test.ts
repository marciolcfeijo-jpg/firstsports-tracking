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
