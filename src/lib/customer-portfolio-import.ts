import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { documentHash, HttpError } from "./security";
import { digits, validDocument } from "./validation";

export function parsePortfolio(text: string) {
  const [header, ...lines] = text
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split(/\r?\n/);
  const columns = header.split("\t").map((field) => field.trim().toLowerCase());
  if (
    columns[0] !== "cliente" ||
    columns[1] !== "repres./vend." ||
    columns[2] !== "cnpj cliente"
  )
    throw new HttpError(
      400,
      "Use o arquivo de texto com as colunas Cliente, Repres./Vend. e CNPJ Cliente.",
    );
  if (!lines.length || lines.length > 5_000)
    throw new HttpError(
      400,
      "O arquivo deve conter entre 1 e 5.000 linhas de clientes.",
    );
  return lines
    .filter((line) => line.trim())
    .map((line) => {
      const [code = "", sellerCode = "", document = ""] = line
        .split("\t")
        .map((field) => field.trim());
      const number = digits(document);
      const candidates =
        /^[\d./-]+$/.test(document) && number.length >= 8 && number.length <= 14
          ? [
              number.padStart(14, "0"),
              ...(number.length <= 11 ? [number.padStart(11, "0")] : []),
            ]
          : [];
      const hashes = candidates.filter(validDocument).map(documentHash);
      return { code, sellerCode, hashes };
    });
}

export async function portfolioPlan(
  tx: Prisma.TransactionClient,
  rows: ReturnType<typeof parsePortfolio>,
) {
  const hashes = [...new Set(rows.flatMap((row) => row.hashes))];
  const codes = [
    ...new Set(
      rows.map((row) => row.code).filter((code) => code && code.length <= 60),
    ),
  ];
  const sellerCodes = [
    ...new Set(
      rows
        .map((row) => row.sellerCode)
        .filter((code) => code && code.length <= 60),
    ),
  ];
  const [customers, sellers] = await Promise.all([
    tx.customer.findMany({
      where: {
        OR: [{ documentHash: { in: hashes } }, { erpCode: { in: codes } }],
      },
      select: {
        id: true,
        documentHash: true,
        erpCode: true,
        responsibleId: true,
      },
    }),
    tx.adminUser.findMany({
      where: { erpSellerCode: { in: sellerCodes } },
      select: {
        id: true,
        erpSellerCode: true,
        email: true,
        active: true,
        role: true,
      },
    }),
  ]);
  const byHash = new Map(
    customers.map((customer) => [customer.documentHash, customer]),
  );
  const byCode = new Map(
    customers.map((customer) => [customer.erpCode, customer]),
  );
  const sellerByCode = new Map(
    sellers.map((seller) => [seller.erpSellerCode, seller]),
  );
  const frequency = new Map<string, number>();
  const documentFrequency = new Map<string, number>();
  for (const row of rows) {
    frequency.set(row.code, (frequency.get(row.code) ?? 0) + 1);
    for (const hash of row.hashes)
      documentFrequency.set(hash, (documentFrequency.get(hash) ?? 0) + 1);
  }

  const changes: { id: string; code: string; responsibleId: string }[] = [];
  const summary: Record<string, number> = {};
  const detail = rows.map((row) => {
    const matches = row.hashes.flatMap((hash) => byHash.get(hash) ?? []);
    const customer = matches[0];
    const seller = sellerByCode.get(row.sellerCode);
    const codeOwner = byCode.get(row.code);
    let status: string;
    if (
      !row.code ||
      row.code.length > 60 ||
      !row.sellerCode ||
      row.sellerCode.length > 60 ||
      !row.hashes.length
    )
      status = "Dados inválidos";
    else if (
      (frequency.get(row.code) ?? 0) > 1 ||
      row.hashes.some((hash) => (documentFrequency.get(hash) ?? 0) > 1)
    )
      status = "Cliente repetido no arquivo";
    else if (matches.length > 1 || (codeOwner && codeOwner.id !== customer?.id))
      status = "Código e documento divergentes";
    else if (!customer) status = "Cliente não encontrado no portal";
    else if (customer.erpCode && customer.erpCode !== row.code)
      status = "Cliente já tem outro código ERP";
    else if (!seller) status = "Código do vendedor não encontrado";
    else if (seller.role !== "SALES") status = "Usuário sem perfil de vendedor";
    else if (customer.responsibleId && customer.responsibleId !== seller.id)
      status = "Cliente já tem outro responsável";
    else if (customer.erpCode && customer.responsibleId)
      status = "Já vinculado";
    else {
      status = "Pronto para atualizar";
      changes.push({
        id: customer.id,
        code: row.code,
        responsibleId: seller.id,
      });
    }
    summary[status] = (summary[status] ?? 0) + 1;
    return {
      code: row.code.slice(0, 60),
      sellerCode: row.sellerCode.slice(0, 60),
      email: seller?.email,
      inactive: seller?.active === false,
      status,
    };
  });
  const confirmation = createHash("sha256")
    .update(JSON.stringify({ rows, changes }))
    .digest("hex");
  return { detail, summary, changes, confirmation };
}
