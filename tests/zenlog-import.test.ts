import { afterAll, afterEach, expect, it, vi } from "vitest";
import { setCarrierCnpj } from "../src/lib/carriers";
import {
  automaticUpdates,
  zenlogSchedulerActor,
} from "../src/lib/automatic-updates";
import { db } from "../src/lib/db";
import { documentHash, hashToken } from "../src/lib/security";
import { importZenlogPage } from "../src/lib/zenlog-import";
import {
  zenlogOrderPage,
  zenlogOrderSummaries,
} from "../src/lib/zenlog-order-list";
import { zenlogExpeditions } from "../src/lib/zenlog";

vi.mock("../src/lib/zenlog", () => ({ zenlogExpeditions: vi.fn() }));

const carrierCode = "ZENLOG_CNPJ_TEST";
const sellerId = "zenlog-import-test-seller";
const number = "ZENLOG-IMPORT-TEST";
const directNumber = "ZENLOG-DIRECT-TEST";
const recipient = "39724061850";
const issuer = "11222333000181";
const key = "352611" + issuer + "55001" + "000064321" + "1000000000";

afterEach(async () => {
  const orders = await db.order.findMany({
    where: { number: { in: [number, directNumber] } },
  });
  const orderIds = orders.map(({ id }) => id);
  await db.$transaction([
    db.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: sellerId },
          { entityId: { in: orderIds }, actorId: zenlogSchedulerActor },
        ],
      },
    }),
    db.trackingEvent.deleteMany({
      where: { shipment: { orderId: { in: orderIds } } },
    }),
    db.shipmentInvoice.deleteMany({
      where: { shipment: { orderId: { in: orderIds } } },
    }),
    db.shipment.deleteMany({ where: { orderId: { in: orderIds } } }),
    db.order.deleteMany({ where: { id: { in: orderIds } } }),
    db.adminUser.deleteMany({ where: { id: sellerId } }),
    db.customer.deleteMany({
      where: { documentHash: documentHash(recipient), orders: { none: {} } },
    }),
    db.carrier.deleteMany({
      where: { code: { in: [carrierCode, carrierCode + "_OTHER"] } },
    }),
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
  const carrier = await db.carrier.create({
    data: { code: carrierCode, name: "Transportadora de teste" },
  });
  const other = await db.carrier.create({
    data: { code: carrierCode + "_OTHER", name: "Outra transportadora" },
  });
  await setCarrierCnpj(carrier.id, issuer, sellerId);
  await expect(
    setCarrierCnpj(other.id, issuer, sellerId),
  ).rejects.toMatchObject({ status: 409 });
  await db.customer.create({
    data: {
      documentHash: documentHash(recipient),
      name: "Cliente de teste",
      city: "",
      state: "",
      responsibleId: sellerId,
    },
  });
  const document = {
    id: 98,
    pedido: number,
    destinatario: { cpfCnpj: recipient, nome: "Cliente de teste" },
    transportador: "11.222.333/0001-81",
    destinatarioId: 62041,
    atributos: [],
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
  expect(
    await importZenlogPage(0, number, sellerId, { onlyNew: true }),
  ).toMatchObject({
    created: 1,
    linked: 0,
  });
  expect(
    await importZenlogPage(0, number, sellerId, { pendingOnly: true }),
  ).toMatchObject({ alreadyInPortal: 1, linked: 0 });
  expect(zenlogExpeditions).toHaveBeenLastCalledWith(
    0,
    number,
    undefined,
    "id asc",
  );
  const order = await db.order.findFirstOrThrow({
    where: { number, customer: { documentHash: documentHash(recipient) } },
  });
  expect(order.sellerId).toBe(sellerId);
  expect(
    await db.customer.findUnique({ where: { zenlogRecipientId: 62041 } }),
  ).toMatchObject({ id: order.customerId });
  vi.mocked(zenlogExpeditions).mockResolvedValue({
    totalCount: 1,
    items: [
      { ...payload, documentos: [{ ...document, destinatarioId: 62042 }] },
    ],
  });
  expect(await importZenlogPage(0, number, sellerId)).toMatchObject({
    skipped: 1,
    reused: 0,
  });
  expect(
    await zenlogOrderPage("novos", number, 0, 50, undefined, "sem"),
  ).toEqual([order.id]);
  expect(
    await zenlogOrderPage("novos", number, 0, 50, undefined, "com"),
  ).toEqual([]);
  expect(await zenlogOrderPage("novos", number, 0, 50)).toEqual([order.id]);
  expect(await zenlogOrderPage("atualizados", number, 0, 50)).toEqual([]);
  expect(order.issuedAt?.toISOString()).toBe("2026-11-24T00:00:00.000Z");

  const extraKey = key.replace("000064321", "000064322");
  vi.mocked(zenlogExpeditions).mockResolvedValue({
    totalCount: 1,
    items: [
      {
        ...payload,
        situacao: "3",
        eventos: [{ id: 4, eventoId: 52, status: "S" }],
        documentos: [
          {
            ...document,
            numero: "64321",
            serie: "1",
            chave: key,
            notas: [{ numero: "64322", serie: "1", chave: extraKey }],
          },
        ],
      },
    ],
  });
  expect(
    await importZenlogPage(0, number, sellerId, { onlyNew: true }),
  ).toMatchObject({
    alreadyInPortal: 1,
    reused: 0,
    linked: 0,
  });
  expect(
    await db.shipmentInvoice.findUnique({ where: { accessKey: key } }),
  ).toBeNull();
  const target = {
    orderId: order.id,
    invoiceHash: hashToken(key),
    invoiceNumber: "64321",
  };
  expect(
    await importZenlogPage(0, number, sellerId, {
      target: { ...target, orderId: "another-order" },
    }),
  ).toMatchObject({ linked: 0 });
  expect(await importZenlogPage(0, number, sellerId, { target })).toMatchObject(
    {
      reused: 1,
      linked: 1,
      pending: 0,
    },
  );
  expect(zenlogExpeditions).toHaveBeenLastCalledWith(0, number, "64321");
  expect(await importZenlogPage(0, number, sellerId, { target })).toMatchObject(
    {
      reused: 1,
      linked: 0,
      existing: 1,
    },
  );
  expect(
    await db.shipmentInvoice.findUnique({ where: { accessKey: extraKey } }),
  ).toBeNull();
  const invoice = await db.shipmentInvoice.findUniqueOrThrow({
    where: { accessKey: key },
    include: { shipment: true },
  });
  expect(invoice.shipment).toMatchObject({
    orderId: order.id,
    sellerId,
    status: "INVOICED",
    carrierId: carrier.id,
  });
  expect(
    (await automaticUpdates(7)).pedidos.some(
      ({ entityId }) => entityId === order.id,
    ),
  ).toBe(false);
  const enrichedDocument = {
    ...document,
    numero: "64321",
    serie: "1",
    chave: key,
    enderecoCustomizado: { cidade: { nome: "Campinas", uf: "SP" } },
    atributos: [
      ...document.atributos,
      { nome: "E-mail do cliente", valor: "cliente-zenlog@example.test" },
      { nome: "CNPJ do tomador", valor: "04.252.011/0001-10" },
      { nome: "Número do CT-e", valor: "12345" },
      { nome: "Previsão de entrega", valor: "30/11/2026" },
    ],
  };
  vi.mocked(zenlogExpeditions).mockResolvedValue({
    totalCount: 1,
    items: [
      {
        ...payload,
        situacao: "3",
        eventos: [{ id: 4, eventoId: 52, status: "S" }],
        documentos: [enrichedDocument],
      },
    ],
  });
  await db.shipment.update({
    where: { id: invoice.shipmentId },
    data: { destinationCity: "Cidade ajustada no painel" },
  });
  expect(await importZenlogPage(0, number, sellerId)).toMatchObject({
    existing: 1,
    linked: 0,
  });
  expect(
    await db.shipment.findUniqueOrThrow({ where: { id: invoice.shipmentId } }),
  ).toMatchObject({
    destinationCity: "Cidade ajustada no painel",
    destinationState: "SP",
    payerDocument: "04252011000110",
    cte: "12345",
    estimatedDelivery: new Date("2026-11-30T15:00:00Z"),
  });
  expect(
    await db.customer.findUniqueOrThrow({
      where: { documentHash: documentHash(recipient) },
    }),
  ).toMatchObject({
    email: "cliente-zenlog@example.test",
    city: "Campinas",
    state: "SP",
  });
  expect(await zenlogOrderPage("novos", "00064321", 0, 50, "64321")).toEqual([
    order.id,
  ]);
  expect(
    await zenlogOrderPage("atualizados", "00064321", 0, 50, "64321"),
  ).toEqual([]);
  expect(
    await zenlogOrderPage("novos", number, 0, 50, undefined, "sem"),
  ).toEqual([]);
  expect(
    await zenlogOrderPage("novos", number, 0, 50, undefined, "com"),
  ).toEqual([order.id]);
  const entries = await db.auditLog.findMany({
    where: { entityId: order.id, action: "ZENLOG_STATUS" },
  });
  expect(entries).toHaveLength(1);
  expect((await zenlogOrderSummaries([order.id])).get(order.id)).toMatchObject({
    createdByZenlog: true,
    status: "3",
  });
  expect(entries[0].snapshot).toMatchObject({
    expeditionStatus: "3",
    integrationStatus: "0",
    events: [{ code: 52, status: "S" }],
  });
  vi.mocked(zenlogExpeditions).mockResolvedValue({
    totalCount: 1,
    items: [
      {
        ...payload,
        codigo: directNumber,
        documentos: [
          {
            ...document,
            pedido: directNumber,
            numero: "64322",
            serie: "1",
            chave: extraKey,
          },
        ],
      },
    ],
  });
  const newTarget = {
    recipientRef: hashToken(documentHash(recipient)),
    invoiceHash: hashToken(extraKey),
    invoiceNumber: "64322",
  };
  expect(
    await importZenlogPage(0, directNumber, sellerId, {
      target: { ...newTarget, recipientRef: hashToken("another-recipient") },
    }),
  ).toMatchObject({ created: 0, linked: 0 });
  const linked = await importZenlogPage(0, directNumber, sellerId, {
    target: newTarget,
  });
  expect(linked).toMatchObject({
    created: 1,
    linked: 1,
    linkedOrderId: expect.any(String),
  });
  expect(
    await importZenlogPage(0, directNumber, sellerId, { target: newTarget }),
  ).toMatchObject({
    created: 0,
    linked: 0,
    existing: 1,
    linkedOrderId: linked.linkedOrderId,
  });

  const scheduledKey = key.replace("000064321", "000064323");
  vi.mocked(zenlogExpeditions).mockResolvedValue({
    totalCount: 1,
    items: [
      {
        ...payload,
        documentos: [
          { ...document, numero: "64323", serie: "1", chave: scheduledKey },
        ],
      },
    ],
  });
  expect(
    await importZenlogPage(0, number, zenlogSchedulerActor, {
      pendingOnly: true,
    }),
  ).toMatchObject({ linked: 1 });
  expect(
    (await automaticUpdates(7)).pedidos.find(
      ({ entityId }) => entityId === order.id,
    )?.snapshot,
  ).toMatchObject({ created: false, linked: 1 });
});

it("separates a pre-existing order from a ZenLOG-created order after import", async () => {
  const customer = await db.customer.upsert({
    where: { documentHash: documentHash(recipient) },
    create: {
      documentHash: documentHash(recipient),
      name: "Cliente de teste",
      city: "",
      state: "",
    },
    update: {},
  });
  const order = await db.order.create({
    data: {
      number,
      customerId: customer.id,
      createdAt: new Date("2026-10-01T12:00:00Z"),
    },
  });
  expect(await zenlogOrderPage("sem-importacao", number, 0, 50)).toEqual([
    order.id,
  ]);
  vi.mocked(zenlogExpeditions).mockResolvedValue({
    totalCount: 1,
    items: [
      {
        codigo: "EXP-13",
        situacao: "1",
        documentos: [
          {
            pedido: number,
            destinatario: { cpfCnpj: recipient, nome: "Cliente de teste" },
          },
        ],
      },
    ],
  });
  expect(await importZenlogPage(0, number, sellerId)).toMatchObject({
    reused: 1,
  });
  expect(await zenlogOrderPage("atualizados", number, 0, 50)).toEqual([
    order.id,
  ]);
  expect(await zenlogOrderPage("novos", number, 0, 50)).toEqual([]);
  expect(await zenlogOrderPage("sem-importacao", number, 0, 50)).toEqual([]);

  // Simulate an import made before the portal recorded the original source.
  await db.auditLog.delete({ where: { id: "zenlog-origin-" + order.id } });
  await importZenlogPage(0, number, sellerId);
  expect(await zenlogOrderPage("origem-indisponivel", number, 0, 50)).toEqual([
    order.id,
  ]);
  expect((await zenlogOrderSummaries([order.id])).get(order.id)).toMatchObject({
    createdByZenlog: null,
    status: "1",
  });
});
