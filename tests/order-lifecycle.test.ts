import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as lookupOrder } from "../src/app/api/tracking/order/route";
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

function lookup(number: string, document: string) {
  return lookupOrder(
    new Request("http://localhost:3000/api/tracking/order", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ number, document }),
    }),
  );
}

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

  it("acompanha o pedido antes da NF, preserva etapas na reimportação e vincula a entrega", async () => {
    expect(
      await importOrders(spreadsheet(number, number), "pedidos.csv", actor),
    ).toMatchObject({ created: 1, skipped: 1 });
    const order = await db.order.findFirstOrThrow({ where: { number } });
    const beforeInvoice = await lookup(number, document);
    expect(beforeInvoice.status).toBe(200);
    expect(await beforeInvoice.json()).toMatchObject({
      number,
      status: "Pedido recebido",
      shipments: [],
      orderTimeline: [{ label: "Pedido recebido" }],
    });
    expect(
      (await lookup(number, shipmentFixture.cpf_cnpj_destinatario)).status,
    ).toBe(404);

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

    const delivered = await lookup(number, document);
    expect(delivered.status).toBe(200);
    expect(await delivered.json()).toMatchObject({
      number,
      status: "Entregue",
      orderTimeline: [{ label: "Pedido recebido" }, { label: "Em preparação" }],
      shipments: [
        {
          status: "DELIVERED",
          timeline: [
            { label: "Nota fiscal emitida", dateOnly: true },
            { label: "Em viagem", dateOnly: true },
            { label: "Entregue", dateOnly: true },
          ],
        },
      ],
    });
    const invoice = await lookupInvoice({ number: "987654321", document });
    expect(invoice.links).toMatchObject([
      {
        orderTimeline: [
          { label: "Pedido recebido" },
          { label: "Em preparação" },
        ],
        shipmentTimeline: [
          { label: "Nota fiscal emitida" },
          { label: "Em viagem" },
          { label: "Entregue" },
        ],
      },
    ]);
  });
});
