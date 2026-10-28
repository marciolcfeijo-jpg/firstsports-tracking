import { expect, it } from "vitest";
import { deliveryMetrics } from "../src/lib/delivery-metrics";
const now = new Date("2026-10-28T15:00:00Z");
const row = (
  status: string,
  deliveredAt: string | null,
  estimatedDelivery: string | null,
) => ({ status, deliveredAt, estimatedDelivery, carrierId: "carrier" });
it("separates delivered outcomes and excludes missing dates from the percentage", () => {
  const result = deliveryMetrics(
    [
      row("DELIVERED", "2026-10-26T15:00:00Z", "2026-10-27T15:00:00Z"),
      row("DELIVERED", "2026-10-27T22:00:00Z", "2026-10-27T03:00:00Z"),
      row("DELIVERED", "2026-10-28T15:00:00Z", "2026-10-27T15:00:00Z"),
      row("DELIVERED", null, "2026-10-27T15:00:00Z"),
      row("DELIVERED", "2026-10-27T15:00:00Z", null),
    ],
    now,
  );
  expect(result).toMatchObject({
    delivered: 5,
    early: 1,
    onDay: 1,
    after: 1,
    unclassified: 2,
    comparable: 3,
  });
  expect(result.onTimeRate).toBeCloseTo(200 / 3);
  expect(result.early + result.onDay + result.after + result.unclassified).toBe(
    result.delivered,
  );
});
it("compares local calendar days instead of timestamps on the same promised date", () => {
  const result = deliveryMetrics(
    [
      row("DELIVERED", "2026-10-28T02:30:00Z", "2026-10-27T03:00:00Z"),
      row("IN_TRANSIT", null, "2026-10-28T03:00:00Z"),
    ],
    now,
  );
  expect(result.onDay).toBe(1);
  expect(result.after).toBe(0);
  expect(result.overdue).toBe(0);
});
it("overdue begins only on the next day in Sao Paulo and excludes returned/cancelled records", () => {
  const result = deliveryMetrics(
    [
      row("IN_TRANSIT", null, "2026-10-27T15:00:00Z"),
      row("EXCEPTION", null, "2026-10-27T15:00:00Z"),
      row("RETURNED", null, "2026-10-20T15:00:00Z"),
      row("CANCELLED", null, "2026-10-20T15:00:00Z"),
      row("INVOICED", null, null),
    ],
    now,
  );
  expect(result).toMatchObject({
    total: 5,
    open: 3,
    closedOther: 2,
    overdue: 2,
    exceptions: 1,
    withoutForecast: 1,
  });
  expect(result.total).toBe(
    result.open + result.delivered + result.closedOther,
  );
});
it("respects the local-day boundary before UTC midnight is reached locally", () => {
  const records = [row("IN_TRANSIT", null, "2026-10-27T03:00:00Z")];
  expect(
    deliveryMetrics(records, new Date("2026-10-28T02:59:59Z")).overdue,
  ).toBe(0);
  expect(
    deliveryMetrics(records, new Date("2026-10-28T03:00:00Z")).overdue,
  ).toBe(1);
});
it("does not invent dates or a zero-percent performance for unavailable comparisons", () => {
  expect(deliveryMetrics([], now).onTimeRate).toBeNull();
  expect(
    deliveryMetrics([row("DELIVERED", "invalid", null)], now),
  ).toMatchObject({ unclassified: 1, onTimeRate: null });
});
it("counts distinct carriers with last-sync failures separately from delivery occurrences", () => {
  const result = deliveryMetrics(
    [
      { ...row("IN_TRANSIT", null, null), lastSyncError: "NETWORK_ERROR" },
      { ...row("IN_TRANSIT", null, null), lastSyncError: "AUTH_FAILED" },
      { ...row("EXCEPTION", null, null), carrierId: "other" },
    ],
    now,
  );
  expect(result.failedCarriers).toBe(1);
  expect(result.exceptions).toBe(1);
});

it("keeps date-only values as civil dates rather than shifting them to the prior day", () => {
  const result = deliveryMetrics(
    [row("DELIVERED", "2026-10-28T02:30:00Z", "2026-10-27")],
    now,
  );
  expect(result.onDay).toBe(1);
  expect(result.after).toBe(0);
});
