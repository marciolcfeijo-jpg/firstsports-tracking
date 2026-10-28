import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../src/lib/db", () => ({
  db: {
    carrier: { findMany: async () => [{ code: "ICARO", name: "Icaro" }] },
    adminUser: {
      findMany: async () => [
        { id: "active-user", email: "active@example.test", active: true },
        { id: "inactive-user", email: "inactive@example.test", active: false },
      ],
    },
  },
}));
import { ShipmentForm } from "../src/components/shipment-form";
import { Filters } from "../src/components/filters";
it("offers an optional seller selection in the shipment form", () => {
  const html = renderToStaticMarkup(
    createElement(ShipmentForm, {
      carriers: [{ code: "ICARO", name: "Icaro" }],
      sellers: [{ id: "active-user", name: "active@example.test" }],
    }),
  );
  expect(html).toContain('name="vendedor_id"');
  expect(html).toContain('value="active-user"');
  expect(html).toContain("active@example.test");
  expect(html).toContain("Sem vendedor");
});
it("keeps historical inactive users filterable and preserves the selection", async () => {
  const html = renderToStaticMarkup(
    await Filters({ values: { seller: "inactive-user" } }),
  );
  expect(html).toContain('name="seller"');
  expect(html).toContain("Todos os vendedores");
  expect(html).toContain("Sem vendedor");
  expect(html).toContain("inactive@example.test (inativo)");
  expect(html).toMatch(/value="inactive-user"[^>]*selected=""/);
});
