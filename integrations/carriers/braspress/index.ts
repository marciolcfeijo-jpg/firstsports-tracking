import { z } from "zod";
import {
  type CarrierTrackingAdapter,
  type TrackingInput,
  type TrackingEvent,
  type TrackingResult,
  CarrierError,
} from "../types";
import { carrierRequest } from "../http";
import { carrierDate, dateIsOnly, mapStatus, ordered } from "../normalize";
const scalar = z.union([z.string(), z.number()]).transform(String);
const movement = z.object({
  descricao: z.string().min(1),
  data: z.string().nullish(),
});
const knowledge = z.object({
  numero: scalar,
  previsaoEntrega: z.string().nullish(),
  dataEntrega: z.string().nullish(),
  status: scalar.optional(),
  notasFiscais: z.array(z.object({ numero: scalar, serie: scalar })).min(1),
  timeline: z.array(movement).default([]),
  ocorrencias: z.array(movement).default([]),
});
const responseSchema = z.object({ conhecimentos: z.array(knowledge) });
/** Official GET /v3/tracking/byNf/{payerCnpj}/{nf}/json. Documentation checked 2026-10-24. */
export class BraspressAdapter implements CarrierTrackingAdapter {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  validateConfiguration() {
    return process.env.BRASPRESS_USERNAME && process.env.BRASPRESS_PASSWORD
      ? { valid: true }
      : { valid: false, reason: "CREDENTIALS_MISSING" };
  }
  private parse(payload: unknown) {
    const businessError = z
      .object({ statusCode: z.coerce.number() })
      .safeParse(payload);
    if (businessError.success) {
      const code = businessError.data.statusCode;
      throw new CarrierError(
        code === 401 || code === 403
          ? "AUTH_FAILED"
          : code === 404
            ? "NOT_FOUND"
            : code === 429
              ? "RATE_LIMITED"
              : "CARRIER_BUSINESS_ERROR",
        code === 404 || code === 429 || code >= 500,
      );
    }
    const result = responseSchema.safeParse(payload);
    if (!result.success)
      throw new CarrierError("INVALID_BRASPRESS_RESPONSE", false);
    return result.data;
  }
  normalizeEvents(payload: unknown): TrackingEvent[] {
    const data = this.parse(payload);
    return ordered(
      data.conhecimentos.flatMap((c) => [
        ...c.timeline.flatMap((e) => {
          const occurredAt = carrierDate(e.data || undefined);
          if (!occurredAt) return [];
          return [
            {
              occurredAt,
              dateOnly: dateIsOnly(e.data!),
              description: e.descricao,
              status: mapStatus(e.descricao),
            },
          ];
        }),
        ...c.ocorrencias.flatMap((e) => {
          const occurredAt = carrierDate(e.data || undefined);
          if (!occurredAt) return [];
          return [
            {
              occurredAt,
              dateOnly: dateIsOnly(e.data!),
              description: e.descricao,
              status: "EXCEPTION" as const,
            },
          ];
        }),
      ]),
    );
  }
  async trackShipment(input: TrackingInput): Promise<TrackingResult> {
    const conf = this.validateConfiguration();
    if (!conf.valid) throw new CarrierError(conf.reason!, false);
    if (!input.payerDocument)
      throw new CarrierError("PAYER_CNPJ_REQUIRED", false);
    const url = `https://api.braspress.com/v3/tracking/byNf/${encodeURIComponent(input.payerDocument)}/${encodeURIComponent(input.invoiceNumber)}/json`;
    const auth = Buffer.from(
      process.env.BRASPRESS_USERNAME + ":" + process.env.BRASPRESS_PASSWORD,
    ).toString("base64");
    const raw = await carrierRequest(
      url,
      {
        method: "GET",
        headers: { Authorization: "Basic " + auth, Accept: "application/json" },
      },
      this.fetcher,
    );
    const data = this.parse(raw);
    const matching = data.conhecimentos.filter((c) =>
      c.notasFiscais.some(
        (i) =>
          Number(i.numero) === Number(input.invoiceNumber) &&
          Number(i.serie) === Number(input.invoiceSeries),
      ),
    );
    if (!matching.length) throw new CarrierError("NOT_FOUND", true);
    if (matching.length > 1)
      throw new CarrierError("AMBIGUOUS_TRACKING", false);
    const c = matching[0];
    const events = this.normalizeEvents({ conhecimentos: [c] });
    const deliveredAt = carrierDate(c.dataEntrega || undefined);
    // The summary can confirm delivery even when the provider omits it from the timeline.
    if (
      deliveredAt &&
      !events.some(
        (e) => e.status === "DELIVERED" && e.occurredAt === deliveredAt,
      )
    ) {
      events.push({
        occurredAt: deliveredAt,
        dateOnly: dateIsOnly(c.dataEntrega!),
        description: "Entrega confirmada pela transportadora",
        status: "DELIVERED",
      });
      ordered(events);
    }
    let currentStatus = deliveredAt
      ? ("DELIVERED" as const)
      : mapStatus(c.status || "");
    if (!deliveredAt && currentStatus === "DELIVERED")
      currentStatus = "UNKNOWN";
    if (currentStatus === "UNKNOWN" && events.length)
      currentStatus = events.at(-1)!.status;
    if (currentStatus === "DELIVERED" && !deliveredAt)
      currentStatus = "UNKNOWN";
    return {
      carrier: "BRASPRESS",
      trackingNumber: c.numero,
      currentStatus,
      estimatedDelivery: carrierDate(c.previsaoEntrega || undefined, true),
      deliveredAt,
      events,
      diagnostics: {
        timelineReceived: c.timeline.length,
        occurrencesReceived: c.ocorrencias.length,
        undatedReceived: [...c.timeline, ...c.ocorrencias].filter(
          (e) => !e.data?.trim(),
        ).length,
        eventsNormalized: events.length,
      },
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
