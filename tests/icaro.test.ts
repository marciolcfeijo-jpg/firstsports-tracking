import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IcaroAdapter } from "../integrations/carriers/icaro";
import {
  resultSchema,
  type TrackingInput,
} from "../integrations/carriers/types";
const key = "35261011222333000181550010000001231000000001";
const input: TrackingInput = {
  invoiceNumber: "123",
  invoiceSeries: "1",
  senderDocument: "11222333000181",
  orderNumber: "PED/123",
  issuedAt: "2026-10-01T03:00:00.000Z",
};
function row(
  id = 1,
  description = "ENTREGA REALIZADA NORMALMENTE",
  at = "2026-10-02T12:00:00-03:00",
) {
  return {
    id,
    occurrence_at: at,
    invoice: { key, series: "1", number: "123" },
    freight: {
      id: 50,
      cte_number: "456",
      delivery_prediction_at: "2026-10-03T23:59:59-03:00",
    },
    occurrence: { code: 1, trigger: "finish", description },
    receiver: "PRIVATE RECEIVER",
    document_number: "PRIVATE DOCUMENT",
    comments: "PRIVATE COMMENT",
  };
}
const page = (data: unknown[], next: number | null = null) => ({
  data,
  paging: { next_id: next },
});
const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
function setup(...pages: unknown[]) {
  const fetcher = vi.fn<typeof fetch>();
  for (const data of pages) fetcher.mockResolvedValueOnce(json(data));
  const gate = vi.fn();
  const paced = async <T>(request: () => Promise<T>): Promise<T> => {
    gate();
    return request();
  };
  return { adapter: new IcaroAdapter(fetcher, paced), fetcher, gate };
}
beforeEach(() => vi.stubEnv("ICARO_API_TOKEN", "synthetic-test-token"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("fetches every page, retains fiscal filters, sorts and deduplicates events without personal data", async () => {
  const first = row(1, "EM TRANSITO", "2026-10-01T12:00:00-03:00");
  const { adapter, fetcher, gate } = setup(
    page([row(2), first], 20),
    page([first]),
  );
  const result = resultSchema.parse(await adapter.trackShipment(input));
  expect(result).toMatchObject({
    carrier: "ICARO",
    currentStatus: "DELIVERED",
    trackingNumber: "456",
    deliveredAt: "2026-10-02T15:00:00.000Z",
    estimatedDelivery: "2026-10-04T02:59:59.000Z",
  });
  expect(result.events.map((e) => e.externalCode)).toEqual(["1", "2"]);
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
  expect(gate).toHaveBeenCalledTimes(2);
  const urls = fetcher.mock.calls.map(([url]) => new URL(String(url)));
  for (const url of urls) {
    expect(url.origin + url.pathname).toBe(
      "https://icaro.eslcloud.com.br/api/customer/invoice_occurrences",
    );
    expect(url.searchParams.get("order_number")).toBe("PED/123");
    expect(url.searchParams.get("since")).toBe(input.issuedAt);
  }
  expect(urls[1].searchParams.get("start")).toBe("20");
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    redirect: "error",
    cache: "no-store",
    headers: { Authorization: "Bearer synthetic-test-token" },
  });
});
it("uses invoice_key when available instead of the order", async () => {
  const { adapter, fetcher } = setup(page([row()]));
  await adapter.trackShipment({ ...input, invoiceAccessKey: key });
  const url = new URL(String(fetcher.mock.calls[0][0]));
  expect(url.searchParams.get("invoice_key")).toBe(key);
  expect(url.searchParams.has("order_number")).toBe(false);
});
it.each([
  { invoice: { key: null, series: null, number: "123" } },
  { invoice: { key: null, series: "1", number: "123" } },
  {
    invoice: {
      key: key.replace("11222333000181", "99888777000166"),
      series: "1",
      number: "123",
    },
  },
  { invoice: { key, series: "2", number: "123" } },
  { invoice: { key, series: "1", number: "999" } },
])(
  "never associates an unrelated/unverifiable fiscal document: %j",
  async (change) => {
    const { adapter } = setup(page([{ ...row(), ...change }]));
    await expect(adapter.trackShipment(input)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  },
);
it("rejects an invoice returned for multiple freights", async () => {
  const { adapter } = setup(
    page([row(), { ...row(2), freight: { ...row().freight, id: 51 } }]),
  );
  await expect(adapter.trackShipment(input)).rejects.toMatchObject({
    code: "AMBIGUOUS_INVOICE",
  });
});
it.each(["COISA NOVA", "ENTREGA REALIZADA PARCIALMENTE", "NAO ENTREGUE"])(
  "does not treat finish/code 1 as confirmation: %s",
  async (description) => {
    const { adapter } = setup(page([row(1, description)]));
    const result = await adapter.trackShipment(input);
    expect(result.currentStatus).not.toBe("DELIVERED");
    expect(result.deliveredAt).toBeUndefined();
  },
);
it("fails closed on repeated cursors instead of persisting partial history", async () => {
  const { adapter } = setup(page([row()], 12), page([row()], 12));
  await expect(adapter.trackShipment(input)).rejects.toMatchObject({
    code: "ICARO_PAGINATION_LOOP",
  });
});
it("does not silently truncate long histories", async () => {
  const { adapter } = setup(
    ...Array.from({ length: 10 }, (_, i) => page([row()], i + 10)),
  );
  await expect(adapter.trackShipment(input)).rejects.toMatchObject({
    code: "ICARO_HISTORY_LIMIT",
  });
});
it.each([
  {},
  { data: [], paging: {} },
  page([{ ...row(), occurrence_at: "invalid" }]),
])("rejects malformed upstream responses", async (payload) => {
  const { adapter } = setup(payload);
  await expect(adapter.trackShipment(input)).rejects.toMatchObject({
    code: "INVALID_ICARO_RESPONSE",
  });
});
it.each([401, 403, 429, 500])(
  "reports HTTP %i without leaking credentials",
  async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("sensitive", { status }));
    const adapter = new IcaroAdapter(fetcher, async (request) => request());
    await expect(adapter.trackShipment(input)).rejects.toMatchObject({
      code:
        status === 429
          ? "RATE_LIMITED"
          : status === 500
            ? "UPSTREAM_HTTP_ERROR"
            : "AUTH_FAILED",
      retryable: status >= 500 || status === 429,
    });
  },
);
it("does not send requests without credentials or identifiers", async () => {
  const { adapter, fetcher } = setup();
  vi.stubEnv("ICARO_API_TOKEN", "");
  await expect(adapter.trackShipment(input)).rejects.toMatchObject({
    code: "CREDENTIALS_MISSING",
  });
  vi.stubEnv("ICARO_API_TOKEN", "synthetic-test-token");
  await expect(
    adapter.trackShipment({ ...input, orderNumber: undefined }),
  ).rejects.toMatchObject({ code: "ICARO_LOOKUP_MISSING" });
  await expect(
    adapter.trackShipment({ ...input, issuedAt: undefined }),
  ).rejects.toMatchObject({ code: "ICARO_ISSUE_DATE_MISSING" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("paces standalone requests across separate adapter instances", async () => {
  vi.useFakeTimers();
  const times: number[] = [];
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
    times.push(Date.now());
    return json(page([row()]));
  });
  const a = new IcaroAdapter(fetcher),
    b = new IcaroAdapter(fetcher);
  const requests = Promise.all([
    a.trackShipment(input),
    b.trackShipment(input),
  ]);
  await vi.runAllTimersAsync();
  await requests;
  expect(times).toHaveLength(2);
  expect(times[1] - times[0]).toBeGreaterThanOrEqual(2000);
});

it("preserves confirmed delivery when proof is digitized afterwards, including across pages", async () => {
  const { adapter } = setup(
    page([row(2, "Comprovante digitalizado", "2026-10-02T12:01:00-03:00")], 20),
    page([
      row(1, "Entrega Realizada Normalmente", "2026-10-02T12:00:00-03:00"),
    ]),
  );
  const result = resultSchema.parse(await adapter.trackShipment(input));
  expect(result.currentStatus).toBe("DELIVERED");
  expect(result.deliveredAt).toBe("2026-10-02T15:00:00.000Z");
  expect(result.events).toHaveLength(2);
  expect(result.events[1]).toMatchObject({
    description: "Comprovante digitalizado",
    status: "UNKNOWN",
  });
});
it("uses a later known transport status instead of making delivery irreversible", async () => {
  const { adapter } = setup(
    page([
      row(1),
      row(2, "DEVOLVIDO", "2026-10-03T12:00:00-03:00"),
      row(3, "Comprovante digitalizado", "2026-10-03T12:01:00-03:00"),
    ]),
  );
  const result = await adapter.trackShipment(input);
  expect(result.currentStatus).toBe("RETURNED");
  expect(result.deliveredAt).toBeUndefined();
});
it("does not manufacture delivery from a standalone administrative event", async () => {
  const { adapter } = setup(page([row(1, "Comprovante digitalizado")]));
  const result = await adapter.trackShipment(input);
  expect(result.currentStatus).toBe("UNKNOWN");
  expect(result.deliveredAt).toBeUndefined();
});
