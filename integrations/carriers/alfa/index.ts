import { z } from "zod";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  type CarrierTrackingAdapter,
  type TrackingInput,
  type TrackingEvent,
  type TrackingResult,
  CarrierError,
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
const shipmentSchema = z.object({
  numeroNota: scalar,
  numeroCte: scalar,
  dataPrivista: z.string().optional(),
  dataPrevista: z.string().optional(),
});
const departure = z.object({
  cidadeOrigem: z.string().optional(),
  cidadeDestino: z.string().optional(),
  horaSaida: z.string().optional(),
  horaChegada: z.string().optional(),
});
const responseSchema = z.object({
  status: z.coerce.number(),
  dadosCte: shipmentSchema.optional(),
  dadosEmbarque: z.union([departure, z.array(departure)]).optional(),
  dadosEntrega: z
    .object({
      dataEntrega: z.string().optional(),
      urlComprovante: z.string().optional(),
    })
    .optional(),
  ocorrenciasExtras: z
    .array(
      z.object({
        codigoOcorrencia: scalar,
        dataOcorrencia: z.string(),
        descricaoOcorrencia: z.string(),
      }),
    )
    .optional(),
});
const xmlSchema = z.object({
  wsRastreamento: z.object({
    rst: z.object({
      rstStatus: z.object({ "@_stsCd": scalar }),
      NF: z
        .object({
          "@_nro": scalar,
          NFCtrc: scalar,
          NFDataPrevista: z.string().optional(),
        })
        .optional(),
      embarque: z.object({ embNF: z.unknown().optional() }).optional(),
      entrega: z
        .object({ entS: z.unknown().optional(), entNF: z.unknown().optional() })
        .optional(),
    }),
  }),
});
const xmlEmb = z.object({
  embOrigem: z.string().optional(),
  embDestino: z.string().optional(),
  embSaida: z.string().optional(),
  embChegada: z.string().optional(),
});
const xmlDelivery = z.object({
  entData: z.string().optional(),
  entHora: z.string().optional(),
  entComprovante: z.string().optional(),
});
const xmlOut = z.object({ entSaida: z.string().optional() });
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
      if (!xml.success) throw new CarrierError("INVALID_ALFA_XML", false);
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
    const parsed = responseSchema.safeParse(raw);
    if (!parsed.success) throw new CarrierError("INVALID_ALFA_RESPONSE", false);
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
    const latest = events.at(-1)?.status || "UNKNOWN";
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
