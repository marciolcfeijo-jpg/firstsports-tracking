import { z } from "zod";
import {
  CarrierError,
  type CarrierTrackingAdapter,
  type TrackingInput,
  type TrackingEvent,
  type TrackingResult,
} from "../types";
import { carrierRequest } from "../http";
import { carrierDate, dateIsOnly, mapStatus, ordered } from "../normalize";
const unit = z.object({
  tipo: z.string().optional(),
  endereco: z
    .object({ cidade: z.string().optional(), uf: z.string().optional() })
    .optional(),
});
const eventSchema = z.object({
  codigo: z.string(),
  tipo: z.string(),
  dtHrCriado: z.string(),
  descricao: z.string().min(1),
  detalhe: z.string().optional(),
  unidade: unit.optional(),
  unidadeDestino: unit.optional(),
});
const objectSchema = z.object({
  codObjeto: z.string(),
  dtPrevista: z.string().optional(),
  mensagem: z.string().optional(),
  eventos: z.array(eventSchema).default([]),
});
const payloadSchema = z.object({ objetos: z.array(objectSchema) });
const location = (value: z.infer<typeof unit> | undefined) =>
  [value?.endereco?.cidade, value?.endereco?.uf].filter(Boolean).join(" / ") ||
  value?.tipo;
// Contract: supplied Correios manual V2.4 (04/2025), token and SRO sections.
export class CorreiosAdapter implements CarrierTrackingAdapter {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  validateConfiguration() {
    if (
      !process.env.CORREIOS_USERNAME ||
      !process.env.CORREIOS_ACCESS_CODE ||
      !process.env.CORREIOS_POSTING_CARD
    )
      return { valid: false, reason: "CREDENTIALS_MISSING" };
    if (
      !["production", "homologacao"].includes(
        process.env.CORREIOS_ENVIRONMENT || "production",
      )
    )
      return { valid: false, reason: "INVALID_CORREIOS_ENVIRONMENT" };
    return { valid: true };
  }
  normalizeEvents(raw: unknown): TrackingEvent[] {
    const parsed = payloadSchema.safeParse(raw);
    if (!parsed.success)
      throw new CarrierError("INVALID_CORREIOS_RESPONSE", false);
    return ordered(
      parsed.data.objetos.flatMap((object) =>
        object.eventos.map((event) => {
          const occurredAt = carrierDate(event.dtHrCriado);
          if (!occurredAt) throw new CarrierError("EVENT_DATE_MISSING", false);
          // Only the documented delivery success event or an explicit description confirms delivery.
          const status =
            event.codigo === "BDE" && event.tipo === "01"
              ? "DELIVERED"
              : mapStatus(event.descricao);
          const destination = location(event.unidadeDestino);
          return {
            externalCode: event.codigo + ":" + event.tipo,
            occurredAt,
            dateOnly: dateIsOnly(event.dtHrCriado),
            description:
              event.descricao +
              (event.detalhe ? " — " + event.detalhe : "") +
              (destination ? " · Destino: " + destination : ""),
            location: location(event.unidade),
            status,
          };
        }),
      ),
    );
  }
  async trackShipment(input: TrackingInput): Promise<TrackingResult> {
    const config = this.validateConfiguration();
    if (!config.valid) throw new CarrierError(config.reason!, false);
    const code = input.trackingCode?.trim().toUpperCase();
    if (!code || !/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(code))
      throw new CarrierError("TRACKING_CODE_REQUIRED", false);
    const host =
      process.env.CORREIOS_ENVIRONMENT === "homologacao"
        ? "https://apihom.correios.com.br"
        : "https://api.correios.com.br";
    // Generate a fresh token server-side. No token or carrier payload is logged or persisted.
    const rawToken = await carrierRequest(
      host + "/token/v1/autentica/cartaopostagem",
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(
              process.env.CORREIOS_USERNAME +
                ":" +
                process.env.CORREIOS_ACCESS_CODE,
            ).toString("base64"),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ numero: process.env.CORREIOS_POSTING_CARD }),
      },
      this.fetcher,
    );
    const auth = z.object({ token: z.string().min(1) }).safeParse(rawToken);
    if (!auth.success) throw new CarrierError("INVALID_CORREIOS_TOKEN", false);
    const raw = await carrierRequest(
      host +
        "/srorastro/v1/objetos/" +
        encodeURIComponent(code) +
        "?resultado=T",
      {
        method: "GET",
        headers: {
          Authorization: "Bearer " + auth.data.token,
          Accept: "application/json",
        },
      },
      this.fetcher,
    );
    const parsed = payloadSchema.safeParse(raw);
    if (!parsed.success)
      throw new CarrierError("INVALID_CORREIOS_RESPONSE", false);
    const matches = parsed.data.objetos.filter(
      (object) => object.codObjeto === code,
    );
    if (matches.length !== 1)
      throw new CarrierError(
        matches.length ? "AMBIGUOUS_TRACKING" : "NOT_FOUND",
        false,
      );
    const object = matches[0];
    if (!object.eventos.length)
      throw new CarrierError("TRACKING_UNAVAILABLE", true);
    const events = this.normalizeEvents({ objetos: [object] });
    const latest = events.at(-1)!;
    return {
      carrier: "CORREIOS",
      trackingNumber: code,
      currentStatus: latest.status,
      estimatedDelivery: carrierDate(object.dtPrevista, true),
      deliveredAt:
        latest.status === "DELIVERED" ? latest.occurredAt : undefined,
      events,
    };
  }
  async healthCheck() {
    const config = this.validateConfiguration();
    return {
      ok: config.valid,
      reason: config.valid ? "CONFIGURED_NOT_LIVE_TESTED" : config.reason,
    };
  }
}
