import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrackingHistory } from "../src/components/tracking-history";

describe("complete carrier history", () => {
  it("shows every event, including old locations, without a collapsed section", () => {
    const events = Array.from({ length: 12 }, (_, index) => ({
      id: String(index),
      occurredAt: new Date(Date.UTC(2026, 9, index + 1, 15)),
      dateOnly: index === 0,
      description: `Movimentação ${index + 1}`,
      location: `Unidade ${index + 1}`,
      status: "IN_TRANSIT" as const,
    }));
    const html = renderToStaticMarkup(
      createElement(TrackingHistory, { events }),
    );
    expect(html.match(/<li>/g)).toHaveLength(12);
    expect(html).not.toContain("<details");
    for (const event of events) {
      expect(html).toContain(event.description);
      expect(html).toContain(event.location);
    }
    expect(html.indexOf("Movimentação 12")).toBeLessThan(
      html.indexOf("Movimentação 1<"),
    );
    expect(html).toContain("horário não informado");
    expect(events[0].id).toBe("0");
  });
  it("explains when no movements have been received", () => {
    expect(
      renderToStaticMarkup(createElement(TrackingHistory, { events: [] })),
    ).toContain("Nenhuma movimentação disponível.");
  });
});
