import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseSpreadsheet, template } from "../src/lib/imports";
import { columns } from "../src/lib/validation";
import { shipmentFixture } from "./fixtures";
const csv = (rows: Record<string, string>[]) =>
  Buffer.from(
    [
      columns.join(";"),
      ...rows.map((r) => columns.map((c) => r[c] ?? "").join(";")),
    ].join("\n"),
  );
describe("spreadsheet parsing", () => {
  it("preserves leading zeros in CSV and marks duplicate rows", async () => {
    const r = await parseSpreadsheet(
      csv([shipmentFixture, shipmentFixture]),
      "orders.csv",
    );
    expect(r[0].data.numero_nf).toBe("000123");
    expect(r[0].errors).toEqual([]);
    expect(r[1].errors).toContain("Nota fiscal duplicada neste arquivo");
  });
  it("reads real XLSX template with synthetic example", async () => {
    const r = await parseSpreadsheet(
      Buffer.from(await template()),
      "model.xlsx",
    );
    expect(r).toHaveLength(1);
    expect(r[0].data.numero_nf).toBe("000123");
    expect(r[0].errors).toEqual([]);
  });
  it("rejects formulas", async () => {
    const b = new ExcelJS.Workbook(),
      s = b.addWorksheet("Dados");
    s.addRow([...columns]);
    s.addRow(columns.map((c) => shipmentFixture[c] || ""));
    s.getCell("A2").value = {
      formula: 'HYPERLINK("https://example.com")',
      result: "evil",
    };
    const r = await parseSpreadsheet(
      Buffer.from(await b.xlsx.writeBuffer()),
      "x.xlsx",
    );
    expect(r[0].errors.join()).toContain("fórmulas");
  });
  it("rejects unsupported, oversized and missing-column files", async () => {
    await expect(
      parseSpreadsheet(Buffer.alloc(5 * 1024 * 1024 + 1), "x.xlsx"),
    ).rejects.toThrow("5 MB");
    await expect(parseSpreadsheet(Buffer.from("x"), "x.pdf")).rejects.toThrow(
      ".xlsx",
    );
    await expect(
      parseSpreadsheet(Buffer.from("foo\nbar"), "x.csv"),
    ).rejects.toThrow("Cabeçalhos");
  });
});

it("accepts 1900 data rows despite distant empty formatted rows and columns", async () => {
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet("Dados");
  sheet.addRow([...columns]);
  for (let i = 0; i < 1900; i++) {
    const data = { ...shipmentFixture, numero_nf: String(i + 1) };
    sheet.addRow(columns.map((column) => data[column] || ""));
  }
  sheet.getCell("AN9000").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEEEEEE" },
  };
  sheet.getRow(9500).height = 25;
  sheet.getCell("A9100").value = "   ";
  const rows = await parseSpreadsheet(
    Buffer.from(await book.xlsx.writeBuffer()),
    "formatted.xlsx",
  );
  expect(rows).toHaveLength(1900);
  expect(rows.every((row) => row.errors.length === 0)).toBe(true);
  expect(rows.at(-1)?.line).toBe(1901);
});
it("preserves sparse column positions and original row numbers without counting gaps", async () => {
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet("Dados");
  columns.forEach((name, index) => {
    sheet.getRow(1).getCell(index * 3 + 1).value = name;
  });
  for (const line of [2, 5000]) {
    const data = { ...shipmentFixture, numero_nf: String(line) };
    columns.forEach((name, index) => {
      sheet.getRow(line).getCell(index * 3 + 1).value = data[name] || "";
    });
  }
  const rows = await parseSpreadsheet(
    Buffer.from(await book.xlsx.writeBuffer()),
    "sparse.xlsx",
  );
  expect(rows.map((row) => row.line)).toEqual([2, 5000]);
  expect(rows[1].data.numero_nf).toBe("5000");
  expect(rows.every((row) => row.errors.length === 0)).toBe(true);
});
it("accepts exactly 2000 actual rows and rejects 2001 actual rows", async () => {
  const records = Array.from({ length: 2000 }, (_, index) => ({
    ...shipmentFixture,
    numero_nf: String(index + 1),
  }));
  expect(await parseSpreadsheet(csv(records), "limit.csv")).toHaveLength(2000);
  await expect(
    parseSpreadsheet(
      csv([...records, { ...shipmentFixture, numero_nf: "2001" }]),
      "over-limit.csv",
    ),
  ).rejects.toThrow("Encontradas: 2001");
});
it("still rejects 31 populated columns and data in a column without a header", async () => {
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet("Dados");
  sheet.addRow([
    ...columns,
    ...Array.from({ length: 18 }, (_, i) => `extra_${i}`),
  ]);
  sheet.addRow(columns.map((name) => shipmentFixture[name] || ""));
  await expect(
    parseSpreadsheet(Buffer.from(await book.xlsx.writeBuffer()), "wide.xlsx"),
  ).rejects.toThrow("30 colunas");
  const noHeader = new ExcelJS.Workbook(),
    other = noHeader.addWorksheet("Dados");
  other.addRow([...columns]);
  other.addRow(columns.map((name) => shipmentFixture[name] || ""));
  other.getCell("N2").value = "unexpected data";
  await expect(
    parseSpreadsheet(
      Buffer.from(await noHeader.xlsx.writeBuffer()),
      "no-header.xlsx",
    ),
  ).rejects.toThrow("cabeçalho");
});
