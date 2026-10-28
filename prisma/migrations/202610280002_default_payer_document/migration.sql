-- Fill only missing payers, preserving explicitly supplied values and tracking data.
WITH filled AS (
  UPDATE "Shipment"
  SET "payerDocument" = btrim("senderDocument"),
      "updatedAt" = CURRENT_TIMESTAMP,
      "version" = "version" + 1
  WHERE ("payerDocument" IS NULL OR btrim("payerDocument") = '')
    AND btrim("senderDocument") ~ '^[0-9]{14}$'
  RETURNING "id"
)
INSERT INTO "AuditLog" ("id", "actorId", "action", "entityId", "snapshot")
SELECT 'default-payer-20261028:' || "id", 'system:migration',
       'SHIPMENT_PAYER_DEFAULT', "id", '{"source":"senderDocument"}'::jsonb
FROM filled;
