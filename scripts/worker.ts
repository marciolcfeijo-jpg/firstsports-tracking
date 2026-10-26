import "dotenv/config";
import { syncDue } from "../src/lib/sync";
import { db } from "../src/lib/db";
try {
  const result = await syncDue();
  console.log(JSON.stringify(result));
} finally {
  await db.$disconnect();
}
