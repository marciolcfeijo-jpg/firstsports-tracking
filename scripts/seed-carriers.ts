import "dotenv/config";
import { db } from "../src/lib/db";
try {
  for (const [code, name] of [
    ["BRASPRESS", "Braspress"],
    ["ALFA", "Alfa Transportes"],
    ["CORREIOS", "Correios"],
  ])
    await db.carrier.upsert({
      where: { code },
      create: { code, name, enabled: false },
      update: {},
    });
} finally {
  await db.$disconnect();
}
