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
const knowledge = z
  .object({
    numero: scalar,
    previsaoEntrega: z.string().nullish(),
    dataEntrega: z.string().nullish(),
    status: scalar.optional(),
    notasFiscais: z.array(z.object({ numero: scalar, serie: scalar })).min(1),
    timeline: z.array(movement).default([]),
    timeLine: z.array(movement).default([]),
    ocorrencias: z.array(movement).default([]),
  })
  .transform(({ timeLine, ...item }) => ({
    ...item,
    timeline: [...item.timeline, ...timeLine],
  }));
const responseSchema = z
  .object({
    conhecimentos: z.array(knowledge),
    timeline: z.array(movement).optional(),
    timeLine: z.array(movement).default([]),
    ocorrencias: z.array(movement).optional(),
  })
  .transform(({ timeLine, ...data }) => ({
    ...data,
    timeline: [...(data.timeline || []), ...timeLine],
  }));
// Structural metadata only: field names and array counts, never payload values.
export function braspressStructure(payload: unknown) {
  const fields = (value: unknown): string[] =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value)
          .filter((key) => /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key))
          .slice(0, 40)
      : [];
  const root =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const items = Array.isArray(root.conhecimentos) ? root.conhecimentos : [];
  const arrays: string[] = [];
  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > 3 || arrays.length >= 20) return;
    if (Array.isArray(value)) {
      arrays.push(
        `${path}: ${value.length} registro(s); campos: ${fields(value[0]).join(", ") || "sem campos"}`.slice(
          0,
          512,
        ),
      );
      if (value.length) visit(value[0], path + "[]", depth + 1);
    } else if (value && typeof value === "object") {
      for (const key of fields(value))
        visit(
          (value as Record<string, unknown>)[key],
          path + "." + key,
          depth + 1,
        );
    }
  };
  visit(root, "resposta", 0);
  return {
    rootFields: fields(root),
    knowledgeFields: fields(items[0]),
    arrayFields: arrays,
  };
}
function historyFor(
  data: z.infer<typeof responseSchema>,
  item: z.infer<typeof knowledge>,
) {
  const hasRoot = !!data.timeline?.length || !!data.ocorrencias?.length;
  const hasNested = !!item.timeline.length || !!item.ocorrencias.length;
  if (hasRoot && data.conhecimentos.length > 1 && !hasNested)
    throw new CarrierError("AMBIGUOUS_TRACKING_HISTORY", false);
  // A root history is only attributable when there is exactly one knowledge.
  const rootTimeline =
    data.conhecimentos.length === 1 ? data.timeline || [] : [];
  const rootOccurrences =
    data.conhecimentos.length === 1 ? data.ocorrencias || [] : [];
  return {
    ...item,
    timeline: [...item.timeline, ...rootTimeline],
    ocorrencias: [...item.ocorrencias, ...rootOccurrences],
  };
}
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
    const events: TrackingEvent[] = data.conhecimentos.flatMap((item) => {
      const history = historyFor(data, item);
      return [
        ...history.timeline.flatMap((e) => {
          const occurredAt = carrierDate(e.data || undefined);
          return occurredAt
            ? [
                {
                  occurredAt,
                  dateOnly: dateIsOnly(e.data!),
                  description: e.descricao,
                  status: mapStatus(e.descricao),
                },
              ]
            : [];
        }),
        ...history.ocorrencias.flatMap((e) => {
          const occurredAt = carrierDate(e.data || undefined);
          const mapped = mapStatus(e.descricao);
          return occurredAt
            ? [
                {
                  occurredAt,
                  dateOnly: dateIsOnly(e.data!),
                  description: e.descricao,
                  status:
                    mapped === "UNKNOWN" ? ("EXCEPTION" as const) : mapped,
                },
              ]
            : [];
        }),
      ];
    });
    const unique = new Map(
      events.map((event) => [
        JSON.stringify([event.occurredAt, event.description, event.status]),
        event,
      ]),
    );
    return ordered([...unique.values()]);
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
    const history = historyFor(data, c);
    const events = this.normalizeEvents({ conhecimentos: [history] });
    const summaryDelivery = carrierDate(c.dataEntrega || undefined);
    const deliveryEvent = events
      .filter((event) => event.status === "DELIVERED")
      .at(-1);
    const calendarDate = (value: string) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(value));
    const deliveredAt =
      summaryDelivery &&
      !(
        dateIsOnly(c.dataEntrega!) &&
        deliveryEvent &&
        calendarDate(deliveryEvent.occurredAt) === calendarDate(summaryDelivery)
      )
        ? summaryDelivery
        : deliveryEvent?.occurredAt || summaryDelivery;
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
        timelineReceived: history.timeline.length,
        occurrencesReceived: history.ocorrencias.length,
        undatedReceived: [...history.timeline, ...history.ocorrencias].filter(
          (e) => !e.data?.trim(),
        ).length,
        eventsNormalized: events.length,
        historySource:
          c.timeline.length || c.ocorrencias.length
            ? data.conhecimentos.length === 1 &&
              (data.timeline?.length || data.ocorrencias?.length)
              ? "ambos"
              : "conhecimento"
            : history.timeline.length || history.ocorrencias.length
              ? "raiz"
              : "ausente",
        structure: braspressStructure(raw),
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
