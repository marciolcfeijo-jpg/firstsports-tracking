/** Bound each warm application's Prisma pool; never rewrite host, TLS or credentials. */
export function runtimeDatabaseUrl(value: string | undefined) {
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "DATABASE_URL inválida: configure uma conexão PostgreSQL no servidor.",
    );
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("DATABASE_URL deve ser uma conexão PostgreSQL.");
  if (!url.searchParams.has("connection_limit"))
    url.searchParams.set("connection_limit", "1");
  if (!url.searchParams.has("pool_timeout"))
    url.searchParams.set("pool_timeout", "20");
  return url.toString();
}
