import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
export default async function setup() {
  const url =
    process.env.E2E_DATABASE_URL ||
    "postgresql://postgres@127.0.0.1:5432/firstsports_e2e_test?schema=public";
  if (!new URL(url).pathname.endsWith("_test"))
    throw new Error("E2E requires an isolated _test database");
  execFileSync("node_modules/.bin/prisma", ["migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    await db.bulkSync.deleteMany();
    await db.$executeRawUnsafe(
      'TRUNCATE "Customer", "Order", "Shipment", "ShipmentInvoice", "TrackingEvent", "Carrier", "TrackingLink", "SyncLog", "RateLimit", "AuditLog", "ImportBatch", "ImportRow", "AdminUser" CASCADE',
    );
    await db.adminUser.create({
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        email: "admin@example.test",
        role: "ADMIN",
      },
    });
    await db.carrier.createMany({
      data: [
        { code: "BRASPRESS", name: "Braspress" },
        { code: "ALFA", name: "Alfa Transportes" },
        { code: "CORREIOS", name: "Correios" },
      ],
    });
  } finally {
    await db.$disconnect();
  }
}
