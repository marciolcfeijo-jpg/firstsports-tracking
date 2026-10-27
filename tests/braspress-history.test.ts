import { afterEach, expect, it, vi } from "vitest";
import {
  BraspressAdapter,
  braspressStructure,
} from "../integrations/carriers/braspress";
import { braspressFixture } from "./fixtures";
const input = {
  invoiceNumber: "123",
  invoiceSeries: "1",
  senderDocument: "11222333000181",
  payerDocument: "11222333000181",
};
const summary = {
  ...braspressFixture.conhecimentos[0],
  timeline: undefined,
  ocorrencias: undefined,
};
const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
function adapter(data: unknown) {
  vi.stubEnv("BRASPRESS_USERNAME", "synthetic-user");
  vi.stubEnv("BRASPRESS_PASSWORD", "synthetic-password");
  return new BraspressAdapter(vi.fn().mockResolvedValue(json(data)));
}
afterEach(() => vi.unstubAllEnvs());
it("reads complete history at the root instead of silently discarding it", async () => {
  const timeline = [
    { descricao: "Encomenda na origem", data: "20/10/2026 10:00:00" },
    { descricao: "Em viagem para destino", data: "21/10/2026 11:00:00" },
    { descricao: "Chegada no destino", data: "22/10/2026 12:00:00" },
    { descricao: "Em rota de entrega", data: "23/10/2026 13:00:00" },
    { descricao: "Entrega realizada", data: null },
  ];
  const result = await adapter({
    conhecimentos: [{ ...summary, status: "EM ROTA DE ENTREGA" }],
    timeline,
    ocorrencias: [timeline[1]],
  }).trackShipment(input);
  expect(result.events).toHaveLength(4);
  expect(result.events.map((e) => e.status)).toEqual([
    "PICKED_UP",
    "IN_TRANSIT",
    "IN_TRANSIT",
    "OUT_FOR_DELIVERY",
  ]);
  expect(result.currentStatus).toBe("OUT_FOR_DELIVERY");
  expect(result.deliveredAt).toBeUndefined();
  expect(result.diagnostics).toMatchObject({
    timelineReceived: 5,
    occurrencesReceived: 1,
    undatedReceived: 1,
    eventsNormalized: 4,
    historySource: "raiz",
  });
});
it("still reads nested history and deduplicates the same events repeated at both levels", async () => {
  const timeline = braspressFixture.conhecimentos[0].timeline;
  const result = await adapter({
    conhecimentos: braspressFixture.conhecimentos,
    timeline,
  }).trackShipment(input);
  expect(result.events).toHaveLength(2);
  expect(result.diagnostics?.historySource).toBe("ambos");
});
it("does not mix an unscoped root history between different invoices or knowledge records", async () => {
  const raw = {
    conhecimentos: [
      summary,
      { ...summary, numero: 999, notasFiscais: [{ numero: 999, serie: 1 }] },
    ],
    timeline: [{ descricao: "Em transporte", data: "20/10/2026" }],
  };
  await expect(adapter(raw).trackShipment(input)).rejects.toThrow(
    "AMBIGUOUS_TRACKING_HISTORY",
  );
});
it("maps operational occurrences and uses the recorded delivery time rather than invented midnight", async () => {
  const result = await adapter({
    conhecimentos: [{ ...summary, dataEntrega: "24/10/2026" }],
    ocorrencias: [
      { descricao: "Em viagem", data: "21/10/2026 10:00:00" },
      { descricao: "ENTREGA REALIZADA", data: "24/10/2026 09:00:00" },
    ],
  }).trackShipment(input);
  expect(result.events.map((e) => e.status)).toEqual([
    "IN_TRANSIT",
    "DELIVERED",
  ]);
  expect(result.deliveredAt).toBe("2026-10-24T12:00:00.000Z");
  expect(result.events).toHaveLength(2);
  expect(result.events.at(-1)?.dateOnly).toBe(false);
});
it("structural diagnostics contain only field names and counts, not personal or credential values", () => {
  const raw = {
    conhecimentos: [
      {
        ...summary,
        destinatario: {
          nome: "PRIVATE_PERSON_VALUE",
          documento: "PRIVATE_DOCUMENT_VALUE",
        },
      },
    ],
    trackingEvents: [
      { descricao: "PRIVATE_EVENT_VALUE", data: "PRIVATE_DATE_VALUE" },
    ],
    authorization: "PRIVATE_SECRET_VALUE",
  };
  const structure = braspressStructure(raw);
  const serialized = JSON.stringify(structure);
  for (const value of [
    "PRIVATE_PERSON_VALUE",
    "PRIVATE_DOCUMENT_VALUE",
    "PRIVATE_EVENT_VALUE",
    "PRIVATE_DATE_VALUE",
    "PRIVATE_SECRET_VALUE",
  ])
    expect(serialized).not.toContain(value);
  expect(structure.rootFields).toContain("trackingEvents");
  expect(
    structure.arrayFields.some((field) => field.includes("trackingEvents: 1")),
  ).toBe(true);
});
it("reports absence honestly when neither supported location contains dated history", async () => {
  const result = await adapter({ conhecimentos: [summary] }).trackShipment(
    input,
  );
  expect(result.events).toEqual([]);
  expect(result.diagnostics).toMatchObject({
    historySource: "ausente",
    eventsNormalized: 0,
  });
});
