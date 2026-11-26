import { Prisma } from "@prisma/client";
import { db } from "./db";

export const zenlogOrderSources = {
  novos: "Criados pelo ZenLOG",
  atualizados: "Já existiam e foram atualizados",
  "origem-indisponivel": "Importados sem origem registrada",
  "sem-importacao": "Sem importação ZenLOG",
} as const;

export type ZenlogOrderSource = keyof typeof zenlogOrderSources;

export function zenlogOrderSource(value: unknown): ZenlogOrderSource | null {
  return typeof value === "string" && Object.hasOwn(zenlogOrderSources, value)
    ? (value as ZenlogOrderSource)
    : null;
}

const sourceFor = (source: "CREATED" | "EXISTING") => Prisma.sql`EXISTS (
  SELECT 1 FROM "AuditLog" z
  WHERE z."entityId" = o.id AND z.action = ${"ZENLOG_ORDER_" + source}
)`;
const importedWithOrder = sourceFor("CREATED");
const importedExistingOrder = sourceFor("EXISTING");
const hasImport = Prisma.sql`EXISTS (
  SELECT 1 FROM "AuditLog" z
  WHERE z."entityId" = o.id AND z.action = 'ZENLOG_STATUS'
)`;

export async function zenlogOrderPage(
  source: ZenlogOrderSource,
  number: string,
  skip: number,
  take: number,
  invoiceNumber?: string,
) {
  const condition =
    source === "novos"
      ? importedWithOrder
      : source === "atualizados"
        ? importedExistingOrder
        : source === "origem-indisponivel"
          ? Prisma.sql`${hasImport} AND NOT ${importedWithOrder} AND NOT ${importedExistingOrder}`
          : Prisma.sql`NOT ${hasImport}`;
  const invoiceMatch = invoiceNumber
    ? Prisma.sql`OR EXISTS (
        SELECT 1 FROM "Shipment" s JOIN "ShipmentInvoice" nf ON nf."shipmentId" = s.id
        WHERE s."orderId" = o.id AND nf.number = ${invoiceNumber}
      )`
    : Prisma.empty;
  const matches = await db.$queryRaw<{ id: string }[]>`
    SELECT o.id FROM "Order" o
    WHERE ${condition}
      ${number ? Prisma.sql`AND (o.number = ${number} ${invoiceMatch})` : Prisma.empty}
    ORDER BY o."createdAt" DESC, o.id DESC OFFSET ${skip} LIMIT ${take}
  `;
  return matches.map(({ id }) => id);
}

type Summary = {
  orderId: string;
  createdByZenlog: boolean | null;
  status: string | null;
  documentStatus: string | null;
  integrationStatus: string | null;
  updatedAt: Date;
};

export async function zenlogOrderSummaries(orderIds: string[]) {
  if (!orderIds.length) return new Map<string, Summary>();
  const rows = await db.$queryRaw<Summary[]>`
    SELECT DISTINCT ON (o.id) o.id AS "orderId",
      CASE WHEN ${importedWithOrder} THEN true
        WHEN ${importedExistingOrder} THEN false END AS "createdByZenlog",
      z.snapshot->>'expeditionStatus' AS status,
      z.snapshot->>'documentStatus' AS "documentStatus",
      z.snapshot->>'integrationStatus' AS "integrationStatus",
      COALESCE((z.snapshot->>'importedAt')::timestamptz, z."createdAt" AT TIME ZONE 'UTC') AS "updatedAt"
    FROM "Order" o
    JOIN "AuditLog" z ON z."entityId" = o.id AND z.action = 'ZENLOG_STATUS'
    WHERE o.id IN (${Prisma.join(orderIds)})
    ORDER BY o.id, "updatedAt" DESC, z.id DESC
  `;
  return new Map(rows.map((row) => [row.orderId, row]));
}
