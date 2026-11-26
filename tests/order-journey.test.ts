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
        registeredAt: "2026-11-12T09:00:00",
        expeditionStatus: "3",
        integrationStatus: "5",
        documentStatus: "ATIVO",
        events: [
          {
            code: 9,
            sequence: null,
            name: "Conferência do pedido",
            status: "S",
            start: "2026-11-16T09:00:00",
            end: null,
          },
          {
            code: 6,
            sequence: null,
            status: "S",
            start: "2026-11-13T09:00:00",
            end: null,
          },
          {
            code: 10,
            sequence: null,
            status: "S",
            start: "2026-11-17T09:00:00",
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
          issuedAt: new Date("2026-11-18T12:00:00Z"),
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
    "Conferência do pedido",
    "Nota Fiscal",
    "Nota fiscal emitida",
    "Entrega confirmada",
  ];
  const indices = milestones.map((label) =>
    html.indexOf(label, html.indexOf("Movimentações em ordem cronológica")),
  );
  expect(indices.every((index) => index >= 0)).toBe(true);
  expect(indices).toEqual([...indices].sort((a, b) => a - b));
  expect(html).toMatch(/NF impressa[^]*?Concluído[^]*?18\/11\/2026/);
  expect(html).toMatch(/Separado[^]*?Concluído[^]*?13\/11\/2026/);
  expect(html).toContain("Aguardando registro");
  expect(html).toContain("NF 34227");
  expect(html).toContain("Status técnicos do ZenLOG");
});

it("does not load ZenLOG snapshots outside the seller's authorized order scope", async () => {
  vi.mocked(db.auditLog.findMany).mockResolvedValue([]);
  await OrderJourney({
    orderId: "order",
    createdAt: new Date("2026-11-25T12:00:00Z"),
    issuedAt: null,
    stage: "RECEIVED",
    shipments: [],
    includeZenlog: false,
  });
  expect(db.auditLog.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { entityId: "order", action: { in: ["ORDER_STAGE_UPDATE"] } },
    }),
  );
});
