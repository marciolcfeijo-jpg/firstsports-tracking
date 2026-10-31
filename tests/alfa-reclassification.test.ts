import { expect, it, vi } from "vitest";
vi.mock("../src/lib/db", () => ({ db: {} }));
import { persistTracking, fingerprint } from "../src/lib/sync";
import { mapStatus } from "../integrations/carriers/normalize";
import { AlfaAdapter } from "../integrations/carriers/alfa";
import { alfaFixture } from "./fixtures";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrackingOverview } from "../src/components/tracking-overview";
it.each([
  "SAÍDA DA UNIDADE - DE JOINVILLE PARA GUARULHOS",
  "Saída da filial - para destino",
  "SAIDA DA BASE - TRANSFERENCIA",
])("maps a unit departure to a journey: %s", (description) => {
  expect(mapStatus(description)).toBe("IN_TRANSIT");
});
it.each([
  ["SAIU PARA ENTREGA", "OUT_FOR_DELIVERY"],
  ["SAÍDA DA UNIDADE CANCELADA", "CANCELLED"],
  ["NÃO HOUVE SAÍDA DA UNIDADE", "UNKNOWN"],
])("keeps explicit delivery/negative states for %s", (description, status) => {
  expect(mapStatus(description)).toBe(status);
});
it("replaces only the matching old UNKNOWN classification during Alfa refresh", async () => {
  const event = {
    externalCode: "synthetic",
    occurredAt: "2026-10-27T08:44:00.000Z",
    description: "SAÍDA DA UNIDADE - DE JOINVILLE PARA GUARULHOS",
    status: "IN_TRANSIT" as const,
  };
  const tx = {
    trackingEvent: { deleteMany: vi.fn(), createMany: vi.fn() },
    shipment: { update: vi.fn() },
  };
  await persistTracking(
    tx as unknown as Parameters<typeof persistTracking>[0],
    "shipment",
    { carrier: "ALFA", currentStatus: "IN_TRANSIT", events: [event] },
  );
  expect(tx.trackingEvent.deleteMany).toHaveBeenCalledWith({
    where: {
      shipmentId: "shipment",
      status: "UNKNOWN",
      fingerprint: { in: [fingerprint({ ...event, status: "UNKNOWN" })] },
    },
  });
  expect(tx.trackingEvent.createMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: [
        expect.objectContaining({
          fingerprint: fingerprint(event),
          status: "IN_TRANSIT",
        }),
      ],
    }),
  );
  expect(tx.shipment.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ status: "IN_TRANSIT" }),
    }),
  );
});

it("saves and displays delivery status and date from Alfa occurrence-only confirmation", async () => {
  vi.stubEnv("ALFA_API_KEY", "synthetic-test-token");
  try {
    const adapter = new AlfaAdapter(async () =>
      Response.json({
        ...alfaFixture,
        dadosEmbarque: null,
        dadosEntrega: null,
        ocorrenciasExtras: [
          {
            codigoOcorrencia: 1,
            dataOcorrencia: "25/09/2026 20:08",
            descricaoOcorrencia: "ENTREGA REALIZADA",
          },
        ],
      }),
    );
    const result = await adapter.trackShipment({
      invoiceNumber: "123",
      invoiceSeries: "1",
      senderDocument: "11222333000181",
    });
    const tx = {
      trackingEvent: { deleteMany: vi.fn(), createMany: vi.fn() },
      shipment: { update: vi.fn() },
    };
    await persistTracking(
      tx as unknown as Parameters<typeof persistTracking>[0],
      "shipment",
      result,
    );
    expect(tx.shipment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "shipment" },
        data: expect.objectContaining({
          status: "DELIVERED",
          deliveredAt: new Date("2026-09-25T23:08:00.000Z"),
        }),
      }),
    );
    const html = renderToStaticMarkup(
      createElement(TrackingOverview, {
        orderNumber: "TEST-123",
        invoices: [{ number: "123", series: "1" }],
        status: result.currentStatus,
        estimatedDelivery: result.estimatedDelivery ?? null,
        deliveredAt: result.deliveredAt ?? null,
        events: result.events.map((event) => ({
          ...event,
          dateOnly: event.dateOnly ?? false,
          location: event.location ?? null,
        })),
      }),
    );
    expect(html).toContain("Entregue");
    expect(html).toContain("25/09/2026, 20:08");
    expect(html).not.toContain("Aguardando informações");
    expect(html).not.toContain("Ainda não confirmada");
  } finally {
    vi.unstubAllEnvs();
  }
});
