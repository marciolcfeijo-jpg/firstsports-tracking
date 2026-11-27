import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { customerDocumentHashes } from "./customer-document-import";
import { HttpError } from "./security";

const states = new Set(
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(
    " ",
  ),
);

export function parseCustomerStates(text: string) {
  const [header, ...lines] = text
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split(/\r?\n/);
  if (
    header
      .split("\t")
      .map((cell) => cell.trim().toLowerCase())
      .join("\t") !== "cliente\tcnpj cliente\tuf"
  )
    throw new HttpError(
      400,
      "Use um arquivo tabulado com as colunas Cliente, CNPJ Cliente e UF.",
    );
  const rows = lines
    .map((text, index) => ({ text, line: index + 2 }))
    .filter(({ text }) => text.trim());
  if (!rows.length || rows.length > 5000)
    throw new HttpError(
      400,
      "O arquivo deve conter entre 1 e 5.000 linhas de clientes.",
    );

  return rows.map(({ text, line }) => {
    const cells = text.split("\t").map((cell) => cell.trim());
    const [code = "", document = "", inputState = ""] = cells;
    const state = inputState.toUpperCase();
    const hashes = customerDocumentHashes(document);
    let problem: string | undefined;
    if (cells.length !== 3 || !/^\d{1,60}$/.test(code))
      problem = "Código ERP ou linha inválida";
    else if (!states.has(state)) problem = "UF inválida";
    else if (!hashes.length) problem = "Documento inválido";
    else if (hashes.length > 1) problem = "Documento ambíguo";
    return {
      line,
      code: code.slice(0, 60),
      state: state.slice(0, 10),
      hashes,
      problem,
    };
  });
}

export async function customerStatePlan(
  tx: Prisma.TransactionClient,
  rows: ReturnType<typeof parseCustomerStates>,
) {
  const customers = await tx.customer.findMany({
    where: {
      OR: [
        { erpCode: { in: [...new Set(rows.map((row) => row.code))] } },
        {
          documentHash: { in: [...new Set(rows.flatMap((row) => row.hashes))] },
        },
      ],
    },
    select: { id: true, erpCode: true, documentHash: true, state: true },
  });

  const byCode = new Map(
    customers.map((customer) => [customer.erpCode, customer]),
  );
  const byHash = new Map(
    customers.map((customer) => [customer.documentHash, customer]),
  );
  const frequencies = new Map<string, number>();
  for (const row of rows) {
    for (const key of [row.code, ...row.hashes])
      frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
  }

  const updates: { id: string; code: string; state: string }[] = [];
  const inserts: Prisma.CustomerCreateManyInput[] = [];
  const summary: Record<string, number> = {};
  const detail = rows.map(({ line, code, state, hashes, problem }) => {
    const hash = hashes[0];
    const customer = byHash.get(hash);
    const codeOwner = byCode.get(code);
    let status = problem;
    if (!status) {
      if ([code, hash].some((key) => (frequencies.get(key) ?? 0) > 1))
        status = "Cliente repetido no arquivo";
      else if (
        (codeOwner && codeOwner.id !== customer?.id) ||
        (customer?.erpCode && customer.erpCode !== code)
      )
        status = "Código e documento divergentes";
      else if (!customer) {
        status = "Novo cadastro";
        inserts.push({
          name: "Cliente ERP " + code,
          documentHash: hash,
          city: "",
          state,
          erpCode: code,
        });
      } else if (customer.state !== state || !customer.erpCode) {
        status = "Pronto para atualizar";
        updates.push({ id: customer.id, code, state });
      } else status = "Já estava correto";
    }
    summary[status] = (summary[status] ?? 0) + 1;
    return { line, code, state, previousState: customer?.state, status };
  });

  const confirmation = createHash("sha256")
    .update(JSON.stringify({ rows, detail, updates, inserts }))
    .digest("hex");
  return { detail, summary, updates, inserts, confirmation };
}
