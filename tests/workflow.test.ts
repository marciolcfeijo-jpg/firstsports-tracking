import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { db } from "../src/lib/db";
import { createShipmentTransaction } from "../src/lib/shipments";
import { editShipment } from "../src/lib/edit-shipment";
import { confirmImport } from "../src/lib/import-confirm";
import { syncDue } from "../src/lib/sync";
import { limitedFormData } from "../src/lib/uploads";
import { shipmentFixture } from "./fixtures";
beforeAll(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "Customer", "Order", "Shipment", "ShipmentInvoice", "TrackingEvent", "Carrier", "TrackingLink", "SyncLog", "RateLimit", "AuditLog", "ImportBatch", "ImportRow" CASCADE',
  );
  for (const [code, name] of [
    ["BRASPRESS", "Braspress"],
    ["ALFA", "Alfa Transportes"],
  ])
    await db.carrier.upsert({
      where: { code },
      create: { code, name },
      update: {},
    });
});
afterAll(async () => {
  await db.$disconnect();
});
describe("editing, resumable imports and scheduled selection", () => {
  let id: string;
  it("edits only the selected destination, uses optimistic concurrency and audits changes", async () => {
    const first = await createShipmentTransaction(
      {
        ...shipmentFixture,
        numero_pedido: "WORKFLOW-TEST",
        numero_nf: "50001",
      },
      "fixture",
    );
    id = first.id;
    const second = await createShipmentTransaction(
      {
        ...shipmentFixture,
        numero_pedido: "WORKFLOW-TEST",
        numero_nf: "50002",
        cidade_destino: "Curitiba",
        uf_destino: "PR",
      },
      "fixture",
    );
    await editShipment(
      id,
      { version: 0, city: "Campinas", state: "SP", cte: "CTE-FIXTURE" },
      "fixture",
    );
    expect(
      (await db.shipment.findUniqueOrThrow({ where: { id: second.id } }))
        .destinationCity,
    ).toBe("Curitiba");
    const changed = await db.shipment.findUniqueOrThrow({ where: { id } });
    expect(changed.destinationCity).toBe("Campinas");
    expect(changed.version).toBe(1);
    await expect(
      editShipment(id, { version: 0, cte: "STALE" }, "fixture"),
    ).rejects.toThrow("outro usuário");
    expect(
      await db.auditLog.count({
        where: { entityId: id, action: "SHIPMENT_UPDATE" },
      }),
    ).toBe(1);
  });
  it("confirms valid rows, records invalid rows, redacts personal preview data and is repeatable", async () => {
    const batch = await db.importBatch.create({
      data: {
        filename: "synthetic.csv",
        createdBy: "fixture",
        rows: {
          create: [
            {
              line: 2,
              data: {
                ...shipmentFixture,
                numero_pedido: "WORKFLOW-IMPORT",
                numero_nf: "50003",
              },
              errors: [],
            },
            {
              line: 3,
              data: { bad: "synthetic" },
              errors: ["Campos inválidos"],
            },
          ],
        },
      },
    });
    expect((await confirmImport(batch.id, "fixture")).completed).toBe(true);
    const result = await db.importBatch.findUniqueOrThrow({
      where: { id: batch.id },
      include: { rows: { orderBy: { line: "asc" } } },
    });
    expect(result.rows.map((r) => r.result)).toEqual(["IMPORTED", "INVALID"]);
    expect(JSON.stringify(result.rows[0].data)).not.toContain(
      shipmentFixture.cpf_cnpj_destinatario,
    );
    expect((await confirmImport(batch.id, "fixture")).completed).toBe(true);
    const repeat = await db.importBatch.create({
      data: {
        filename: "repeat.csv",
        createdBy: "fixture",
        rows: {
          create: {
            line: 2,
            data: {
              ...shipmentFixture,
              numero_pedido: "WORKFLOW-IMPORT",
              numero_nf: "50003",
            },
            errors: [],
          },
        },
      },
    });
    await confirmImport(repeat.id, "fixture");
    expect(
      (await db.importRow.findFirstOrThrow({ where: { batchId: repeat.id } }))
        .result,
    ).toBe("DUPLICATE");
  });
  it("can recover a processing batch after its lease expires", async () => {
    const b = await db.importBatch.create({
      data: {
        filename: "recovery.csv",
        createdBy: "fixture",
        status: "PROCESSING",
        leaseUntil: new Date(Date.now() + 60000),
      },
    });
    await expect(confirmImport(b.id, "fixture")).rejects.toThrow(
      "processamento",
    );
    await db.importBatch.update({
      where: { id: b.id },
      data: { leaseUntil: new Date(Date.now() - 1000) },
    });
    expect((await confirmImport(b.id, "fixture")).completed).toBe(true);
  });
  it("scheduler excludes completed shipments, includes exceptions, and performs privacy maintenance", async () => {
    await db.shipment.update({
      where: { id },
      data: { status: "DELIVERED", nextSyncAt: new Date(0) },
    });
    const exception = await createShipmentTransaction(
      {
        ...shipmentFixture,
        numero_pedido: "WORKFLOW-EXCEPTION",
        numero_nf: "50004",
      },
      "fixture",
    );
    await db.shipment.update({
      where: { id: exception.id },
      data: { status: "EXCEPTION", nextSyncAt: new Date(0) },
    });
    await db.carrier.updateMany({ data: { enabled: true } });
    const old = await db.importBatch.create({
      data: {
        filename: "old.csv",
        createdBy: "fixture",
        createdAt: new Date(Date.now() - 8 * 86400000),
        rows: {
          create: { line: 2, data: { personal: "synthetic" }, errors: [] },
        },
      },
    });
    const seen: string[] = [];
    await syncDue(async (id) => {
      seen.push(id);
      return { ok: true };
    });
    expect(seen).not.toContain(id);
    expect(seen).toContain(exception.id);
    expect(
      (await db.importRow.findFirstOrThrow({ where: { batchId: old.id } }))
        .data,
    ).toEqual({ redacted: true });
    await db.carrier.updateMany({ data: { enabled: false } });
  });
  it("rejects oversized streaming uploads without relying on Content-Length", async () => {
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(100));
        c.close();
      },
    });
    const r = new Request("http://localhost", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    await expect(limitedFormData(r, 10)).rejects.toThrow("limite");
  });
});
