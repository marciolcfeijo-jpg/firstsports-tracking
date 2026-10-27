import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { Parse } from "unzipper";
import { columns, shipmentSchema, fiscalKey } from "./validation";
import { HttpError } from "./security";
export const MAX_BYTES = 5 * 1024 * 1024,
  MAX_ROWS = 2000;
export async function parseSpreadsheet(
  bytes: Buffer,
  filename: string,
  knownCarrierCodes: string[] = ["BRASPRESS", "ALFA", "CORREIOS"],
) {
  if (bytes.length > MAX_BYTES) throw new HttpError(400, "Arquivo excede 5 MB");
  const book = new ExcelJS.Workbook();
  if (filename.toLowerCase().endsWith(".xlsx")) {
    // Measure actual decompressed bytes, rather than trusting attacker-controlled ZIP metadata.
    let expanded = 0,
      entries = 0;
    const zip = Readable.from(bytes).pipe(Parse({ forceStream: true }));
    try {
      for await (const entry of zip) {
        if (++entries > 200)
          throw new HttpError(400, "Planilha compactada excede os limites");
        for await (const chunk of entry) {
          expanded += chunk.length;
          if (expanded > 20 * 1024 * 1024) {
            entry.destroy();
            throw new HttpError(400, "Planilha compactada excede os limites");
          }
        }
      }
    } catch (error) {
      zip.destroy();
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, "Arquivo XLSX inválido");
    }
    await book.xlsx.load(
      bytes as unknown as Parameters<typeof book.xlsx.load>[0],
    );
  } else if (filename.toLowerCase().endsWith(".csv")) {
    const { Readable } = await import("node:stream");
    const first = bytes.toString("utf8").split(/\r?\n/)[0];
    await book.csv.read(Readable.from(bytes), {
      parserOptions: {
        delimiter: first.includes(";") ? ";" : ",",
        headers: false,
      },
      map: (value) => value,
    });
  } else throw new HttpError(400, "Use um arquivo .xlsx ou .csv");
  const sheet = book.worksheets[0];
  if (!sheet || sheet.rowCount < 2) throw new HttpError(400, "Planilha vazia");
  if (sheet.rowCount > MAX_ROWS + 1 || sheet.columnCount > 30)
    throw new HttpError(400, "Máximo de 2.000 linhas e 30 colunas");
  const header = sheet.getRow(1).values as ExcelJS.CellValue[];
  const names = header.slice(1).map((v) =>
    String(v ?? "")
      .replace(/^\uFEFF/, "")
      .trim(),
  );
  if (
    columns.some((c) => !names.includes(c)) ||
    new Set(names).size !== names.length
  )
    throw new HttpError(
      400,
      "Cabeçalhos ausentes ou repetidos. Baixe o modelo.",
    );
  const seen = new Set<string>();
  const rows = [];
  for (let line = 2; line <= sheet.rowCount; line++) {
    const row = sheet.getRow(line);
    if (!row.hasValues) continue;
    const data: Record<string, string> = {};
    const errors: string[] = [];
    names.forEach((name, index) => {
      const cell = row.getCell(index + 1);
      const value = cell.value;
      if (value && typeof value === "object" && !(value instanceof Date))
        errors.push(`${name}: fórmulas e objetos não são permitidos`);
      data[name] =
        value instanceof Date
          ? value.toISOString().slice(0, 10)
          : String(value ?? "").trim();
    });
    if (!knownCarrierCodes.includes(data.transportadora))
      errors.push("Transportadora não cadastrada");
    if (data.transportadora === "CORREIOS" && !data.codigo_rastreio)
      errors.push("Informe codigo_rastreio para remessas dos Correios");
    const result = shipmentSchema.safeParse(data);
    if (!result.success)
      errors.push(
        ...result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`),
      );
    else {
      const key = fiscalKey(result.data);
      if (seen.has(key)) errors.push("Nota fiscal duplicada neste arquivo");
      seen.add(key);
    }
    rows.push({ line, data, errors });
  }
  return rows;
}
export async function template() {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Pedidos");
  sheet.addRow([...columns]);
  sheet.columns = [...columns, "codigo_rastreio"].map((key) => ({
    key,
    width: 24,
    style: { numFmt: "@" },
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.addRow([
    "EXEMPLO-REMOVER",
    "000123",
    "1",
    "11222333000181",
    "11222333000181",
    "52998224725",
    "Cliente fictício",
    "exemplo@example.com",
    "BRASPRESS",
    "2026-10-24",
    "",
    "São Paulo",
    "SP",
  ]);
  const help = book.addWorksheet("Instruções");
  help.addRow([
    "Exclua a linha fictícia antes de importar. Máximo 2.000 registros / 5 MB.",
  ]);
  help.addRow([
    "Mantenha identificadores como texto e datas AAAA-MM-DD. Transportadora: BRASPRESS, ALFA ou CORREIOS. Para Correios, adicione a coluna codigo_rastreio com o código de 13 caracteres.",
  ]);
  help.addRow([
    "A identidade fiscal é CNPJ emitente + série + número; reimportações não duplicam remessas.",
  ]);
  return book.xlsx.writeBuffer();
}
