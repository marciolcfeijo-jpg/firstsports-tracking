import { afterAll, afterEach, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { documentHash } from "../src/lib/security";
import { importZenlogPage } from "../src/lib/zenlog-import";
import { zenlogExpeditions } from "../src/lib/zenlog";

vi.mock("../src/lib/zenlog", () => ({ zenlogExpeditions: vi.fn() }));

const sellerId = "zenlog-import-test-seller";
const number = "ZENLOG-IMPORT-TEST";
const recipient = "04252011000110";
const issuer = "11222333000181";
const key = "352611" + issuer + "55001" + "000064321" + "1000000000";

afterEach(async () => {
  const orders = await db.order.findMany({ where: { number } });
  const orderIds = orders.map(({ id }) => id);
  await db.$transaction([
    db.auditLog.deleteMany({ where: { actorId: sellerId } }),
    db.trackingEvent.deleteMany({
      where: { shipment: { orderId: { in: orderIds } } },
    }),
    db.shipmentInvoice.deleteMany({
      where: { shipment: { orderId: { in: orderIds } } },
    }),
    db.shipment.deleteMany({ where: { orderId: { in: orderIds } } }),
    db.order.deleteMany({ where: { id: { in: orderIds } } }),
    db.adminUser.deleteMany({ where: { id: sellerId } }),
  ]);
});

afterAll(() => db.$disconnect());

it("imports an order before invoicing, links its later invoice and keeps reimports idempotent", async () => {
  await db.adminUser.upsert({
    where: { id: sellerId },
    update: {},
    create: {
      id: sellerId,
      email: "seller-zenlog@example.test",
      role: "SALES",
    },
  });
  const document = {
    id: 98,
    pedido: number,
    destinatario: { cpfCnpj: recipient, nome: "Cliente de teste" },
    atributos: [{ nome: "Vendedor", valor: "seller-zenlog@example.test" }],
    situacao: "ATIVO",
    notas: [],
  };
  const shipmentId = 13;
  const payload = {
    id: shipmentId,
    codigo: "EXP-13",
    situacao: "1",
    situacaoIntegracao: 0,
    data: "2026-11-24T13:00:00",
    dataEmissao: "2026-11-25T13:00:00",
    eventos: [{ id: 4, eventoId: 52, status: "0" }],
    documentos: [document],
  };
  vi.mocked(zenlogExpeditions).mockResolvedValue({
    totalCount: 1,
    items: [payload],
  });
  expect(await importZenlogPage(0, number, sellerId)).toMatchObject({
    created: 1,
    linked: 0,
  });
  const order = await db.order.findFirstOrThrow({
    where: { number, customer: { documentHash: documentHash(recipient) } },
  });
  expect(order.sellerId).toBe(sellerId);
  expect(order.issuedAt?.toISOString()).toBe("2026-11-24T00:00:00.000Z");

  vi.mocked(zenlogExpeditions).mockResolvedValue({
    totalCount: 1,
    items: [
      {
        ...payload,
        situacao: "3",
        eventos: [{ id: 4, eventoId: 52, status: "S" }],
        documentos: [{ ...document, numero: "64321", serie: "1", chave: key }],
      },
    ],
  });
  expect(await importZenlogPage(0, number, sellerId)).toMatchObject({
    reused: 1,
    linked: 1,
    pending: 0,
  });
  expect(await importZenlogPage(0, number, sellerId)).toMatchObject({
    reused: 1,
    linked: 0,
    existing: 1,
  });
  const invoice = await db.shipmentInvoice.findUniqueOrThrow({
    where: { accessKey: key },
    include: { shipment: true },
  });
  expect(invoice.shipment).toMatchObject({
    orderId: order.id,
    sellerId,
    status: "INVOICED",
  });
  const entries = await db.auditLog.findMany({
    where: { entityId: order.id, action: "ZENLOG_STATUS" },
  });
  expect(entries).toHaveLength(1);
  expect(entries[0].snapshot).toMatchObject({
    expeditionStatus: "3",
    integrationStatus: "0",
    events: [{ code: 52, status: "S" }],
  });
});
