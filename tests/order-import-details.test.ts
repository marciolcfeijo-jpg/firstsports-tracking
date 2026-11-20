import { afterAll, beforeAll, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { db } from "../src/lib/db";
import { orderImportTemplate } from "../src/lib/order-import-template";
import { importOrders } from "../src/lib/orders";
import { orderImportColumns } from "../src/lib/validation";
import { shipmentFixture } from "./fixtures";

const file = (
  ...rows: Partial<Record<(typeof orderImportColumns)[number], string>>[]
) =>
  Buffer.from(
    [
      orderImportColumns.join(";"),
      ...rows.map((row) =>
        orderImportColumns.map((column) => row[column] ?? "").join(";"),
      ),
    ].join("\n"),
  );

const order = {
  numero_pedido: "000-PED-IMPORT",
  data_emissao_pedido: "2026-10-22",
  nome_cliente: shipmentFixture.nome_cliente,
  cpf_cnpj_destinatario: shipmentFixture.cpf_cnpj_destinatario,
  email_cliente: "cliente-importacao@example.test",
  email_vendedor: "VENDEDOR-IMPORTACAO@example.test",
  cidade_destino: "Campinas",
  uf_destino: "SP",
};

const invoice = {
  numero_nf: "000654",
  serie_nf: "1",
  data_emissao_nf: "2026-10-24",
  chave_acesso_nf: "1".repeat(44),
  cnpj_remetente: "11222333000181",
  cnpj_tomador: "04252011000110",
  transportadora: "braspress",
  numero_cte: "000-CTE",
};

beforeAll(async () => {
  await db.$executeRawUnsafe('TRUNCATE "Customer", "AuditLog" CASCADE');
  await db.adminUser.upsert({
    where: { id: "order-import-details-seller" },
    create: {
      id: "order-import-details-seller",
      email: order.email_vendedor.toLowerCase(),
      active: true,
    },
    update: { active: true },
  });
  await db.carrier.upsert({
    where: { code: "BRASPRESS" },
    create: { code: "BRASPRESS", name: "Braspress" },
    update: {},
  });
});

afterAll(async () => {
  await db.$disconnect();
});

it("preserva cabeçalhos e identificadores no modelo Excel", async () => {
  const workbook = new ExcelJS.Workbook();
  const bytes = await orderImportTemplate();
  await workbook.xlsx.load(
    bytes.buffer as Parameters<typeof workbook.xlsx.load>[0],
  );
  const sheet = workbook.getWorksheet("Pedidos")!;
  expect(sheet.getRow(1).values).toEqual([, ...orderImportColumns]);
  expect(sheet.getColumn(1).numFmt).toBe("@");
  expect(workbook.getWorksheet("Instruções")).toBeDefined();
});

it("importa o pedido antes da NF e vincula depois os dados fiscais sem duplicar", async () => {
  const actor = "order-import-details";
  expect(await importOrders(file(order), "pedidos.csv", actor)).toMatchObject({
    created: 1,
    shipmentsCreated: 0,
  });
  const row = { ...order, ...invoice, email_vendedor: "" };
  expect(await importOrders(file(row), "pedidos.csv", actor)).toMatchObject({
    created: 0,
    shipmentsCreated: 1,
  });
  expect(await importOrders(file(row), "pedidos.csv", actor)).toMatchObject({
    created: 0,
    shipmentsCreated: 0,
    skipped: 1,
  });
  const saved = await db.order.findFirstOrThrow({
    where: { number: order.numero_pedido },
    include: { customer: true, shipments: { include: { invoices: true } } },
  });
  expect(saved).toMatchObject({
    issuedAt: new Date("2026-10-22T00:00:00Z"),
    sellerId: "order-import-details-seller",
    destinationCity: "Campinas",
    customer: { email: order.email_cliente },
    shipments: [
      {
        cte: invoice.numero_cte,
        payerDocument: invoice.cnpj_tomador,
        sellerId: "order-import-details-seller",
        issuedAt: new Date("2026-10-24T15:00:00Z"),
        invoices: [{ number: "654", accessKey: invoice.chave_acesso_nf }],
      },
    ],
  });
});

it("rejeita o lote e informa a linha quando a transportadora não existe", async () => {
  const first = { ...order, numero_pedido: "ROLLBACK-1" };
  const second = {
    ...order,
    ...invoice,
    numero_pedido: "ROLLBACK-2",
    numero_nf: "999",
    transportadora: "INEXISTENTE",
  };
  const result = await importOrders(
    file(first, second),
    "pedidos.csv",
    "order-import-details",
  );
  expect(result.errors).toEqual([
    { line: 3, messages: ["Transportadora não cadastrada"] },
  ]);
  expect(
    await db.order.count({
      where: { number: { in: [first.numero_pedido, second.numero_pedido] } },
    }),
  ).toBe(0);
});

it("define a etapa de pedidos novos e atualiza a de pedidos existentes pela planilha", async () => {
  const actor = "order-import-status";
  const row = { ...order, numero_pedido: "STATUS-PLANILHA" };
  const load = (status_pedido?: string) =>
    importOrders(file({ ...row, status_pedido }), "pedidos.csv", actor);

  expect(await load("Pronto para faturar")).toMatchObject({
    created: 1,
    statusesUpdated: 0,
  });
  const saved = await db.order.findFirstOrThrow({
    where: { number: row.numero_pedido },
  });
  expect(saved.stage).toBe("READY_TO_INVOICE");
  expect(await load("em preparacao")).toMatchObject({
    created: 0,
    statusesUpdated: 1,
  });
  expect(await load("PREPARING")).toMatchObject({
    statusesUpdated: 0,
    skipped: 1,
  });
  expect(await load()).toMatchObject({ statusesUpdated: 0, skipped: 1 });
  expect(await load("Entregue")).toMatchObject({
    errors: [{ line: 2, messages: [expect.stringContaining("status_pedido")] }],
  });
  expect(
    (await db.order.findUniqueOrThrow({ where: { id: saved.id } })).stage,
  ).toBe("PREPARING");
  expect(
    await db.auditLog.findMany({
      where: { entityId: saved.id },
      select: { action: true, snapshot: true },
    }),
  ).toEqual(
    expect.arrayContaining([
      {
        action: "ORDER_CREATE",
        snapshot: { stage: "READY_TO_INVOICE", source: "IMPORT" },
      },
      {
        action: "ORDER_STAGE_UPDATE",
        snapshot: {
          from: "READY_TO_INVOICE",
          stage: "PREPARING",
          source: "IMPORT",
        },
      },
    ]),
  );
});

it("atualiza a etapa interna de um pedido faturado e impede que a planilha cancele a remessa", async () => {
  const row = {
    ...order,
    ...invoice,
    numero_pedido: "STATUS-COM-NF",
    numero_nf: "984",
    chave_acesso_nf: "",
  };
  const actor = "order-import-status";
  expect(await importOrders(file(row), "pedidos.csv", actor)).toMatchObject({
    shipmentsCreated: 1,
  });
  expect(
    await importOrders(
      file({ ...row, status_pedido: "Pronto para faturar" }),
      "pedidos.csv",
      actor,
    ),
  ).toMatchObject({ shipmentsCreated: 0, statusesUpdated: 1 });
  expect(
    await importOrders(
      file({ ...row, status_pedido: "Cancelado" }),
      "pedidos.csv",
      actor,
    ),
  ).toMatchObject({ errors: [{ line: 2 }] });
  const saved = await db.order.findFirstOrThrow({
    where: { number: row.numero_pedido },
    include: { shipments: true },
  });
  expect(saved).toMatchObject({
    stage: "READY_TO_INVOICE",
    shipments: [{ status: "INVOICED" }],
  });
});
