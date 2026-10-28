import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@prisma/client", () => ({
  ShipmentStatus: { IN_TRANSIT: "IN_TRANSIT", DELIVERED: "DELIVERED" },
}));
import { shipmentWhere } from "../src/lib/filters";
import { TrackingAvailability } from "../src/components/tracking-availability";

it("identifies missing tracking without asserting a cause", () => {
  const html = renderToStaticMarkup(
    createElement(TrackingAvailability, { error: "NOT_FOUND" }),
  );
  expect(html).toContain("Não localizada na transportadora");
  expect(html).toContain("O retorno não confirma a causa");
  expect(html).toContain("CNPJ do tomador");
});
it("clears the identification after success and ignores unrelated failures", () => {
  for (const error of [null, undefined, "AUTH_FAILED", "TIMEOUT"])
    expect(
      renderToStaticMarkup(createElement(TrackingAvailability, { error })),
    ).toBe("");
});
it("combines tracking availability with operational status and existing filters", () => {
  expect(
    shipmentWhere(
      new URLSearchParams({
        tracking: "not_found",
        status: "IN_TRANSIT",
        carrier: "BRASPRESS",
        seller: "none",
      }),
    ),
  ).toEqual({
    lastSyncError: "NOT_FOUND",
    status: "IN_TRANSIT",
    carrier: { code: "BRASPRESS" },
    sellerId: null,
  });
  expect(shipmentWhere(new URLSearchParams({ tracking: "unknown" }))).toEqual(
    {},
  );
});
