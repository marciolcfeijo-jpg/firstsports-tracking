ALTER TABLE "TrackingEvent" ADD COLUMN "dateOnly" BOOLEAN NOT NULL DEFAULT false;
UPDATE "TrackingEvent" SET "dateOnly" = true WHERE fingerprint = 'invoiced';
