-- Run with psql as migration owner: psql "$MIGRATION_DATABASE_URL" -v runtime_role=your_app_role -f scripts/grant-runtime.sql
-- Create a dedicated LOGIN role securely in the provider first. Never grant this to anon/authenticated.
\set ON_ERROR_STOP on
GRANT USAGE ON SCHEMA public TO :"runtime_role";
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO %I', table_name, :'runtime_role')
FROM unnest(ARRAY['AdminUser', 'Customer', 'Order', 'Carrier', 'Shipment', 'ShipmentInvoice', 'TrackingEvent', 'TrackingLink', 'ImportBatch', 'ImportRow', 'SyncLog', 'AuditLog', 'RateLimit', 'BulkSync']) AS table_name
\gexec
SELECT format('CREATE POLICY runtime_server_access ON %I FOR ALL TO %I USING (true) WITH CHECK (true)', table_name, :'runtime_role')
FROM unnest(ARRAY['AdminUser', 'Customer', 'Order', 'Carrier', 'Shipment', 'ShipmentInvoice', 'TrackingEvent', 'TrackingLink', 'ImportBatch', 'ImportRow', 'SyncLog', 'AuditLog', 'RateLimit', 'BulkSync']) AS table_name
\gexec
