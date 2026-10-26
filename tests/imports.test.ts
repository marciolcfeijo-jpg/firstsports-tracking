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
