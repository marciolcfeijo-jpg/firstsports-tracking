import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AlfaAdapter } from "../integrations/carriers/alfa";
import { alfaFixture, alfaXmlFixture } from "./fixtures";
import { CarrierError, resultSchema } from "../integrations/carriers/types";
const input = {
  invoiceNumber: "123",
  invoiceSeries: "1",
  senderDocument: "11222333000181",
  payerDocument: "11222333000181",
};
const adapter = (data: unknown) =>
  new AlfaAdapter(
    vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response(JSON.stringify(data), {
            headers: { "content-type": "application/json" },
          }),
      ),
  );
beforeEach(() => vi.stubEnv("ALFA_API_KEY", "synthetic-test-token"));
afterEach(() => vi.unstubAllEnvs());
it("accepts null optional shipment dates, undelivered sections and absent extra events", async () => {
  const result = resultSchema.parse(
    await adapter({
      ...alfaFixture,
      dadosCte: {
        ...alfaFixture.dadosCte,
        dataPrivista: null,
        dataPrevista: null,
      },
      dadosEmbarque: null,
      dadosEntrega: null,
      ocorrenciasExtras: null,
    }).trackShipment(input),
  );
  expect(result.currentStatus).toBe("UNKNOWN");
  expect(result.deliveredAt).toBeUndefined();
  expect(result.estimatedDelivery).toBeUndefined();
  expect(result.events).toEqual([]);
});
it("preserves in-transit dates while accepting nullable movement fields and missing delivery", async () => {
  const result = resultSchema.parse(
    await adapter({
      ...alfaFixture,
      dadosEntrega: { dataEntrega: null, urlComprovante: null },
      dadosEmbarque: [
        {
          cidadeOrigem: "Unidade sintética",
          cidadeDestino: null,
          horaSaida: "2026-10-27 -- 05:44",
          horaChegada: null,
        },
      ],
      ocorrenciasExtras: null,
    }).trackShipment(input),
  );
  expect(result.currentStatus).toBe("IN_TRANSIT");
  expect(result.events).toHaveLength(1);
  expect(result.events[0].occurredAt).toBe("2026-10-27T08:44:00.000Z");
  expect(result.estimatedDelivery).toBe("2026-10-29T02:59:59.000Z");
  expect(result.deliveredAt).toBeUndefined();
});
it("retains the existing JSON and XML contracts", async () => {
  expect((await adapter(alfaFixture).trackShipment(input)).currentStatus).toBe(
    "IN_TRANSIT",
  );
  const xml = new AlfaAdapter(
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(alfaXmlFixture, {
          headers: { "content-type": "application/xml" },
        }),
      ),
  );
  expect(resultSchema.parse(await xml.trackShipment(input))).toMatchObject({
    currentStatus: "DELIVERED",
    deliveredAt: "2026-10-25T18:30:00.000Z",
  });
});
it.each([
  [5, "AUTH_FAILED"],
  [9, "NOT_FOUND"],
  [7, "INVOICE_UNAVAILABLE"],
])(
  "reports business code %s despite incomplete optional sections",
  async (status, code) => {
    await expect(
      adapter({
        status,
        dadosCte: { numeroNota: null },
        dadosEntrega: null,
      }).trackShipment(input),
    ).rejects.toMatchObject({ code });
  },
);
it.each([null, undefined])(
  "never treats missing success shipment data %s as a valid tracking result",
  async (dadosCte) => {
    await expect(
      adapter({ status: 2, dadosCte }).trackShipment(input),
    ).rejects.toMatchObject({ code: "MISSING_TRACKING_DATA" });
  },
);
it("keeps fiscal identity checking strict", async () => {
  await expect(
    adapter({
      ...alfaFixture,
      dadosCte: { ...alfaFixture.dadosCte, numeroNota: 999 },
    }).trackShipment(input),
  ).rejects.toMatchObject({ code: "INVOICE_MISMATCH" });
});
it("exposes only fixed schema paths and primitive type names on incompatibility", async () => {
  const raw = {
    ...alfaFixture,
    dadosCte: {
      ...alfaFixture.dadosCte,
      numeroNota: { document: "PRIVATE CUSTOMER" },
    },
    secret: "PRIVATE TOKEN",
  };
  try {
    await adapter(raw).trackShipment(input);
    expect.fail("Invalid fiscal identity was accepted");
  } catch (error) {
    expect(error).toBeInstanceOf(CarrierError);
    const e = error as CarrierError;
    expect(e.code).toBe("INVALID_ALFA_RESPONSE");
    expect(e.responseDiagnostics).toMatchObject({
      carrier: "ALFA",
      format: "json",
      issues: [
        {
          field: "dadosCte.numeroNota",
          code: "invalid_union",
          receivedType: "object",
        },
      ],
    });
    const output = JSON.stringify(e.responseDiagnostics);
    expect(output).not.toContain("PRIVATE");
    expect(output).not.toContain("secret");
    expect(output).not.toContain("document");
  }
});
it.each([null, {}, { status: null }, { status: "<private value>" }])(
  "rejects unknown response structures with safe diagnostics",
  async (raw) => {
    await expect(adapter(raw).trackShipment(input)).rejects.toMatchObject({
      code: "INVALID_ALFA_RESPONSE",
      responseDiagnostics: { carrier: "ALFA" },
    });
  },
);
