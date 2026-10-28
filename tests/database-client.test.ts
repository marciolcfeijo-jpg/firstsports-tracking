import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ construct: vi.fn() }));
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    constructor(options: unknown) {
      state.construct(options);
    }
  },
}));
const globalDb = globalThis as unknown as { prisma?: unknown };
afterEach(() => {
  delete globalDb.prisma;
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("reuses the same client across module evaluations in a production warm instance", async () => {
  delete globalDb.prisma;
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://synthetic:synthetic@localhost:5432/synthetic",
  );
  const first = await import("../src/lib/db");
  vi.resetModules();
  const second = await import("../src/lib/db");
  expect(second.db).toBe(first.db);
  expect(state.construct).toHaveBeenCalledTimes(1);
  const options = state.construct.mock.calls[0][0];
  expect(
    new URL(options.datasourceUrl).searchParams.get("connection_limit"),
  ).toBe("1");
});
