import { db } from "./db";

const key = "carrier:ICARO:request";
/** Called only while syncShipment holds the shared Carrier lease. A persisted
 * cooldown survives different serverless instances, failures and process restarts. */
export async function icaroRequest<T>(request: () => Promise<T>): Promise<T> {
  const previous = await db.rateLimit.findUnique({ where: { key } });
  const delay = (previous?.resetAt.getTime() ?? 0) - Date.now();
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  // Reserve the HTTP timeout plus cooldown before sending, including process death.
  await db.rateLimit.upsert({
    where: { key },
    create: { key, count: 0, resetAt: new Date(Date.now() + 17000) },
    update: { resetAt: new Date(Date.now() + 17000) },
  });
  try {
    return await request();
  } finally {
    await db.rateLimit.update({
      where: { key },
      data: { resetAt: new Date(Date.now() + 2000) },
    });
  }
}
