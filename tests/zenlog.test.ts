import { afterEach, expect, it, vi } from "vitest";
import {
  zenlogExpeditionEvents,
  zenlogExpeditions,
  zenlogPreviewExpeditions,
} from "../src/lib/zenlog";

vi.mock("../src/lib/db", () => ({ db: {} }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("autentica por PAT e consulta os eventos do pedido usando HTTPS", async () => {
  vi.stubEnv("ZENLOG_API_ORIGIN", "https://zenlog.example.test");
  vi.stubEnv("ZENLOG_TENANCY_NAME", "fixture");
  vi.stubEnv("ZENLOG_PAT", "synthetic-fixture");
  vi.stubEnv("ZENLOG_OPERATOR_DOCUMENT", "11222333000181");
  vi.stubEnv("ZENLOG_DEPOSITOR_DOCUMENT", "04252011000110");
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      Response.json({ result: { accessToken: "fixture-token" } }),
    )
    .mockResolvedValueOnce(
      Response.json({
        result: {
          eventos: [{ codigoevento: "EX-1", status: "S", texto: "Interno" }],
        },
      }),
    );
  vi.stubGlobal("fetch", fetch);

  expect(await zenlogExpeditionEvents("PED 001")).toEqual([
    { codigoevento: "EX-1", status: "S" },
  ]);
  expect(String(fetch.mock.calls[0][0])).toBe(
    "https://zenlog.example.test/api/TokenAuth/AuthenticatePAT",
  );
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
    personalAccessToken: "synthetic-fixture",
    tenantName: "fixture",
  });
  const request = new URL(String(fetch.mock.calls[1][0]));
  expect(request.pathname).toBe(
    "/api/services/app/Expedicao/GetEventosExpedicao",
  );
  expect(request.searchParams.get("numeroPedido")).toBe("PED 001");
  expect(request.searchParams.get("cpfCnpjOperadorLogistico")).toBe(
    "11.222.333/0001-81",
  );
  expect(fetch.mock.calls[1][1]?.headers).toMatchObject({
    Authorization: "Bearer fixture-token",
  });
});

it("rejeita origem HTTP antes de enviar a credencial", async () => {
  vi.stubEnv("ZENLOG_API_ORIGIN", "http://zenlog.example.test");
  vi.stubEnv("ZENLOG_TENANCY_NAME", "fixture");
  vi.stubEnv("ZENLOG_PAT", "synthetic-fixture");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(zenlogExpeditionEvents("001")).rejects.toMatchObject({
    status: 503,
  });
  expect(fetch).not.toHaveBeenCalled();
});

it("consulta a prévia paginada e restringe os resultados à instalação configurada", async () => {
  vi.stubEnv("ZENLOG_API_ORIGIN", "https://zenlog.example.test");
  vi.stubEnv("ZENLOG_TENANCY_NAME", "fixture");
  vi.stubEnv("ZENLOG_PAT", "synthetic-fixture");
  vi.stubEnv("ZENLOG_OPERATOR_DOCUMENT", "11222333000181");
  vi.stubEnv("ZENLOG_DEPOSITOR_DOCUMENT", "04252011000110");
  const expedition = {
    codigo: "EXP-1",
    operadorLogistico: { cpfCnpj: "11.222.333/0001-81" },
    depositante: { cpfCnpj: "04.252.011/0001-10" },
    documentos: [{ pedido: "001", numero: "", serie: "", notas: [] }],
  };
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      Response.json({ result: { accessToken: "fixture-token" } }),
    )
    .mockResolvedValueOnce(
      Response.json({
        result: {
          totalCount: 22,
          items: [expedition, { ...expedition, depositante: null }],
        },
      }),
    );
  vi.stubGlobal("fetch", fetch);

  expect(await zenlogExpeditions(10, "001")).toEqual({
    totalCount: 22,
    items: [expedition],
  });
  const url = new URL(String(fetch.mock.calls[1][0]));
  expect(url.pathname).toBe("/api/services/app/Expedicao/GetAll");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    SkipCount: "10",
    MaxResultCount: "10",
    Pedido: "001",
  });
});

it("carrega páginas de 100 em lotes de 10 e para no último registro", async () => {
  vi.stubEnv("ZENLOG_API_ORIGIN", "https://zenlog.example.test");
  vi.stubEnv("ZENLOG_TENANCY_NAME", "fixture");
  vi.stubEnv("ZENLOG_PAT", "synthetic-fixture");
  vi.stubEnv("ZENLOG_OPERATOR_DOCUMENT", "11222333000181");
  vi.stubEnv("ZENLOG_DEPOSITOR_DOCUMENT", "04252011000110");

  const offsets: number[] = [];
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (!url.searchParams.has("SkipCount"))
        return Response.json({ result: { accessToken: "fixture-token" } });

      const offset = Number(url.searchParams.get("SkipCount"));
      offsets.push(offset);
      expect(url.searchParams.get("MaxResultCount")).toBe("10");
      expect(url.searchParams.get("Pedido")).toBe("001");
      return Response.json({
        result: {
          totalCount: 123,
          items: Array.from(
            { length: Math.min(10, 123 - offset) },
            (_, index) => ({
              codigo: String(offset + index),
              operadorLogistico: { cpfCnpj: "11222333000181" },
              depositante: { cpfCnpj: "04252011000110" },
            }),
          ),
        },
      });
    });
  vi.stubGlobal("fetch", fetch);

  const first = await zenlogPreviewExpeditions(0, "001");
  expect(offsets).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  expect(first.items).toHaveLength(100);
  expect(first.items.at(-1)?.codigo).toBe("99");

  const second = await zenlogPreviewExpeditions(100, "001");
  expect(offsets.slice(10)).toEqual([100, 110, 120]);
  expect(second.totalCount).toBe(123);
  expect(second.items.map(({ codigo }) => codigo)).toEqual(
    Array.from({ length: 23 }, (_, index) => String(100 + index)),
  );
  expect(fetch).toHaveBeenCalledTimes(15);
});
