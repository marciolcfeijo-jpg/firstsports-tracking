import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lookupInvoice } from "../src/lib/tracking-lookup";
import { db } from "../src/lib/db";
import { importOrders, updateOrderStage } from "../src/lib/orders";
import { createShipmentTransaction } from "../src/lib/shipments";
import { orderSchema } from "../src/lib/validation";
import { shipmentFixture } from "./fixtures";

const actor = "order-lifecycle-fixture";
const number = "000-LIFECYCLE";
const document = "11222333000181";
const columns = Object.keys(
  orderSchema.shape,
) as (keyof typeof orderSchema.shape)[];
const spreadsheet = (...numbers: string[]) =>
  Buffer.from(
    [
      columns.join(";"),
      ...numbers.map((numero_pedido) => {
        const row = {
          ...shipmentFixture,
          numero_pedido,
          cpf_cnpj_destinatario: document,
        };
        return columns.map((column) => row[column]).join(";");
      }),
    ].join("\n"),
  );

beforeAll(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "Order", "AuditLog", "RateLimit" CASCADE',
  );
});

afterAll(async () => {
  await db.$disconnect();
});

describe("ciclo do pedido importado", () => {
  it("rejeita o lote inteiro quando uma linha é inválida", async () => {
    const result = await importOrders(
      spreadsheet("NO-PARTIAL-IMPORT", ""),
      "pedidos.csv",
      actor,
    );
    expect(result.errors[0]?.line).toBe(3);
    expect(
      await db.order.count({ where: { number: "NO-PARTIAL-IMPORT" } }),
    ).toBe(0);
  });

  it("registra a primeira etapa para pedidos antigos sem remessa", async () => {
    const customer = await db.customer.upsert({
      where: { documentHash: "legacy-order-fixture" },
      update: {},
      create: {
        documentHash: "legacy-order-fixture",
        name: "Cliente de teste",
        city: "São Paulo",
        state: "SP",
      },
    });
    const order = await db.order.create({
      data: { number: "LEGACY-ORDER", customerId: customer.id },
    });
    await expect(
      updateOrderStage({ id: order.id, from: null, stage: "PREPARING" }, actor),
    ).rejects.toMatchObject({ status: 400 });
    await updateOrderStage(
      { id: order.id, from: null, stage: "RECEIVED" },
      actor,
    );
    await expect(
      updateOrderStage({ id: order.id, from: null, stage: "RECEIVED" }, actor),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: order.id } })).stage,
    ).toBe("RECEIVED");
    expect(
      await db.auditLog.count({
        where: { entityId: order.id, action: "ORDER_STAGE_UPDATE" },
      }),
    ).toBe(1);
  });

  it("acompanha o pedido antes da NF, preserva etapas na reimportação e vincula a entrega", async () => {
    expect(
      await importOrders(spreadsheet(number, number), "pedidos.csv", actor),
    ).toMatchObject({ created: 1, skipped: 1 });
    const order = await db.order.findFirstOrThrow({ where: { number } });
    expect(order.stage).toBe("RECEIVED");
    expect(await db.shipment.count({ where: { orderId: order.id } })).toBe(0);
    await expect(
      lookupInvoice({ number: "987654321", document }),
    ).rejects.toMatchObject({ status: 404 });

    await updateOrderStage(
      { id: order.id, from: "RECEIVED", stage: "PREPARING" },
      actor,
    );
    expect(
      await importOrders(spreadsheet(number), "pedidos.csv", actor),
    ).toMatchObject({ created: 0, skipped: 1 });
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: order.id } })).stage,
    ).toBe("PREPARING");

    await db.carrier.upsert({
      where: { code: shipmentFixture.transportadora },
      update: {},
      create: { code: shipmentFixture.transportadora, name: "Braspress" },
    });
    const shipment = await createShipmentTransaction(
      {
        ...shipmentFixture,
        numero_pedido: number,
        cpf_cnpj_destinatario: document,
        numero_nf: "987654321",
      },
      actor,
      order.id,
    );
    await expect(
      updateOrderStage(
        { id: order.id, from: "PREPARING", stage: "CANCELLED" },
        actor,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await db.shipment.update({
      where: { id: shipment.id },
      data: {
        status: "DELIVERED",
        deliveredAt: new Date(),
        events: {
          create: {
            fingerprint: "dispatch",
            status: "IN_TRANSIT",
            description: "Em trânsito",
            occurredAt: new Date("2026-11-10T15:00:00Z"),
            dateOnly: true,
          },
        },
      },
    });

    const internalHistory = await db.auditLog.findMany({
      where: { entityId: order.id },
      select: { action: true, snapshot: true },
    });
    expect(internalHistory).toEqual(
      expect.arrayContaining([
        {
          action: "ORDER_CREATE",
          snapshot: expect.objectContaining({ stage: "RECEIVED" }),
        },
        {
          action: "ORDER_STAGE_UPDATE",
          snapshot: expect.objectContaining({ stage: "PREPARING" }),
        },
      ]),
    );
    const invoice = await lookupInvoice({ number: "987654321", document });
    expect(invoice.links[0]).not.toHaveProperty("orderTimeline");
    expect(invoice.links).toMatchObject([
      {
        shipmentTimeline: [
          { label: "Nota fiscal emitida" },
          { label: "Em viagem" },
          { label: "Entregue" },
        ],
      },
    ]);
  });
});
