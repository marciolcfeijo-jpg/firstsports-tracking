import { expect, it } from "vitest";
import { runtimeDatabaseUrl } from "../src/lib/database-url";
// @ts-expect-error JavaScript build helper has no declaration file.
import { migrationConnection } from "../scripts/migration-connection.mjs";
const session =
  "postgresql://synthetic:synthetic@aws-0.example.pooler.supabase.com:5432/postgres?sslmode=require";
const transaction =
  "postgresql://synthetic:synthetic@aws-0.example.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require";
it("limits default runtime pools and preserves credentials, TLS and transaction settings", () => {
  const source = new URL(transaction),
    result = new URL(runtimeDatabaseUrl(transaction)!);
  expect(result.searchParams.get("connection_limit")).toBe("1");
  expect(result.searchParams.get("pool_timeout")).toBe("20");
  expect(result.searchParams.get("pgbouncer")).toBe("true");
  expect(result.searchParams.get("sslmode")).toBe("require");
  expect(result.host).toBe(source.host);
  expect(result.username).toBe(source.username);
  expect(result.password).toBe(source.password);
});
it("preserves explicitly configured limits", () => {
  const result = new URL(
    runtimeDatabaseUrl(session + "&connection_limit=2&pool_timeout=30")!,
  );
  expect(result.searchParams.get("connection_limit")).toBe("2");
  expect(result.searchParams.get("pool_timeout")).toBe("30");
});
it("does not include secret URL values in validation errors", () => {
  expect(() => runtimeDatabaseUrl("PRIVATE_SECRET")).toThrow(
    "DATABASE_URL inválida",
  );
  expect(() => migrationConnection("PRIVATE_SECRET", "PRIVATE_SECRET")).toThrow(
    "Configure DATABASE_URL",
  );
  expect(runtimeDatabaseUrl(undefined)).toBeUndefined();
});
it("separates runtime transaction pooling from migrations without changing either endpoint", () => {
  expect(migrationConnection(transaction, session)).toBe(session);
  expect(migrationConnection(session, undefined)).toBe(session);
});
it("refuses migrations through a transaction pooler", () => {
  expect(() => migrationConnection(transaction, undefined)).toThrow(
    "MIGRATION_DATABASE_URL",
  );
  expect(() => migrationConnection(session, transaction)).toThrow(
    "MIGRATION_DATABASE_URL",
  );
});
