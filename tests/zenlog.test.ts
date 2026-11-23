import { afterEach, expect, it, vi } from "vitest";
import { zenlogExpeditionEvents } from "../src/lib/zenlog";

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
    tenancyName: "fixture",
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
