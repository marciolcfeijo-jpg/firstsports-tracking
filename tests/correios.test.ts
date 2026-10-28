import { afterEach, expect, it, vi } from "vitest";
import { CorreiosAdapter } from "../integrations/carriers/correios";
const code = "AA123456789BR";
const input = {
  trackingCode: code,
  invoiceNumber: "123",
  invoiceSeries: "1",
  senderDocument: "11222333000181",
};
// Synthetic response using the field names in the supplied official manual.
const payload = {
  objetos: [
    {
      codObjeto: code,
      dtPrevista: "2026-10-28T18:00:00",
      eventos: [
        {
          codigo: "BDE",
          tipo: "01",
          dtHrCriado: "2026-10-27T10:00:00",
          descricao: "Objeto entregue ao destinatário",
          unidade: { endereco: { cidade: "Cidade teste", uf: "SP" } },
        },
        {
          codigo: "OEC",
          tipo: "03",
          dtHrCriado: "2026-10-27T08:00:00",
          descricao: "Objeto em rota de entrega",
        },
        {
          codigo: "RO",
          tipo: "01",
          dtHrCriado: "2026-10-26T12:00:00",
          descricao: "Objeto em trânsito",
          unidadeDestino: { endereco: { cidade: "Destino teste", uf: "SP" } },
        },
        {
          codigo: "PO",
          tipo: "01",
          dtHrCriado: "2026-10-25T12:00:00",
          descricao: "Objeto postado",
        },
      ],
    },
  ],
};
const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
function configure() {
  vi.stubEnv("CORREIOS_USERNAME", "synthetic-user");
  vi.stubEnv("CORREIOS_ACCESS_CODE", "synthetic-access-code");
  vi.stubEnv("CORREIOS_POSTING_CARD", "synthetic-card");
  vi.stubEnv("CORREIOS_ENVIRONMENT", "production");
}
afterEach(() => vi.unstubAllEnvs());
it("authenticates server-side and requests every event for the registered object", async () => {
  configure();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ token: "synthetic-token" }))
    .mockResolvedValueOnce(json(payload));
  const result = await new CorreiosAdapter(fetcher).trackShipment(input);
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://api.correios.com.br/token/v1/autentica/cartaopostagem",
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    numero: "synthetic-card",
  });
  expect(fetcher.mock.calls[1][0]).toBe(
    `https://api.correios.com.br/srorastro/v1/objetos/${code}?resultado=T`,
  );
  expect(fetcher.mock.calls[1][1].headers.Authorization).toBe(
    "Bearer synthetic-token",
  );
  expect(result.events).toHaveLength(4);
  expect(result.events.map((e) => e.status)).toEqual([
    "PICKED_UP",
    "IN_TRANSIT",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
  ]);
  expect(result.events[1].description).toContain("Destino teste / SP");
  expect(result.deliveredAt).toBe("2026-10-27T13:00:00.000Z");
  expect(result.events.at(-1)?.location).toBe("Cidade teste / SP");
  expect(JSON.stringify(result)).not.toContain("synthetic-token");
});
it("does not call the provider without credentials or a valid object code", async () => {
  vi.stubEnv("CORREIOS_USERNAME", "");
  const fetcher = vi.fn();
  await expect(
    new CorreiosAdapter(fetcher).trackShipment(input),
  ).rejects.toThrow("CREDENTIALS_MISSING");
  configure();
  await expect(
    new CorreiosAdapter(fetcher).trackShipment({
      ...input,
      trackingCode: undefined,
    }),
  ).rejects.toThrow("TRACKING_CODE_REQUIRED");
  await expect(
    new CorreiosAdapter(fetcher).trackShipment({
      ...input,
      trackingCode: "https://evil.test",
    }),
  ).rejects.toThrow("TRACKING_CODE_REQUIRED");
  expect(fetcher).not.toHaveBeenCalled();
});
it("uses the fixed homologation host when explicitly selected", async () => {
  configure();
  vi.stubEnv("CORREIOS_ENVIRONMENT", "homologacao");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ token: "fixture" }))
    .mockResolvedValueOnce(json(payload));
  await new CorreiosAdapter(fetcher).trackShipment(input);
  expect(fetcher.mock.calls[0][0]).toContain("https://apihom.correios.com.br/");
  vi.stubEnv("CORREIOS_ENVIRONMENT", "https://evil.test");
  expect(new CorreiosAdapter(fetcher).validateConfiguration().valid).toBe(
    false,
  );
});
it("rejects unexpected objects and does not invent events for missing history", async () => {
  configure();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ token: "fixture" }))
    .mockResolvedValueOnce(
      json({ objetos: [{ codObjeto: "ZZ987654321BR", eventos: [] }] }),
    );
  await expect(
    new CorreiosAdapter(fetcher).trackShipment(input),
  ).rejects.toThrow("NOT_FOUND");
  const empty = vi
    .fn()
    .mockResolvedValueOnce(json({ token: "fixture" }))
    .mockResolvedValueOnce(
      json({ objetos: [{ codObjeto: code, eventos: [] }] }),
    );
  await expect(new CorreiosAdapter(empty).trackShipment(input)).rejects.toThrow(
    "TRACKING_UNAVAILABLE",
  );
});
it("does not confuse failed delivery attempts with confirmed delivery", () => {
  const raw = {
    objetos: [
      {
        codObjeto: code,
        eventos: [
          {
            codigo: "BDE",
            tipo: "02",
            dtHrCriado: "2026-10-27T10:00:00",
            descricao: "Objeto não entregue - destinatário ausente",
          },
        ],
      },
    ],
  };
  expect(new CorreiosAdapter().normalizeEvents(raw)[0].status).toBe(
    "EXCEPTION",
  );
});

it.each([
  ["token", 400],
  ["token", 401],
  ["tracking", 403],
  ["tracking", 503],
] as const)(
  "reports only safe HTTP context for %s failures (%i)",
  async (operation, status) => {
    configure();
    const fetcher = vi.fn<typeof fetch>();
    if (operation === "tracking")
      fetcher.mockResolvedValueOnce(json({ token: "PRIVATE_TOKEN" }));
    fetcher.mockResolvedValueOnce(
      new Response("PRIVATE_REMOTE_ERROR", { status }),
    );
    try {
      await new CorreiosAdapter(fetcher).trackShipment(input);
      expect.fail("Expected carrier error");
    } catch (error) {
      expect(error).toMatchObject({
        code:
          status === 401 || status === 403
            ? "AUTH_FAILED"
            : "UPSTREAM_HTTP_ERROR",
        responseDiagnostics: {
          carrier: "CORREIOS",
          operation,
          environment: "production",
          httpStatus: status,
        },
      });
      expect(JSON.stringify(error)).not.toContain("PRIVATE");
      if (operation === "token") expect(fetcher).toHaveBeenCalledTimes(1);
    }
  },
);
