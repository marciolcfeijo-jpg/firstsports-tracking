import { alfaDiagnosticFieldNames } from "../../integrations/carriers/types";
import { z } from "zod";
const allowedFields = new Set([
  ...alfaDiagnosticFieldNames,
  "response",
  "[]",
  "?",
]);
export const syncDiagnosticSchema = z.object({
  requestId: z.uuid(),
  phase: z.enum([
    "authentication",
    "request_audit",
    "sync",
    "load_shipment",
    "claim_carrier",
    "configuration",
    "carrier_request",
    "save_tracking",
    "save_failure",
    "release_carrier",
  ]),
  code: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/),
  response: z
    .union([
      z.object({
        carrier: z.literal("CORREIOS"),
        operation: z.enum(["token", "tracking"]),
        environment: z.enum(["production", "homologacao"]),
        httpStatus: z.number().int().min(400).max(599),
      }),
      z.object({
        carrier: z.literal("ALFA"),
        format: z.enum(["json", "xml"]),
        issues: z
          .array(
            z.object({
              field: z
                .string()
                .max(160)
                .refine((value) =>
                  value.split(".").every((part) => allowedFields.has(part)),
                ),
              code: z.enum([
                "invalid_type",
                "invalid_union",
                "too_big",
                "too_small",
                "invalid_format",
                "invalid_value",
                "custom",
                "unrecognized_keys",
                "invalid_key",
                "invalid_element",
                "not_multiple_of",
              ]),
              stringKind: z.enum(["empty", "nonempty"]).optional(),
              receivedType: z.enum([
                "null",
                "array",
                "undefined",
                "string",
                "number",
                "boolean",
                "object",
                "bigint",
                "symbol",
                "function",
              ]),
            }),
          )
          .max(12),
      }),
    ])
    .optional(),
});
export type SyncDiagnostic = z.infer<typeof syncDiagnosticSchema>;
