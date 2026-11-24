import {
  salesOrdersWhere,
  salesReportShipmentWhere,
  salesShipmentsWhere,
} from "../src/lib/sales-portfolio";
import { agedOrdersWithoutShipments } from "../src/lib/operational-report";
import { deliveryMetrics } from "../src/lib/delivery-metrics";
import { shipmentWhere } from "../src/lib/filters";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { db } from "../src/lib/db";
import {
  createShipmentTransaction,
  issueLink,
  publicInclude,
  publicShipment,
} from "../src/lib/shipments";
import {
  documentHash,
  hashToken,
  rateLimit,
  checkOrigin,
} from "../src/lib/security";
import { syncShipment } from "../src/lib/sync";
import { shipmentFixture, normalizedFixture } from "./fixtures";
import type { CarrierTrackingAdapter } from "../integrations/carriers/types";
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Tests require a separate _test database");
  await db.$executeRawUnsafe(
    'TRUNCATE "Customer", "Order", "Shipment", "ShipmentInvoice", "TrackingEvent", "Carrier", "TrackingLink", "SyncLog", "RateLimit", "AuditLog", "ImportBatch", "ImportRow" CASCADE',
  );
  await db.carrier.createMany({
    data: [
      { code: "BRASPRESS", name: "Braspress" },
      { code: "ALFA", name: "Alfa Transportes" },
    ],
  });
});
afterAll(async () => {
  await db.$disconnect();
});
describe("PostgreSQL workflow", () => {
  let id: string;
  it("persists manual entries, protects document and canonicalizes invoice identity", async () => {
    const s = await createShipmentTransaction(shipmentFixture, "test-actor");
    id = s.id;
    const record = await db.shipment.findUniqueOrThrow({
      where: { id },
      include: publicInclude,
    });
    expect(record.order.customer.documentHash).toBe(
      documentHash(shipmentFixture.cpf_cnpj_destinatario),
    );
    expect(JSON.stringify(publicShipment(record))).not.toContain(
      shipmentFixture.cpf_cnpj_destinatario,
    );
    expect(record.invoices[0].number).toBe("123");
    expect(record.events[0].dateOnly).toBe(true);
  });
  it("reimport is idempotent and cross-customer conflicts are rejected", async () => {
    expect(
      (await createShipmentTransaction(shipmentFixture, "test-actor"))
        .duplicate,
    ).toBe(true);
    expect(await db.shipment.count()).toBe(1);
    await expect(
      createShipmentTransaction(
        { ...shipmentFixture, numero_pedido: "OTHER" },
        "test-actor",
      ),
    ).rejects.toThrow("outro pedido");
  });
  it("supports multiple invoices and multiple shipments per order", async () => {
    await db.shipmentInvoice.create({
      data: {
        shipmentId: id,
        issuerDocument: shipmentFixture.cnpj_remetente,
        series: "1",
        number: "124",
      },
    });
    await createShipmentTransaction(
      { ...shipmentFixture, numero_nf: "125", transportadora: "ALFA" },
      "test-actor",
    );
    const s = await db.shipment.findUniqueOrThrow({
      where: { id },
      include: { invoices: true, order: { include: { shipments: true } } },
    });
    expect(s.invoices).toHaveLength(2);
    expect(s.order.shipments).toHaveLength(2);
  });
  it("stores only link hashes, supports expiry/revocation", async () => {
    const token = await issueLink(id, "test-actor");
    expect(token).toHaveLength(43);
    const link = await db.trackingLink.findUniqueOrThrow({
      where: { tokenHash: hashToken(token) },
    });
    expect(link.tokenHash).not.toBe(token);
    await db.trackingLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date() },
    });
    expect(
      (await db.trackingLink.findUniqueOrThrow({ where: { id: link.id } }))
        .revokedAt,
    ).toBeTruthy();
  });
  it("deduplicates tracking events, preserves known data on errors", async () => {
    const fixtureAdapter: CarrierTrackingAdapter = {
      validateConfiguration: () => ({ valid: true }),
      normalizeEvents: () => normalizedFixture.events,
      healthCheck: async () => ({ ok: true }),
      trackShipment: async () => normalizedFixture,
    };
    expect((await syncShipment(id, fixtureAdapter)).ok).toBe(true);
    await syncShipment(id, fixtureAdapter);
    expect(await db.trackingEvent.count({ where: { shipmentId: id } })).toBe(3);
    expect(
      (await db.shipment.findUniqueOrThrow({ where: { id } })).status,
    ).toBe("IN_TRANSIT");
    const failed = await syncShipment(id);
    expect(failed.ok).toBe(false);
    const s = await db.shipment.findUniqueOrThrow({ where: { id } });
    expect(s.status).toBe("IN_TRANSIT");
    expect(s.lastSyncError).toBe("INTEGRATION_DISABLED");
    expect(s.lastSyncedAt).toBeTruthy();
  });
  it("uses leases to prevent concurrent sync and logs updates", async () => {
    await db.shipment.update({
      where: { id },
      data: { leaseUntil: new Date(Date.now() + 60000) },
    });
    await expect(syncShipment(id)).rejects.toThrow("andamento");
    expect(await db.syncLog.count({ where: { shipmentId: id } })).toBe(3);
  });
  it("rate limits atomically and validates origin", async () => {
    await rateLimit("test", 2, 60);
    await rateLimit("test", 2, 60);
    await expect(rateLimit("test", 2, 60)).rejects.toThrow("Muitas tentativas");
    expect(() =>
      checkOrigin(
        new Request("http://localhost:3000", {
          headers: { origin: "https://evil.com" },
        }),
      ),
    ).toThrow("Origem");
    expect(() =>
      checkOrigin(
        new Request("http://localhost:3000", {
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    ).not.toThrow();
  });
});

it("keeps attention list counts in sync with dashboard categories and current filters", async () => {
  const now = new Date("2026-11-21T03:00:00.000Z");
  const fixtures = [
    {
      status: "IN_TRANSIT",
      estimatedDelivery: new Date("2026-11-21T02:59:59Z"),
      carrier: "BRASPRESS",
    },
    {
      status: "IN_TRANSIT",
      estimatedDelivery: new Date("2026-11-21T03:00:00Z"),
      carrier: "BRASPRESS",
    },
    { status: "EXCEPTION", estimatedDelivery: null, carrier: "BRASPRESS" },
    {
      status: "EXCEPTION",
      estimatedDelivery: new Date("2026-11-20T15:00:00Z"),
      carrier: "BRASPRESS",
    },
    {
      status: "CANCELLED",
      estimatedDelivery: new Date("2026-11-20T15:00:00Z"),
      carrier: "BRASPRESS",
    },
    { status: "DELIVERED", estimatedDelivery: null, carrier: "BRASPRESS" },
    { status: "EXCEPTION", estimatedDelivery: null, carrier: "ALFA" },
  ] as const;
  for (const [index, fixture] of fixtures.entries()) {
    const shipment = await createShipmentTransaction(
      {
        ...shipmentFixture,
        numero_pedido: "ATENCAO-PAINEL",
        numero_nf: String(41000 + index),
        transportadora: fixture.carrier,
      },
      "fixture",
    );
    await db.shipment.update({
      where: { id: shipment.id },
      data: {
        status: fixture.status,
        estimatedDelivery: fixture.estimatedDelivery,
      },
    });
  }

  const filters = { q: "ATENCAO-PAINEL", carrier: "BRASPRESS" };
  const shipments = await db.shipment.findMany({
    where: shipmentWhere(new URLSearchParams(filters), now),
  });
  const metrics = deliveryMetrics(shipments, now);
  const labels = {
    open: metrics.open,
    late: metrics.overdue,
    exception: metrics.exceptions,
    "no-forecast": metrics.withoutForecast,
  };
  expect(labels).toEqual({ open: 4, late: 2, exception: 2, "no-forecast": 1 });
  for (const [attention, expected] of Object.entries(labels)) {
    const where = shipmentWhere(
      new URLSearchParams({ ...filters, attention }),
      now,
    );
    expect(await db.shipment.count({ where })).toBe(expected);
  }
  expect(
    await db.shipment.count({
      where: shipmentWhere(
        new URLSearchParams({
          ...filters,
          attention: "exception",
          status: "DELIVERED",
        }),
        now,
      ),
    }),
  ).toBe(0);
});

it("uses actual movement and the selected inactivity threshold for operational reports", async () => {
  const now = new Date("2026-11-21T15:00:00Z");
  const old = new Date("2026-11-18T15:00:00Z");
  const recent = new Date("2026-11-20T15:00:00Z");
  const ids: string[] = [];
  for (const [i, status] of [
    "IN_TRANSIT",
    "IN_TRANSIT",
    "IN_TRANSIT",
    "DELIVERED",
  ].entries()) {
    const { id } = await createShipmentTransaction(
      {
        ...shipmentFixture,
        numero_pedido: "RELATORIO-INATIVIDADE",
        numero_nf: String(42000 + i),
      },
      "fixture",
    );
    await db.shipment.update({
      where: { id },
      data: {
        status: status as "IN_TRANSIT" | "DELIVERED",
        lastSyncedAt: recent,
        events: {
          create: [
            {
              fingerprint: "consulta",
              occurredAt: recent,
              description: "Ocorrência informativa",
              status: "EXCEPTION",
            },
            ...(i === 2
              ? []
              : [
                  {
                    fingerprint: "movement",
                    occurredAt: i === 1 ? recent : old,
                    description: "Movimentação na transportadora",
                    status: "IN_TRANSIT" as const,
                  },
                ]),
          ],
        },
      },
    });
    ids.push(id);
  }
  const params = new URLSearchParams({
    q: "RELATORIO-INATIVIDADE",
    attention: "stalled",
    days: "3",
  });
  expect(
    await db.shipment.findMany({
      where: shipmentWhere(params, now),
      select: { id: true },
    }),
  ).toEqual([{ id: ids[0] }]);
  params.set("days", "4");
  expect(await db.shipment.count({ where: shipmentWhere(params, now) })).toBe(
    0,
  );

  const customer = await db.customer.findFirstOrThrow({
    where: { orders: { some: { number: "RELATORIO-INATIVIDADE" } } },
  });
  await db.order.createMany({
    data: [
      {
        number: "RELATORIO-PEDIDO-ANTIGO",
        customerId: customer.id,
        createdAt: old,
        stage: "PREPARING",
      },
      {
        number: "RELATORIO-PEDIDO-SEM-VINCULO",
        customerId: customer.id,
        createdAt: old,
        stage: null,
      },
      {
        number: "RELATORIO-PEDIDO-CANCELADO",
        customerId: customer.id,
        createdAt: old,
        stage: "CANCELLED",
      },
      {
        number: "RELATORIO-PEDIDO-RECENTE",
        customerId: customer.id,
        createdAt: recent,
        stage: "RECEIVED",
      },
    ],
  });
  expect(
    await db.order.findMany({
      where: {
        ...agedOrdersWithoutShipments(now, 3, "pre-invoice"),
        number: { startsWith: "RELATORIO-PEDIDO" },
      },
      select: { number: true },
    }),
  ).toEqual([{ number: "RELATORIO-PEDIDO-ANTIGO" }]);
  expect(
    await db.order.findMany({
      where: {
        ...agedOrdersWithoutShipments(now, 3, "missing-link"),
        number: { startsWith: "RELATORIO-PEDIDO" },
      },
      select: { number: true },
    }),
  ).toEqual([{ number: "RELATORIO-PEDIDO-SEM-VINCULO" }]);
});

it("faz a busca comercial por vendedor e protege as demais remessas do mesmo pedido", async () => {
  const sellerIds = ["portfolio-seller-a", "portfolio-seller-b"];
  await db.adminUser.createMany({
    data: sellerIds.map((id) => ({
      id,
      email: id + "@example.test",
      role: "SALES",
    })),
    skipDuplicates: true,
  });
  const [own, other] = sellerIds;
  const first = await createShipmentTransaction(
    {
      ...shipmentFixture,
      numero_pedido: "CARTEIRA-MISTA",
      numero_nf: "77661",
      vendedor_id: own,
    },
    "fixture",
  );
  await createShipmentTransaction(
    {
      ...shipmentFixture,
      numero_pedido: "CARTEIRA-MISTA",
      numero_nf: "77662",
      vendedor_id: other,
    },
    "fixture",
  );
  await createShipmentTransaction(
    {
      ...shipmentFixture,
      numero_pedido: "CARTEIRA-ALHEIA",
      numero_nf: "77663",
      vendedor_id: other,
    },
    "fixture",
  );
  const customer = await db.customer.findFirstOrThrow({
    where: { orders: { some: { number: "CARTEIRA-MISTA" } } },
  });
  await db.order.create({
    data: {
      number: "CARTEIRA-PRE-NF",
      customerId: customer.id,
      sellerId: own,
      stage: "RECEIVED",
    },
  });
  const results = await db.order.findMany({
    where: { ...salesOrdersWhere(own), number: { startsWith: "CARTEIRA-" } },
    orderBy: { number: "asc" },
    select: {
      number: true,
      shipments: { where: salesShipmentsWhere(own), select: { id: true } },
    },
  });
  expect(results).toEqual([
    { number: "CARTEIRA-MISTA", shipments: [{ id: first.id }] },
    { number: "CARTEIRA-PRE-NF", shipments: [] },
  ]);
  const now = new Date("2026-11-21T12:00:00Z");
  await db.shipment.updateMany({
    where: { order: { number: { startsWith: "CARTEIRA-" } } },
    data: { estimatedDelivery: new Date("2026-11-20T12:00:00Z") },
  });
  const report = new URLSearchParams({
    attention: "late",
    carrier: "BRASPRESS",
  });
  const shipment = salesReportShipmentWhere(own, report, now);
  expect(
    await db.shipmentInvoice.findMany({
      where: { shipment },
      select: { number: true },
    }),
  ).toEqual([{ number: "77661" }]);
  report.set("seller", other);
  expect(
    await db.shipmentInvoice.count({
      where: { shipment: salesReportShipmentWhere(own, report, now) },
    }),
  ).toBe(0);
});
