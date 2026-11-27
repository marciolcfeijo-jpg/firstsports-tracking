import { fillMissingCustomerDestinations } from "../src/lib/customer-destinations";
import { afterAll, expect, it } from "vitest";
import { db } from "../src/lib/db";
import {
  missingShipmentState,
  orderSlaReport,
  slaFilters,
  slaShipmentPageSize,
} from "../src/lib/order-sla-report";

const prefix = "order-sla-fixture";
const order = prefix + "-order";
const customerId = prefix + "-customer";
const sellerId = prefix + "-seller";
const carrierId = prefix + "-carrier";
const shipmentId = prefix + "-shipment";
const pendingShipmentId = prefix + "-pending-shipment";

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { entityId: { startsWith: order } } });
  await db.trackingEvent.deleteMany({ where: { shipmentId } });
  await db.shipmentInvoice.deleteMany({ where: { shipmentId } });
  await db.shipment.deleteMany({
    where: { id: { in: [shipmentId, pendingShipmentId] } },
  });
  await db.order.deleteMany({ where: { id: { startsWith: order } } });
  await db.customer.deleteMany({ where: { id: customerId } });
  await db.carrier.deleteMany({ where: { id: carrierId } });
  await db.adminUser.deleteMany({ where: { id: sellerId } });
  await db.$disconnect();
});

it("groups the three elapsed times by destination and filters by the ZenLOG inclusion date and portfolio owner", async () => {
  const deliveredAt = new Date("2026-11-20T04:30:00Z");
  await db.adminUser.create({
    data: { id: sellerId, email: "sla@example.test", role: "SALES" },
  });
  await db.customer.create({
    data: {
      id: customerId,
      name: "Cliente SLA Fixture",
      city: "",
      state: "SP",
      documentHash: customerId,
      erpCode: "SLA-123",
      responsibleId: sellerId,
    },
  });
  await db.order.create({
    data: { id: order, number: "TEST-SLA", customerId },
  });
  await db.carrier.create({
    data: { id: carrierId, code: "SLA_TEST", name: "Transportadora SLA" },
  });
  await db.shipment.create({
    data: {
      id: shipmentId,
      orderId: order,
      carrierId,
      destinationState: "RJ",
      status: "DELIVERED",
      senderDocument: "11222333000181",
      issuedAt: new Date("2026-11-18T14:30:00Z"),
      deliveredAt,
      invoices: {
        create: {
          issuerDocument: "11222333000181",
          series: "1",
          number: "9151217",
        },
      },
      events: {
        create: {
          fingerprint: "sla-delivery",
          occurredAt: deliveredAt,
          status: "DELIVERED",
          description: "Entrega confirmada",
        },
      },
    },
  });
  await db.auditLog.create({
    data: {
      entityId: order,
      actorId: sellerId,
      action: "ZENLOG_STATUS",
      snapshot: {
        registeredAt: "2026-11-17T23:30:00",
        events: [
          { code: 10, status: "S", end: "2026-11-18T11:30:00-03:00" },
          { code: 9, status: "S", end: "2026-11-19T01:30:00" },
          { code: 9, status: "E", end: "2026-11-18T12:30:00" },
        ],
      },
    },
  });
  const filters = slaFilters({
    de: "2026-11-17",
    ate: "2026-11-17",
    cliente: "SLA-123",
    vendedor: sellerId,
  });
  expect((await orderSlaReport(filters)).groups).toEqual([
    {
      state: "RJ",
      orders: 1,
      measures: [
        { total: 12, count: 1 },
        { total: 14, count: 1 },
        { total: 24, count: 1 },
      ],
    },
  ]);
  expect(
    (await orderSlaReport({ ...filters, start: "2026-11-18", end: "" })).groups,
  ).toEqual([]);
  expect(
    (await orderSlaReport({ ...filters, sellerId: "other-seller" })).groups,
  ).toEqual([]);

  await db.shipment.create({
    data: {
      id: pendingShipmentId,
      orderId: order,
      carrierId,
      senderDocument: "11222333000181",
      issuedAt: deliveredAt,
    },
  });
  const allOrders = { ...filters, allOrders: true };
  const partial = await orderSlaReport(filters, { state: "RJ", page: 1 });
  expect(partial).toMatchObject({
    groups: [],
    matchingOrders: 0,
    shipmentDetails: [],
  });
  expect((await orderSlaReport(allOrders)).groups[0].measures).toEqual([
    { total: 12, count: 1 },
    { total: 14, count: 1 },
    { total: 0, count: 0 },
  ]);
  await db.shipment.update({
    where: { id: pendingShipmentId },
    data: { status: "CANCELLED" },
  });
  expect((await orderSlaReport(filters)).groups[0].measures[2]).toEqual({
    total: 24,
    count: 1,
  });

  await db.shipment.delete({ where: { id: pendingShipmentId } });

  await db.trackingEvent.updateMany({
    where: { shipmentId },
    data: { dateOnly: true },
  });
  expect((await orderSlaReport(filters)).groups).toEqual([]);
  expect((await orderSlaReport(allOrders)).groups[0].measures[2]).toEqual({
    total: 0,
    count: 0,
  });
  const detail = await orderSlaReport(allOrders, { state: "RJ", page: 1 });
  expect(detail.matchingShipments).toBe(1);
  expect(detail.shipmentDetails).toMatchObject([
    { id: shipmentId, state: "RJ", groupedState: "RJ" },
  ]);
  expect(
    (await orderSlaReport(allOrders, { state: "RJ", page: 2 })).shipmentDetails,
  ).toEqual([]);
  await db.shipment.update({
    where: { id: shipmentId },
    data: { destinationState: "" },
  });
  const missing = await orderSlaReport(allOrders, {
    state: missingShipmentState,
    page: 1,
  });
  expect(missing.missingShipmentStates).toBe(1);
  expect(missing.matchingShipments).toBe(1);
  expect(missing.shipmentDetails).toMatchObject([
    { id: shipmentId, state: undefined, groupedState: "SP" },
  ]);
  expect(
    await db.$transaction((tx) =>
      fillMissingCustomerDestinations(tx, {
        id: customerId,
        city: "Campinas",
        state: "SP",
      }),
    ),
  ).toEqual({ orders: 1, shipments: 1 });
  expect(
    await db.shipment.findUnique({ where: { id: shipmentId } }),
  ).toMatchObject({
    destinationCity: "Campinas",
    destinationState: "SP",
    status: "DELIVERED",
  });
  expect(
    await db.$transaction((tx) =>
      fillMissingCustomerDestinations(tx, {
        id: customerId,
        city: "Manaus",
        state: "AM",
      }),
    ),
  ).toEqual({ orders: 0, shipments: 0 });

  await db.customer.update({ where: { id: customerId }, data: { state: "" } });
  await db.order.update({
    where: { id: order },
    data: { destinationState: "" },
  });
  await db.shipment.update({
    where: { id: shipmentId },
    data: { destinationState: "" },
  });
  const ordersWithoutShipments = Array.from(
    { length: slaShipmentPageSize },
    (_, i) => ({
      id: order + "-" + i,
      number: "TEST-SLA-" + i,
      customerId,
    }),
  );
  await db.order.createMany({ data: ordersWithoutShipments });
  await db.auditLog.createMany({
    data: ordersWithoutShipments.map(({ id }) => ({
      entityId: id,
      actorId: sellerId,
      action: "ZENLOG_STATUS",
      snapshot: { registeredAt: "2026-11-17T23:30:00" },
    })),
  });

  await db.trackingEvent.updateMany({
    where: { shipmentId },
    data: { dateOnly: false },
  });
  const completed = await orderSlaReport(filters, { state: "Sem UF", page: 1 });
  expect(completed.groups[0]).toMatchObject({ state: "Sem UF", orders: 1 });
  expect(completed).toMatchObject({ matchingOrders: 1, matchingShipments: 1 });
  expect(completed.shipmentDetails).toMatchObject([{ id: shipmentId }]);

  const groupDetail = await orderSlaReport(allOrders, {
    state: "Sem UF",
    page: 1,
  });
  expect(groupDetail.groups[0]).toMatchObject({ state: "Sem UF", orders: 51 });
  expect(groupDetail).toMatchObject({
    matchingOrders: 51,
    matchingShipments: 1,
  });
  expect(groupDetail.shipmentDetails).toHaveLength(slaShipmentPageSize);
  expect(groupDetail.shipmentDetails[0]).toMatchObject({ id: shipmentId });
  expect(groupDetail.shipmentDetails[1]).toMatchObject({
    orderId: order + "-0",
    invoices: [],
  });
  expect(
    (await orderSlaReport(allOrders, { state: "Sem UF", page: 2 }))
      .shipmentDetails,
  ).toHaveLength(1);

  const shipmentDetail = await orderSlaReport(allOrders, {
    state: missingShipmentState,
    page: 1,
  });
  expect(shipmentDetail.shipmentDetails).toMatchObject([{ id: shipmentId }]);
});
