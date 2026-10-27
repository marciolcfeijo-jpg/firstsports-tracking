import { z } from "zod";
export const statusSchema = z.enum([
  "INVOICED",
  "AWAITING_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "EXCEPTION",
  "RETURNING",
  "RETURNED",
  "CANCELLED",
  "UNKNOWN",
]);
export type ShipmentStatus = z.infer<typeof statusSchema>;
export const eventSchema = z.object({
  externalCode: z.string().optional(),
  occurredAt: z.iso.datetime({ offset: true }),
  dateOnly: z.boolean().optional(),
  description: z.string().min(1).max(1000),
  location: z.string().max(160).optional(),
  status: statusSchema,
});
export const resultSchema = z
  .object({
    carrier: z.string(),
    trackingNumber: z.string().optional(),
    currentStatus: statusSchema,
    estimatedDelivery: z.iso.datetime({ offset: true }).optional(),
    deliveredAt: z.iso.datetime({ offset: true }).optional(),
    proofOfDeliveryUrl: z.url().optional(),
    events: z.array(eventSchema).max(2000),
    diagnostics: z
      .object({
        timelineReceived: z.number().int().nonnegative(),
        occurrencesReceived: z.number().int().nonnegative(),
        undatedReceived: z.number().int().nonnegative(),
        eventsNormalized: z.number().int().nonnegative(),
        historySource: z
          .enum(["conhecimento", "raiz", "ambos", "ausente"])
          .optional(),
        structure: z
          .object({
            rootFields: z.array(z.string()).max(40),
            knowledgeFields: z.array(z.string()).max(40),
            arrayFields: z.array(z.string().max(512)).max(20),
          })
          .optional(),
      })
      .optional(),
  })
  .refine(
    (r) => r.currentStatus !== "DELIVERED" || !!r.deliveredAt,
    "Entrega sem data de confirmação",
  );
export type TrackingEvent = z.infer<typeof eventSchema>;
export type TrackingResult = z.infer<typeof resultSchema>;
export interface TrackingInput {
  trackingCode?: string;
  invoiceNumber: string;
  invoiceSeries: string;
  senderDocument: string;
  payerDocument?: string;
}
export interface CarrierTrackingAdapter {
  trackShipment(input: TrackingInput): Promise<TrackingResult>;
  validateConfiguration(): { valid: boolean; reason?: string };
  normalizeEvents(payload: unknown): TrackingEvent[];
  healthCheck(): Promise<{ ok: boolean; reason?: string }>;
}
export class CarrierError extends Error {
  constructor(
    public code: string,
    public retryable: boolean,
  ) {
    super(code);
  }
}
