import { z } from "zod";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  type CarrierTrackingAdapter,
  type TrackingInput,
  type TrackingEvent,
  type TrackingResult,
  CarrierError,
  alfaDiagnosticFieldNames,
  type CarrierResponseDiagnostics,
} from "../types";
import { carrierRequest } from "../http";
import {
  carrierDate,
  dateIsOnly,
  mapStatus,
  ordered,
  proofUrl,
} from "../normalize";
const scalar = z.union([z.string(), z.number()]).transform(String);
const statusCode = z
  .union([z.number(), z.string().regex(/^\d+$/)])
  .transform(Number)
  .pipe(z.number().int());
const shipmentSchema = z.object({
  numeroNota: scalar,
  numeroCte: scalar,
  dataPrivista: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  dataPrevista: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
});
const departure = z.object({
  cidadeOrigem: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  cidadeDestino: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  horaSaida: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  horaChegada: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
});
const responseSchema = z.object({
  status: statusCode,
  dadosCte: shipmentSchema.nullish().transform((value) => value ?? undefined),
  dadosEmbarque: z
    .union([departure, z.array(departure)])
    .nullish()
    .transform((value) => value ?? undefined),
  dadosEntrega: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z
      .object({
        dataEntrega: z
          .string()
          .nullish()
          .transform((value) => value ?? undefined),
        urlComprovante: z
          .string()
          .nullish()
          .transform((value) => value ?? undefined),
      })
      .nullish()
      .transform((value) => value ?? undefined),
  ),
  ocorrenciasExtras: z
    .array(
      z.object({
        codigoOcorrencia: scalar,
        dataOcorrencia: z.string(),
        descricaoOcorrencia: z.string(),
      }),
    )
    .nullish()
    .transform((value) => value ?? undefined),
});
const xmlSchema = z.object({
  wsRastreamento: z.object({
    rst: z.object({
      rstStatus: z.object({ "@_stsCd": scalar }),
      NF: z
        .object({
          "@_nro": scalar,
          NFCtrc: scalar,
          NFDataPrevista: z
            .string()
            .nullish()
            .transform((value) => value ?? undefined),
        })
        .nullish()
        .transform((value) => value ?? undefined),
      embarque: z
        .object({
          embNF: z
            .unknown()
            .nullish()
            .transform((value) => value ?? undefined),
        })
        .nullish()
        .transform((value) => value ?? undefined),
      entrega: z
        .object({
          entS: z
            .unknown()
            .nullish()
            .transform((value) => value ?? undefined),
          entNF: z
            .unknown()
            .nullish()
            .transform((value) => value ?? undefined),
        })
        .nullish()
        .transform((value) => value ?? undefined),
    }),
  }),
});
const xmlEmb = z.object({
  embOrigem: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  embDestino: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  embSaida: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  embChegada: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
});
const xmlDelivery = z.object({
  entData: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  entHora: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  entComprovante: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
});
const xmlOut = z.object({
  entSaida: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
});
/** Official v1.2 POST. The table specifies tomCnpj; its interactive example uses cnpjTomador.
 * We use the table. Confirm this discrepancy with Alfa during credentialed homologation. */
export class AlfaAdapter implements CarrierTrackingAdapter {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  validateConfiguration() {
    return process.env.ALFA_API_KEY
      ? { valid: true }
      : { valid: false, reason: "CREDENTIALS_MISSING" };
  }
  private parse(raw: unknown) {
    if (typeof raw === "string") {
      if (
        /<!DOCTYPE|<!ENTITY/i.test(raw) ||
        XMLValidator.validate(raw) !== true
      )
        throw new CarrierError("INVALID_XML", false);
      const xml = xmlSchema.safeParse(
        new XMLParser({
          ignoreAttributes: false,
          parseTagValue: false,
          processEntities: false,
        }).parse(raw),
      );
      if (!xml.success)
        throw new CarrierError(
          "INVALID_ALFA_XML",
          false,
          responseDiagnostics(xml.error, raw, "xml"),
        );
      const r = xml.data.wsRastreamento.rst;
      const embs = r.embarque?.embNF;
      const deliveries = r.entrega?.entNF;
      const outs = r.entrega?.entS;
      const movements = (embs ? (Array.isArray(embs) ? embs : [embs]) : []).map(
        (v) => {
          const e = xmlEmb.parse(v);
          return {
            cidadeOrigem: e.embOrigem,
            cidadeDestino: e.embDestino,
            horaSaida: e.embSaida,
            horaChegada: e.embChegada,
          };
        },
      );
      const delivery = deliveries
        ? xmlDelivery.parse(
            Array.isArray(deliveries) ? deliveries.at(-1) : deliveries,
          )
        : undefined;
      const outgoing = outs
        ? xmlOut.parse(Array.isArray(outs) ? outs.at(-1) : outs)
        : undefined;
      return {
        ...responseSchema.parse({
          status: r.rstStatus["@_stsCd"],
          dadosCte: r.NF
            ? {
                numeroNota: r.NF["@_nro"],
                numeroCte: r.NF.NFCtrc,
                dataPrivista: r.NF.NFDataPrevista,
              }
            : undefined,
          dadosEmbarque: movements,
          dadosEntrega: delivery
            ? {
                dataEntrega: delivery.entData
                  ? delivery.entData + " " + (delivery.entHora || "")
                  : undefined,
                urlComprovante: delivery.entComprovante,
              }
            : undefined,
        }),
        outgoing: outgoing?.entSaida,
      };
    }
    // Business failures may return null/partial data sections. Interpret their
    // documented status before requiring a successful shipment payload.
    const header = z.object({ status: statusCode }).safeParse(raw);
    if (header.success && header.data.status !== 2)
      return {
        ...responseSchema.parse(header.data),
        outgoing: undefined as string | undefined,
      };
    const parsed = responseSchema.safeParse(raw);
    if (!parsed.success)
      throw new CarrierError(
        "INVALID_ALFA_RESPONSE",
        false,
        responseDiagnostics(parsed.error, raw, "json"),
      );
    return { ...parsed.data, outgoing: undefined as string | undefined };
  }
  private checked(raw: unknown) {
    const data = this.parse(raw);
    if (data.status !== 2) {
      const codes: Record<number, string> = {
        1: "TRACKING_INCOMPLETE",
        3: "UPSTREAM_DATABASE_ERROR",
        4: "SENDER_MISSING",
        5: "AUTH_FAILED",
        6: "AUTH_FAILED",
        7: "INVOICE_UNAVAILABLE",
        8: "INVOICE_MISSING",
        9: "NOT_FOUND",
      };
      throw new CarrierError(
        codes[data.status] || "UNKNOWN_CARRIER_ERROR",
        [1, 3, 7, 9].includes(data.status),
      );
    }
    if (!data.dadosCte) throw new CarrierError("MISSING_TRACKING_DATA", false);
    return data;
  }
  normalizeEvents(raw: unknown): TrackingEvent[] {
    const data = this.checked(raw);
    const events: TrackingEvent[] = [];
    const emb = data.dadosEmbarque
      ? Array.isArray(data.dadosEmbarque)
        ? data.dadosEmbarque
        : [data.dadosEmbarque]
      : [];
    for (const e of emb) {
      const departure = carrierDate(e.horaSaida);
      if (departure)
        events.push({
          occurredAt: departure,
          dateOnly: dateIsOnly(e.horaSaida!),
          description: `Saída da unidade${e.cidadeOrigem ? " de " + e.cidadeOrigem : ""}${e.cidadeDestino ? " para " + e.cidadeDestino : ""}`,
          location: e.cidadeOrigem,
          status: "IN_TRANSIT",
        });
      const arrival = carrierDate(e.horaChegada);
      if (arrival)
        events.push({
          occurredAt: arrival,
          dateOnly: dateIsOnly(e.horaChegada!),
          description: "Chegada à unidade de transporte",
          location: e.cidadeDestino,
          status: "IN_TRANSIT",
        });
    }
    const outgoing = carrierDate(data.outgoing);
    if (outgoing)
      events.push({
        occurredAt: outgoing,
        dateOnly: dateIsOnly(data.outgoing!),
        description: "Saiu para entrega",
        status: "OUT_FOR_DELIVERY",
      });
    for (const e of data.ocorrenciasExtras || []) {
      const occurredAt = carrierDate(e.dataOcorrencia);
      if (!occurredAt) throw new CarrierError("EVENT_DATE_MISSING", false);
      events.push({
        externalCode: e.codigoOcorrencia,
        occurredAt,
        dateOnly: dateIsOnly(e.dataOcorrencia),
        description: e.descricaoOcorrencia,
        status: mapStatus(e.descricaoOcorrencia),
      });
    }
    const delivered = carrierDate(data.dadosEntrega?.dataEntrega);
    if (delivered)
      events.push({
        occurredAt: delivered,
        dateOnly: dateIsOnly(data.dadosEntrega!.dataEntrega!),
        description: "Entrega confirmada pela transportadora",
        status: "DELIVERED",
      });
    return ordered(events);
  }
  async trackShipment(input: TrackingInput): Promise<TrackingResult> {
    if (!this.validateConfiguration().valid)
      throw new CarrierError("CREDENTIALS_MISSING", false);
    if (!/^\d{1,8}$/.test(input.invoiceNumber))
      throw new CarrierError("INVALID_INVOICE_NUMBER", false);
    const body = {
      idr: process.env.ALFA_API_KEY,
      merNF: Number(input.invoiceNumber),
      ...(input.payerDocument ? { tomCnpj: input.payerDocument } : {}),
      modoJson: 1,
    };
    const raw = await carrierRequest(
      "https://api.alfatransportes.com.br/rastreamento/v1.2/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, application/xml",
        },
        body: JSON.stringify(body),
      },
      this.fetcher,
      true,
    );
    const data = this.checked(raw);
    if (Number(data.dadosCte!.numeroNota) !== Number(input.invoiceNumber))
      throw new CarrierError("INVOICE_MISMATCH", false);
    const events = this.normalizeEvents(raw);
    const deliveredAt = carrierDate(data.dadosEntrega?.dataEntrega);
    const latest =
      events.findLast((event) => event.status !== "UNKNOWN")?.status ||
      "UNKNOWN";
    return {
      carrier: "ALFA",
      trackingNumber: data.dadosCte!.numeroCte,
      currentStatus: deliveredAt
        ? "DELIVERED"
        : latest === "DELIVERED"
          ? "UNKNOWN"
          : latest,
      estimatedDelivery: carrierDate(
        data.dadosCte!.dataPrivista || data.dadosCte!.dataPrevista,
        true,
      ),
      deliveredAt,
      proofOfDeliveryUrl: proofUrl(data.dadosEntrega?.urlComprovante, [
        "areadocliente.alfatransportes.com.br",
      ]),
      events,
    };
  }
  async healthCheck() {
    const c = this.validateConfiguration();
    return {
      ok: c.valid,
      reason: c.valid ? "CONFIGURED_NOT_LIVE_TESTED" : c.reason,
    };
  }
}

// Fixed schema field names/types only: no raw values, remote messages or unknown keys.
function responseDiagnostics(
  error: z.ZodError,
  raw: unknown,
  format: "json" | "xml",
): CarrierResponseDiagnostics {
  const known = new Set(alfaDiagnosticFieldNames);
  return {
    carrier: "ALFA",
    format,
    issues: error.issues.slice(0, 12).map((issue) => {
      let value: unknown = raw;
      for (const part of issue.path) {
        if (!value || typeof value !== "object") {
          value = undefined;
          break;
        }
        value = (value as Record<PropertyKey, unknown>)[part];
      }
      return {
        field:
          issue.path
            .map((part) =>
              typeof part === "number"
                ? "[]"
                : known.has(String(part))
                  ? String(part)
                  : "?",
            )
            .join(".") || "response",
        code: issue.code,
        ...(typeof value === "string"
          ? {
              stringKind:
                value.trim() === ""
                  ? ("empty" as const)
                  : ("nonempty" as const),
            }
          : {}),
        receivedType:
          value === null
            ? "null"
            : Array.isArray(value)
              ? "array"
              : typeof value,
      };
    }),
  };
}
