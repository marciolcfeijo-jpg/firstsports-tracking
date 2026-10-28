/** Prisma migrations require a direct or session connection, not transaction pooling. */
export function migrationConnection(runtimeValue, migrationValue) {
  let runtime, migration;
  try {
    runtime = new URL(runtimeValue || "");
    migration = new URL(migrationValue || runtimeValue || "");
  } catch {
    throw new Error(
      "Configure DATABASE_URL e, quando necessário, MIGRATION_DATABASE_URL como conexões PostgreSQL.",
    );
  }
  if (
    !["postgres:", "postgresql:"].includes(runtime.protocol) ||
    !["postgres:", "postgresql:"].includes(migration.protocol)
  )
    throw new Error(
      "As conexões de runtime e migration devem usar PostgreSQL.",
    );
  const transactionPool = (url) =>
    url.searchParams.get("pgbouncer") === "true" ||
    (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543");
  if (transactionPool(migration))
    throw new Error(
      "Configure MIGRATION_DATABASE_URL com a conexão Direct ou Session pooler. Não execute migrations pelo Transaction pooler.",
    );
  return migration.toString();
}
