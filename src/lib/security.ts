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
  const expected = new URL(process.env.APP_URL || "http://localhost:3000")
    .origin;
  if (origin !== expected) throw new HttpError(403, "Origem não autorizada");
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
