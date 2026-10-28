import { z } from "zod";
import { carrierRequest } from "../http";
import { carrierDate, mapStatus, ordered } from "../normalize";
import {
  CarrierError,
  type CarrierTrackingAdapter,
  type TrackingEvent,
  type TrackingInput,
  type TrackingResult,
} from "../types";

// Fixed destination: never send the customer token to a caller-supplied host.
const endpoint =
  "https://icaro.eslcloud.com.br/api/customer/invoice_occurrences";
const identifier = z
  .union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])
  .transform(String);
const rowSchema = z.object({
  id: identifier,
  occurrence_at: z.iso.datetime({ offset: true }),
  invoice: z.object({
    key: z.string().nullable(),
    series: z.union([z.string(), z.number()]).nullable(),
    number: identifier,
  }),
  freight: z.object({
    id: identifier,
    cte_number: z.union([z.string(), z.number()]).nullable(),
    delivery_prediction_at: z.iso.datetime({ offset: true }).nullable(),
  }),
  occurrence: z.object({
    code: identifier,
    trigger: z.string().nullable(),
    description: z.string().trim().min(1).max(1000),
  }),
});
const pageSchema = z.object({
  data: z.array(rowSchema).max(2000),
  paging: z.object({ next_id: identifier.nullable() }),
});
type Row = z.infer<typeof rowSchema>;

export class IcaroAdapter implements CarrierTrackingAdapter {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    // Production supplies a PostgreSQL-backed gate, shared across server instances.
    private readonly pacedRequest: <T>(
      request: () => Promise<T>,
    ) => Promise<T> = localGate,
  ) {}
  validateConfiguration() {
    return process.env.ICARO_API_TOKEN?.trim()
      ? { valid: true }
      : { valid: false, reason: "CREDENTIALS_MISSING" };
  }
  private parse(raw: unknown) {
    const parsed = pageSchema.safeParse(raw);
    if (!parsed.success)
      throw new CarrierError("INVALID_ICARO_RESPONSE", false);
    return parsed.data;
  }
  normalizeEvents(raw: unknown): TrackingEvent[] {
    const rows = this.parse(raw).data;
    const unique = new Map<string, TrackingEvent>();
    for (const row of rows) {
      unique.set(row.id, {
        externalCode: row.id,
        occurredAt: carrierDate(row.occurrence_at)!,
        description: row.occurrence.description,
        // Trigger/code tables have not been supplied. Do not infer delivery from "finish".
        status: icaroStatus(row.occurrence.description),
      });
    }
    return ordered([...unique.values()]);
  }
  async trackShipment(input: TrackingInput): Promise<TrackingResult> {
    if (!this.validateConfiguration().valid)
      throw new CarrierError("CREDENTIALS_MISSING", false);
    if (!input.invoiceAccessKey && !input.orderNumber)
      throw new CarrierError("ICARO_LOOKUP_MISSING", false);
    if (input.invoiceAccessKey && !/^\d{44}$/.test(input.invoiceAccessKey))
      throw new CarrierError("INVALID_INVOICE_KEY", false);
    if (!input.issuedAt || Number.isNaN(Date.parse(input.issuedAt)))
      throw new CarrierError("ICARO_ISSUE_DATE_MISSING", false);
    const url = new URL(endpoint);
    if (input.invoiceAccessKey)
      url.searchParams.set("invoice_key", input.invoiceAccessKey);
    else url.searchParams.set("order_number", input.orderNumber!);
    // since filters creation, not occurrence_at. Never accept the implicit one-month window.
    url.searchParams.set("since", input.issuedAt);
    const rows: Row[] = [];
    const cursors = new Set<string>();
    const deadline = Date.now() + 30000;
    for (let page = 0; ; page++) {
      if (page >= 10 || Date.now() >= deadline)
        throw new CarrierError("ICARO_HISTORY_LIMIT", true);
      const data = this.parse(
        await this.pacedRequest(() =>
          carrierRequest(
            url.toString(),
            {
              method: "GET",
              headers: {
                Accept: "application/json",
                Authorization: `Bearer ${process.env.ICARO_API_TOKEN}`,
              },
            },
            this.fetcher,
          ),
        ),
      );
      for (const row of data.data) {
        const key = row.invoice.key;
        if (key && !/^\d{44}$/.test(key))
          throw new CarrierError("INVALID_ICARO_RESPONSE", false);
        // The order may contain other invoices. Require a full fiscal match; declarations
        // without a key cannot safely be attached to a real NF.
        if (key) {
          if (input.invoiceAccessKey && key !== input.invoiceAccessKey)
            continue;
          if (
            key.slice(6, 20) !== input.senderDocument ||
            Number(key.slice(22, 25)) !== Number(input.invoiceSeries) ||
            Number(key.slice(25, 34)) !== Number(input.invoiceNumber)
          )
            continue;
        } else continue;
        if (
          Number(row.invoice.number) !== Number(input.invoiceNumber) ||
          (row.invoice.series !== null &&
            Number(row.invoice.series) !== Number(input.invoiceSeries))
        )
          continue;
        rows.push(row);
        if (rows.length > 2000)
          throw new CarrierError("ICARO_HISTORY_LIMIT", true);
      }
      const next = data.paging.next_id;
      if (next === null) break;
      if (cursors.has(next))
        throw new CarrierError("ICARO_PAGINATION_LOOP", false);
      cursors.add(next);
      url.searchParams.set("start", next);
    }
    if (!rows.length) throw new CarrierError("NOT_FOUND", true);
    // A fiscal invoice associated with multiple freight records is ambiguous.
    if (new Set(rows.map((row) => row.freight.id)).size !== 1)
      throw new CarrierError("AMBIGUOUS_INVOICE", false);
    const events = this.normalizeEvents({
      data: rows,
      paging: { next_id: null },
    });
    // Administrative records (e.g. digitized proof) stay in the timeline, but
    // do not erase the most recent meaningful transport status or delivery time.
    const latest =
      events.findLast((event) => event.status !== "UNKNOWN") ?? events.at(-1)!;
    const newestRow = [...rows]
      .sort((a, b) => Date.parse(a.occurrence_at) - Date.parse(b.occurrence_at))
      .at(-1)!;
    return {
      carrier: "ICARO",
      trackingNumber:
        newestRow.freight.cte_number === null
          ? undefined
          : String(newestRow.freight.cte_number),
      currentStatus: latest.status,
      deliveredAt:
        latest.status === "DELIVERED" ? latest.occurredAt : undefined,
      estimatedDelivery: carrierDate(
        newestRow.freight.delivery_prediction_at ?? undefined,
      ),
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

// Conservative fallback for standalone use/tests: serialize calls and wait after completion.
let queue: Promise<unknown> = Promise.resolve();
let nextAt = 0;
function localGate<T>(request: () => Promise<T>): Promise<T> {
  const result = queue.then(async () => {
    const delay = nextAt - Date.now();
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      return await request();
    } finally {
      nextAt = Date.now() + 2000;
    }
  });
  queue = result.catch(() => {});
  return result;
}

function icaroStatus(description: string) {
  const normalized = description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
  if (/PARCIAL/.test(normalized)) return "EXCEPTION" as const;
  const status = mapStatus(description);
  if (
    status === "DELIVERED" &&
    !/^(ENTREGA REALIZADA(?: NORMALMENTE)?|ENTREGUE|ENTREGA CONCLUIDA)$/.test(
      normalized,
    )
  )
    return "UNKNOWN" as const;
  return status;
}
