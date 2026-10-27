CREATE TABLE "BulkSync" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DONE',
  "cutoff" TIMESTAMP(3) NOT NULL,
  "total" INTEGER NOT NULL DEFAULT 0,
  "processed" INTEGER NOT NULL DEFAULT 0,
  "succeeded" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "blockedCarriers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "errors" JSONB NOT NULL DEFAULT '{}',
  "leaseUntil" TIMESTAMP(3),
  "leaseToken" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
ALTER TABLE "BulkSync" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "BulkSync" FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE "BulkSync" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
