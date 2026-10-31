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
    vi.fn<typeof fetch>().mockImplementation(
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
    vi.fn<typeof fetch>().mockResolvedValue(
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

it.each(["", "   ", "\n\t"])(
  "treats empty delivery section %j as pending without discarding movement history",
  async (dadosEntrega) => {
    const result = resultSchema.parse(
      await adapter({ ...alfaFixture, dadosEntrega }).trackShipment(input),
    );
    expect(result.currentStatus).toBe("IN_TRANSIT");
    expect(result.deliveredAt).toBeUndefined();
    expect(result.estimatedDelivery).toBe("2026-10-29T02:59:59.000Z");
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.some((event) => event.status === "DELIVERED")).toBe(
      false,
    );
  },
);
it.each(["PRIVATE UPSTREAM MESSAGE", '{"dataEntrega":"2026-10-27"}'])(
  "does not silently discard or interpret a nonempty delivery string",
  async (dadosEntrega) => {
    try {
      await adapter({ ...alfaFixture, dadosEntrega }).trackShipment(input);
      expect.fail("Unexpected delivery content accepted");
    } catch (error) {
      expect(error).toBeInstanceOf(CarrierError);
      const failure = error as CarrierError;
      expect(failure.responseDiagnostics).toMatchObject({
        issues: [
          {
            field: "dadosEntrega",
            receivedType: "string",
            stringKind: "nonempty",
          },
        ],
      });
      expect(JSON.stringify(failure.responseDiagnostics)).not.toContain(
        dadosEntrega,
      );
    }
  },
);
it("still confirms a delivery supplied as a proper object", async () => {
  const result = resultSchema.parse(
    await adapter({
      ...alfaFixture,
      dadosEntrega: { dataEntrega: "2026-10-27 15:30:00" },
    }).trackShipment(input),
  );
  expect(result.currentStatus).toBe("DELIVERED");
  expect(result.deliveredAt).toBe("2026-10-27T18:30:00.000Z");
});

it.each(
  [undefined, null, "", {}, { dataEntrega: null }, { dataEntrega: "" }].map(
    (dadosEntrega) => ({ dadosEntrega }),
  ),
)(
  "confirms a dated delivery occurrence when the delivery section is missing ($dadosEntrega)",
  async ({ dadosEntrega }) => {
    const result = resultSchema.parse(
      await adapter({
        ...alfaFixture,
        dadosEmbarque: null,
        dadosEntrega,
        ocorrenciasExtras: [
          {
            codigoOcorrencia: 3,
            dataOcorrencia: "26/09/2026 08:00",
            descricaoOcorrencia: "Comprovante digitalizado",
          },
          {
            codigoOcorrencia: 2,
            dataOcorrencia: "25/09/2026 20:08",
            descricaoOcorrencia: "ENTREGA REALIZADA",
          },
          {
            codigoOcorrencia: 1,
            dataOcorrencia: "25/09/2026 09:20",
            descricaoOcorrencia: "MERCADORIA EM ROTA DE ENTREGA",
          },
        ],
      }).trackShipment(input),
    );
    expect(result).toMatchObject({
      currentStatus: "DELIVERED",
      deliveredAt: "2026-09-25T23:08:00.000Z",
    });
    expect(result.events[1]).toMatchObject({
      status: "DELIVERED",
      occurredAt: result.deliveredAt,
      dateOnly: false,
    });
    expect(result.events[2].status).toBe("UNKNOWN");
  },
);

it("preserves date-only precision when delivery is confirmed by an occurrence", async () => {
  const result = resultSchema.parse(
    await adapter({
      ...alfaFixture,
      dadosEmbarque: null,
      dadosEntrega: null,
      ocorrenciasExtras: [
        {
          codigoOcorrencia: 1,
          dataOcorrencia: "25/09/2026",
          descricaoOcorrencia: "ENTREGA REALIZADA",
        },
      ],
    }).trackShipment(input),
  );
  expect(result).toMatchObject({
    currentStatus: "DELIVERED",
    deliveredAt: "2026-09-25T03:00:00.000Z",
  });
  expect(
    result.events.find((event) => event.status === "DELIVERED"),
  ).toMatchObject({ dateOnly: true, occurredAt: result.deliveredAt });
});

it("prefers the explicit delivery date when it differs from the occurrence", async () => {
  const result = resultSchema.parse(
    await adapter({
      ...alfaFixture,
      dadosEmbarque: null,
      dadosEntrega: { dataEntrega: "25/09/2026 20:08" },
      ocorrenciasExtras: [
        {
          codigoOcorrencia: 1,
          dataOcorrencia: "25/09/2026 20:10",
          descricaoOcorrencia: "ENTREGA REALIZADA",
        },
      ],
    }).trackShipment(input),
  );
  expect(result).toMatchObject({
    currentStatus: "DELIVERED",
    deliveredAt: "2026-09-25T23:08:00.000Z",
  });
});

it.each([
  ["NÃO ENTREGUE - DESTINATÁRIO AUSENTE", "EXCEPTION"],
  ["MERCADORIA EM ROTA DE ENTREGA", "OUT_FOR_DELIVERY"],
])("does not infer delivery from %s", async (description, status) => {
  const result = resultSchema.parse(
    await adapter({
      ...alfaFixture,
      dadosEmbarque: null,
      dadosEntrega: null,
      ocorrenciasExtras: [
        {
          codigoOcorrencia: 1,
          dataOcorrencia: "25/09/2026 20:08",
          descricaoOcorrencia: description,
        },
      ],
    }).trackShipment(input),
  );
  expect(result.currentStatus).toBe(status);
  expect(result.deliveredAt).toBeUndefined();
});

it("keeps a later return status instead of restoring an earlier delivery occurrence", async () => {
  const result = resultSchema.parse(
    await adapter({
      ...alfaFixture,
      dadosEmbarque: null,
      dadosEntrega: null,
      ocorrenciasExtras: [
        {
          codigoOcorrencia: 1,
          dataOcorrencia: "25/09/2026 20:08",
          descricaoOcorrencia: "ENTREGA REALIZADA",
        },
        {
          codigoOcorrencia: 2,
          dataOcorrencia: "26/09/2026 09:00",
          descricaoOcorrencia: "DEVOLVIDO AO REMETENTE",
        },
      ],
    }).trackShipment(input),
  );
  expect(result.currentStatus).toBe("RETURNED");
  expect(result.deliveredAt).toBeUndefined();
});

it("classifies the reported unit departure as in transit and keeps a later administrative record", async () => {
  const result = resultSchema.parse(
    await adapter({
      ...alfaFixture,
      dadosEntrega: "",
      dadosEmbarque: null,
      ocorrenciasExtras: [
        {
          codigoOcorrencia: 1,
          dataOcorrencia: "26/10/2026 21:55",
          descricaoOcorrencia: "PROCESSO DE TRANSPORTE INICIADO",
        },
        {
          codigoOcorrencia: 2,
          dataOcorrencia: "27/10/2026 05:44",
          descricaoOcorrencia: "SAÍDA DA UNIDADE - DE JOINVILLE PARA GUARULHOS",
        },
        {
          codigoOcorrencia: 3,
          dataOcorrencia: "27/10/2026 05:45",
          descricaoOcorrencia: "Comprovante digitalizado",
        },
      ],
    }).trackShipment(input),
  );
  expect(result.currentStatus).toBe("IN_TRANSIT");
  expect(result.events[1]).toMatchObject({
    status: "IN_TRANSIT",
    occurredAt: "2026-10-27T08:44:00.000Z",
  });
  expect(result.events[2].status).toBe("UNKNOWN");
  expect(result.deliveredAt).toBeUndefined();
});
