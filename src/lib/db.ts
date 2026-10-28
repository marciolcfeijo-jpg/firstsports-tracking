import { PrismaClient } from "@prisma/client";
import { runtimeDatabaseUrl } from "./database-url";
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
const datasourceUrl = runtimeDatabaseUrl(process.env.DATABASE_URL);
export const db =
  globalDb.prisma ??
  new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);
// Reuse the client within each warm instance in production as well as development.
globalDb.prisma = db;
