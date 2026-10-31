-- Empty means the existing global pending queue; a nonempty list scopes the run.
ALTER TABLE "BulkSync" ADD COLUMN "shipmentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
