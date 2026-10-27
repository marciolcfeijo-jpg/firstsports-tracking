-- Existing AuditLog RLS/revocations also protect correction snapshots.
ALTER TABLE "AuditLog" ADD COLUMN "snapshot" JSONB;
