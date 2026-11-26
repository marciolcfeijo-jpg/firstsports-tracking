import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { OrderJourney } from "../src/components/order-journey";

vi.mock("../src/lib/db", () => ({ db: { auditLog: { findMany: vi.fn() } } }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

it("shows ZenLOG registration, named milestones, invoices and delivery chronologically", async () => {
  vi.stubEnv("ZENLOG_EVENT_NAMES", "{}");
  vi.mocked(db.auditLog.findMany).mockResolvedValue([
    {
      id: "snapshot",
      action: "ZENLOG_STATUS",
      actorId: "admin",
      entityId: "order",
      createdAt: new Date("2026-11-25T12:00:00Z"),
      snapshot: {
        registeredAt: "2026-11-13T16:50:00",
        expeditionStatus: "3",
        integrationStatus: "5",
        documentStatus: "ATIVO",
        events: [
          {
            code: 9,
            sequence: null,
            status: "S",
            start: "2026-11-16T17:08:00",
            end: null,
          },
          {
            code: 6,
            sequence: null,
            status: "S",
            start: "2026-11-14T08:03:00",
            end: null,
          },
          {
            code: 10,
            sequence: null,
            status: "S",
            start: "2026-11-14T08:03:00",
            end: null,
          },
        ],
      },
    },
  ]);
  const html = renderToStaticMarkup(
    await OrderJourney({
      orderId: "order",
      createdAt: new Date("2026-11-25T12:00:00Z"),
      issuedAt: null,
      stage: "RECEIVED",
      shipments: [
        {
          id: "shipment",
          issuedAt: new Date("2026-11-13T12:00:00Z"),
          deliveredAt: new Date("2026-11-19T16:00:00Z"),
          status: "DELIVERED",
          carrier: { name: "Transportadora de teste" },
          invoices: [{ number: "34227", series: "1" }],
          events: [],
        },
      ],
    }),
  );
  const milestones = [
    "Pedido registrado no ZenLOG",
    "Separado",
    "Nota Fiscal",
    "Expedido",
    "Entrega confirmada",
  ];
  const history = html.slice(
    html.indexOf('aria-label="Movimentações em ordem cronológica"'),
  );
  const indices = milestones.map((label) => history.indexOf(label));
  expect(indices.every((index) => index >= 0)).toBe(true);
  expect(indices).toEqual([...indices].sort((a, b) => a - b));
  expect(html).toMatch(
    /Inclusão no ZenLOG[^]*?Concluído<\/span><\/dt><dd>13\/11\/2026, 16:50/,
  );
  expect(html).toMatch(
    /Nota Fiscal[^]*?Concluído<\/span><\/dt><dd>14\/11\/2026, 08:03/,
  );
  expect(html).toMatch(
    /NF impressa<\/span><span[^>]*>Concluído<\/span><\/dt><dd>14\/11\/2026, 08:03/,
  );
  expect(html).toContain("Senior WMS");
  expect(html).toContain("Aguardando registro");
  expect(html).toContain("NF 34227");
  expect(html).toContain("Status técnicos do ZenLOG");
});

it("does not load ZenLOG snapshots outside the seller's authorized order scope", async () => {
  vi.mocked(db.auditLog.findMany).mockResolvedValue([]);
  const journey = await OrderJourney({
    orderId: "order",
    createdAt: new Date("2026-11-25T12:00:00Z"),
    issuedAt: null,
    stage: "RECEIVED",
    shipments: [],
    includeZenlog: false,
  });
  expect(renderToStaticMarkup(journey)).toContain("Sem NF vinculada");
  expect(db.auditLog.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { entityId: "order", action: { in: ["ORDER_STAGE_UPDATE"] } },
    }),
  );
});
