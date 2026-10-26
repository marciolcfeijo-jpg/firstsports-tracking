import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { digits } from "./validation";
export function documentHash(value: string) {
  const key = process.env.DOCUMENT_HMAC_KEY;
  if (!key || key.length < 32)
    throw new Error("DOCUMENT_HMAC_KEY precisa de pelo menos 32 caracteres");
  return createHmac("sha256", key).update(digits(value)).digest("hex");
}
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export function secretMatches(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function rateLimit(key: string, limit = 10, seconds = 900) {
  const now = new Date();
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "RateLimit" (key,count,"resetAt") VALUES (${key},1,${new Date(now.getTime() + seconds * 1000)}) ON CONFLICT (key) DO UPDATE SET count=CASE WHEN "RateLimit"."resetAt" < ${now} THEN 1 ELSE "RateLimit".count+1 END, "resetAt"=CASE WHEN "RateLimit"."resetAt" < ${now} THEN ${new Date(now.getTime() + seconds * 1000)} ELSE "RateLimit"."resetAt" END RETURNING count`;
  if (rows[0].count > limit)
    throw new HttpError(429, "Muitas tentativas. Aguarde alguns minutos.");
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = new Set<string>();
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      allowed.add(new URL(configured).origin);
    } catch {
      /* Ignore malformed configuration; never allow arbitrary origins. */
    }
  }
  // Only server-injected Vercel metadata is trusted. Never derive permission from
  // Host, forwarded headers, an arbitrary *.vercel.app suffix or the request URL.
  if (process.env.VERCEL === "1") {
    for (const host of [
      process.env.VERCEL_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ]) {
      if (
        host &&
        /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.vercel\.app$/i.test(host)
      ) {
        allowed.add(new URL("https://" + host).origin);
      }
    }
  } else if (!configured && process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:3000");
  }
  if (!origin || !allowed.has(origin))
    throw new HttpError(403, "Origem não autorizada");
}
export function apiError(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
    return Response.json(
      { error: "Registro já existe. Confira a identidade fiscal." },
      { status: 409 },
    );
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.name === "ZodError")
    return Response.json({ error: "Dados inválidos" }, { status: 400 });
  console.error(
    "Request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    { error: "Não foi possível concluir a operação." },
    { status: 500 },
  );
}
export const noStore = { "Cache-Control": "no-store, private" };
