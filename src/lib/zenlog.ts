import { z } from "zod";
import { HttpError } from "./security";
import { digits, validDocument } from "./validation";

function formatDocument(value: string | undefined) {
  const number = digits(value ?? "");
  if (!validDocument(number))
    throw new HttpError(503, "Configure os documentos do ZenLOG.");
  return number.length === 14
    ? number.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
    : number.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

const event = z.object({
  codigoevento: z.string().trim().min(1).max(120),
  status: z.enum(["A", "E", "S"]),
  inicio: z.string().max(40).nullish(),
  fim: z.string().max(40).nullish(),
  sequencia: z.number().int().optional(),
});
const events = z.array(event).max(1000);
const payload = z.union([
  events,
  z.object({ eventos: events }).transform(({ eventos }) => eventos),
]);
const authResponse = z.object({
  result: z.object({ accessToken: z.string().min(1) }),
});

async function zenlogSession() {
  const pat = process.env.ZENLOG_PAT;
  const tenant = process.env.ZENLOG_TENANCY_NAME;
  const origin = process.env.ZENLOG_API_ORIGIN;
  if (!pat || !tenant || !origin)
    throw new HttpError(503, "Configure o acesso ao ZenLOG.");
  const base = URL.parse(origin);
  if (!base || base.protocol !== "https:" || base.href !== base.origin + "/")
    throw new HttpError(
      503,
      "A origem do ZenLOG precisa ser uma URL HTTPS sem caminho.",
    );

  const auth = await zenlogFetch(
    new URL("/api/TokenAuth/AuthenticatePAT", base),
    "autenticação",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ personalAccessToken: pat, tenantName: tenant }),
    },
  );
  const token = authResponse.safeParse(auth);
  if (!token.success)
    throw new HttpError(
      502,
      "Resposta de autenticação do ZenLOG fora do formato esperado.",
    );

  return {
    base,
    headers: {
      Authorization: "Bearer " + token.data.result.accessToken,
      Accept: "application/json",
    },
  };
}

export async function zenlogExpeditionEvents(orderNumber: string) {
  const operator = formatDocument(process.env.ZENLOG_OPERATOR_DOCUMENT);
  const depositor = formatDocument(process.env.ZENLOG_DEPOSITOR_DOCUMENT);
  const { base, headers } = await zenlogSession();
  const url = new URL("/api/services/app/Expedicao/GetEventosExpedicao", base);
  url.search = new URLSearchParams({
    cpfCnpjOperadorLogistico: operator,
    cpfCnpjDepositante: depositor,
    numeroPedido: orderNumber,
  }).toString();
  const result = await zenlogFetch(url, "consulta de eventos", { headers });
  const parsed = z
    .union([
      z.object({ result: payload }).transform(({ result }) => result),
      payload,
    ])
    .safeParse(result);
  if (!parsed.success)
    throw new HttpError(
      502,
      "Resposta de eventos fora do formato esperado. Confirme o contrato com o ZenLOG.",
    );
  return parsed.data;
}

const optionalText = z.string().nullish();
const party = z
  .object({
    cpfCnpj: optionalText,
    nome: optionalText,
    id: z.number().int().nullish(),
  })
  .nullish();
const status = z.union([z.string(), z.number()]).nullish();
const zenlogEvent = z.object({
  id: z.number().int().nullish(),
  eventoId: z.number().int().nullish(),
  nome: optionalText,
  evento: z.object({ nome: optionalText }).nullish(),
  sequencia: z.number().int().nullish(),
  status,
  inicio: optionalText,
  fim: optionalText,
});
const expeditionList = z.object({
  result: z.object({
    totalCount: z.number().int().nonnegative(),
    items: z
      .array(
        z.object({
          codigo: z.string(),
          id: z.number().int().nullish(),
          situacao: status,
          situacaoIntegracao: status,
          data: optionalText,
          dataEmissao: optionalText,
          eventos: z.array(zenlogEvent).nullish(),
          operadorLogistico: party,
          depositante: party,
          documentos: z
            .array(
              z.object({
                pedido: z.string().nullish(),
                numero: z.string().nullish(),
                serie: z.string().nullish(),
                chave: z.string().nullish(),
                dataEmissao: optionalText,
                id: z.number().int().nullish(),
                destinatario: party,
                destinatarioId: z.number().int().nullish(),
                situacao: status,
                transportador: optionalText,
                codigoRastreio: optionalText,
                enderecoCustomizado: z
                  .object({
                    cidade: z
                      .object({ nome: optionalText, uf: optionalText })
                      .nullish(),
                    uf: optionalText,
                  })
                  .nullish(),
                atributos: z
                  .array(z.object({ nome: optionalText, valor: optionalText }))
                  .nullish(),
                notas: z
                  .array(
                    z.object({
                      numero: z.string().nullish(),
                      serie: z.string().nullish(),
                      chave: z.string().nullish(),
                      dataEmissao: optionalText,
                    }),
                  )
                  .nullish(),
              }),
            )
            .nullish(),
        }),
      )
      .max(10),
  }),
});

export const zenlogPageSize = 10;

export async function zenlogExpeditionReader() {
  const operator = digits(formatDocument(process.env.ZENLOG_OPERATOR_DOCUMENT));
  const depositor = digits(
    formatDocument(process.env.ZENLOG_DEPOSITOR_DOCUMENT),
  );
  const { base, headers } = await zenlogSession();
  return async (
    skip: number,
    order: string,
    invoiceNumber?: string,
    sorting?: string,
  ) => {
    const url = new URL("/api/services/app/Expedicao/GetAll", base);
    url.searchParams.set("SkipCount", String(skip));
    url.searchParams.set("MaxResultCount", String(zenlogPageSize));
    if (order) url.searchParams.set("Pedido", order);
    if (invoiceNumber) url.searchParams.set("NumeroNf", invoiceNumber);
    if (sorting) url.searchParams.set("Sorting", sorting);
    const parsed = expeditionList.safeParse(
      await zenlogFetch(url, "listagem de expedições", { headers }),
    );
    if (!parsed.success)
      throw new HttpError(
        502,
        "A listagem de expedições do ZenLOG veio fora do formato esperado.",
      );
    const { totalCount, items } = parsed.data.result;
    if (sorting && items.length < Math.min(zenlogPageSize, totalCount - skip))
      throw new HttpError(502, "O ZenLOG retornou uma página incompleta.");

    return {
      totalCount,
      items: items.filter(
        (item) =>
          digits(item.operadorLogistico?.cpfCnpj ?? "") === operator &&
          digits(item.depositante?.cpfCnpj ?? "") === depositor,
      ),
    };
  };
}

export async function zenlogExpeditions(
  skip: number,
  order: string,
  invoiceNumber?: string,
  sorting?: string,
) {
  const readPage = await zenlogExpeditionReader();
  return readPage(skip, order, invoiceNumber, sorting);
}

export const zenlogPreviewPageSize = 100;

export async function zenlogPreviewExpeditions(skip: number, order: string) {
  const readPage = await zenlogExpeditionReader();
  const first = await readPage(skip, order);
  const items = [...first.items];
  const end = Math.min(first.totalCount, skip + zenlogPreviewPageSize);
  for (
    let offset = skip + zenlogPageSize;
    offset < end;
    offset += zenlogPageSize
  ) {
    const batch = await readPage(offset, order);
    items.push(...batch.items);
  }
  return { items, totalCount: first.totalCount };
}

async function zenlogFetch(
  url: URL,
  stage: "autenticação" | "consulta de eventos" | "listagem de expedições",
  init: RequestInit,
): Promise<unknown> {
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      throw new HttpError(
        502,
        `O ZenLOG retornou HTTP ${response.status} na etapa de ${stage}.`,
      );
    return await response.json();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, `Falha na etapa de ${stage} do ZenLOG.`);
  }
}
