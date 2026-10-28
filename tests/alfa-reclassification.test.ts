import { expect, it, vi } from "vitest";
vi.mock("../src/lib/db", () => ({ db: {} }));
import { persistTracking, fingerprint } from "../src/lib/sync";
import { mapStatus } from "../integrations/carriers/normalize";
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
