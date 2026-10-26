import { afterEach, describe, it, expect, vi } from "vitest";
import { checkOrigin } from "../src/lib/security";
const request = (origin?: string, headers: Record<string, string> = {}) =>
  new Request("http://internal-service/api/tracking/lookup", {
    headers: { ...(origin ? { origin } : {}), ...headers },
  });
afterEach(() => vi.unstubAllEnvs());
describe("trusted browser origins behind Vercel", () => {
  it("accepts the configured origin and rejects unrelated origins", () => {
    vi.stubEnv("APP_URL", "https://rastreio.example.com");
    expect(() =>
      checkOrigin(request("https://rastreio.example.com")),
    ).not.toThrow();
    expect(() => checkOrigin(request("https://evil.example"))).toThrow(
      "Origem não autorizada",
    );
  });
  it("accepts only exact Vercel deployment and production origins from platform metadata", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_URL", "tracking-build-team.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "tracking.vercel.app");
    for (const origin of [
      "https://tracking-build-team.vercel.app",
      "https://tracking.vercel.app",
    ])
      expect(() => checkOrigin(request(origin))).not.toThrow();
    for (const origin of [
      "https://another-project.vercel.app",
      "http://tracking.vercel.app",
      "https://tracking.vercel.app.evil.example",
      "null",
    ])
      expect(() => checkOrigin(request(origin))).toThrow(
        "Origem não autorizada",
      );
  });
  it("retains Vercel origins even when APP_URL points to an old local address", () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_URL", "tracking-deploy.vercel.app");
    expect(() =>
      checkOrigin(request("https://tracking-deploy.vercel.app")),
    ).not.toThrow();
  });
  it("does not trust reflected hosts or missing Origin", () => {
    vi.stubEnv("APP_URL", "https://tracking.example.com");
    expect(() =>
      checkOrigin(
        request("https://evil.example", {
          host: "evil.example",
          "x-forwarded-host": "evil.example",
        }),
      ),
    ).toThrow();
    expect(() => checkOrigin(request())).toThrow();
  });
  it("rejects invalid metadata, even if the attacker claims a matching host", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_URL", "good.vercel.app@evil.example");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "good.vercel.app/path");
    expect(() => checkOrigin(request("https://evil.example"))).toThrow();
  });
  it("fails closed outside Vercel production without APP_URL", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => checkOrigin(request("http://localhost:3000"))).toThrow();
  });
});
