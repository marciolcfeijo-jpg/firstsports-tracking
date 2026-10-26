import { describe, it, expect, vi, afterEach } from "vitest";
import { BraspressAdapter } from "../integrations/carriers/braspress";
import { AlfaAdapter } from "../integrations/carriers/alfa";
import { carrierRequest, checkedUrl } from "../integrations/carriers/http";
import { carrierDate, mapStatus } from "../integrations/carriers/normalize";
import {
  normalizedFixture,
  braspressFixture,
  alfaFixture,
  alfaXmlFixture,
} from "./fixtures";
import { backoff, fingerprint } from "../src/lib/sync";
const input = {
  invoiceNumber: "123",
  invoiceSeries: "1",
  senderDocument: "11222333000181",
  payerDocument: "11222333000181",
};
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
afterEach(() => vi.unstubAllEnvs());
describe("carrier contracts — synthetic fixtures based on official docs, NOT live homologation", () => {
  it("normalizes Braspress v3 and builds authenticated GET using payer CNPJ", async () => {
    vi.stubEnv("BRASPRESS_USERNAME", "fixture-user");
    vi.stubEnv("BRASPRESS_PASSWORD", "fixture-secret");
    const fetcher = vi.fn().mockResolvedValue(json(braspressFixture));
    const adapter = new BraspressAdapter(fetcher);
    expect(adapter.normalizeEvents(braspressFixture)[0].status).toBe(
      "PICKED_UP",
    );
    const result = await adapter.trackShipment(input);
    expect(result.currentStatus).toBe("IN_TRANSIT");
    expect(result.estimatedDelivery).toBe("2026-10-29T02:59:59.000Z");
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://api.braspress.com/v3/tracking/byNf/11222333000181/123/json",
    );
    expect(fetcher.mock.calls[0][1].headers.Authorization).toMatch(/^Basic /);
  });
  it("rejects absent payer, ambiguous Braspress records and HTTP 200 errors", async () => {
    vi.stubEnv("BRASPRESS_USERNAME", "fixture");
    vi.stubEnv("BRASPRESS_PASSWORD", "fixture");
    await expect(
      new BraspressAdapter().trackShipment({
        ...input,
        payerDocument: undefined,
      }),
    ).rejects.toThrow("PAYER_CNPJ_REQUIRED");
    await expect(
      new BraspressAdapter(
        vi.fn().mockResolvedValue(
          json({
            conhecimentos: [
              ...braspressFixture.conhecimentos,
              ...braspressFixture.conhecimentos,
            ],
          }),
        ),
      ).trackShipment(input),
    ).rejects.toThrow("AMBIGUOUS");
    expect(() =>
      new BraspressAdapter().normalizeEvents({ statusCode: 401 }),
    ).toThrow("AUTH_FAILED");
  });
  it("keeps date-only precision and omits undated future Braspress steps", () => {
    const data = {
      conhecimentos: [
        {
          ...braspressFixture.conhecimentos[0],
          timeline: [
            { descricao: "Coletado", data: "24/10/2026" },
            { descricao: "Saiu para entrega", data: null },
          ],
        },
      ],
    };
    const events = new BraspressAdapter().normalizeEvents(data);
    expect(events).toHaveLength(1);
    expect(events[0].dateOnly).toBe(true);
  });
  it("uses Alfa JSON contract without treating success code as delivery", async () => {
    vi.stubEnv("ALFA_API_KEY", "synthetic-key");
    const fetcher = vi.fn().mockResolvedValue(json(alfaFixture));
    const result = await new AlfaAdapter(fetcher).trackShipment(input);
    expect(result.currentStatus).toBe("IN_TRANSIT");
    expect(result.deliveredAt).toBeUndefined();
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      idr: "synthetic-key",
      merNF: 123,
      tomCnpj: "11222333000181",
      modoJson: 1,
    });
  });
  it("parses actual XML shape, delivery date and an allowed proof URL", async () => {
    vi.stubEnv("ALFA_API_KEY", "synthetic-key");
    const fetcher = vi.fn().mockResolvedValue(
      new Response(alfaXmlFixture, {
        headers: { "content-type": "application/xml" },
      }),
    );
    const result = await new AlfaAdapter(fetcher).trackShipment(input);
    expect(result.currentStatus).toBe("DELIVERED");
    expect(result.deliveredAt).toBe("2026-10-25T18:30:00.000Z");
    expect(result.events.some((e) => e.status === "OUT_FOR_DELIVERY")).toBe(
      true,
    );
    expect(result.proofOfDeliveryUrl).toContain(
      "areadocliente.alfatransportes.com.br",
    );
  });
  it.each([
    [1, "TRACKING_INCOMPLETE"],
    [3, "UPSTREAM_DATABASE_ERROR"],
    [5, "AUTH_FAILED"],
    [9, "NOT_FOUND"],
  ])("handles Alfa business error %s", (status, code) => {
    expect(() => new AlfaAdapter().normalizeEvents({ status })).toThrow(
      String(code),
    );
  });
  it("rejects XML entities and malformed payloads", () => {
    expect(() =>
      new AlfaAdapter().normalizeEvents(
        '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>',
      ),
    ).toThrow("INVALID_XML");
    expect(() => new AlfaAdapter().normalizeEvents({ status: 2 })).toThrow(
      "MISSING_TRACKING_DATA",
    );
  });
  it("does not interpret HTTP 200 HTML as tracking", async () => {
    await expect(
      carrierRequest(
        "https://example.com",
        {},
        vi.fn().mockResolvedValue(
          new Response("<html/>", {
            headers: { "content-type": "text/html" },
          }),
        ),
      ),
    ).rejects.toThrow("UNSUPPORTED_RESPONSE_FORMAT");
  });
  it("classifies auth, rate limit, malformed JSON and timeout", async () => {
    for (const [status, code] of [
      [401, "AUTH_FAILED"],
      [429, "RATE_LIMITED"],
      [500, "UPSTREAM_HTTP_ERROR"],
    ] as const)
      await expect(
        carrierRequest(
          "https://example.com",
          {},
          vi.fn().mockResolvedValue(new Response("", { status })),
        ),
      ).rejects.toThrow(code);
    await expect(
      carrierRequest(
        "https://example.com",
        {},
        vi.fn().mockResolvedValue(
          new Response("invalid", {
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    ).rejects.toThrow("INVALID_JSON");
    await expect(
      carrierRequest(
        "https://example.com",
        {},
        vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")),
      ),
    ).rejects.toThrow("TIMEOUT");
  });
  it("uses São Paulo dates, conservative statuses, bounded backoff and stable fingerprints", () => {
    expect(carrierDate("2026-10-24 -- 14:00")).toBe("2026-10-24T17:00:00.000Z");
    expect(() => carrierDate("2026-02-30")).toThrow("INVALID_CARRIER_DATE");
    expect(mapStatus("NÃO ENTREGUE - AUSENTE")).toBe("EXCEPTION");
    expect(mapStatus("código novo")).toBe("UNKNOWN");
    expect(checkedUrl("https://evil.com", "api.braspress.com")).toBeUndefined();
    expect(backoff(0)).toBe(300000);
    expect(backoff(100)).toBe(86400000);
    expect(fingerprint(normalizedFixture.events[0])).toBe(
      fingerprint({ ...normalizedFixture.events[0] }),
    );
  });
});

it("recognizes Braspress portal stage descriptions without inventing dates", () => {
  expect(mapStatus("ENCOMENDA NA FILIAL ORIGEM - UNIDADE TESTE")).toBe(
    "PICKED_UP",
  );
  expect(
    mapStatus("ENCOMENDA EM TRANSFERÊNCIA ENTRE AS FILIAIS DA BRASPRESS"),
  ).toBe("IN_TRANSIT");
  expect(mapStatus("ENCOMENDA NA FILIAL DE DESTINO - UNIDADE TESTE")).toBe(
    "IN_TRANSIT",
  );
  expect(mapStatus("ENCOMENDA EM PROCESSO DE ENTREGA")).toBe(
    "OUT_FOR_DELIVERY",
  );
  expect(mapStatus("ENTREGA REALIZADA")).toBe("DELIVERED");
});
it("reports received history counts and preserves date-only delivery precision", async () => {
  vi.stubEnv("BRASPRESS_USERNAME", "fixture");
  vi.stubEnv("BRASPRESS_PASSWORD", "fixture");
  const response = {
    conhecimentos: [
      {
        ...braspressFixture.conhecimentos[0],
        timeline: [],
        ocorrencias: [],
        dataEntrega: "25/10/2026",
      },
    ],
  };
  const result = await new BraspressAdapter(
    vi.fn().mockResolvedValue(json(response)),
  ).trackShipment(input);
  expect(result.diagnostics).toEqual({
    timelineReceived: 0,
    occurrencesReceived: 0,
    undatedReceived: 0,
    eventsNormalized: 1,
  });
  expect(result.events[0]).toMatchObject({
    status: "DELIVERED",
    dateOnly: true,
  });
});
