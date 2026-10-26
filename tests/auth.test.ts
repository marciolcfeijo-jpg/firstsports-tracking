import { describe, it, expect, vi, afterAll } from "vitest";
import { db } from "../src/lib/db";
const fixture = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: fixture.user }, error: null }),
    },
  }),
}));
import { requireAdmin } from "../src/lib/auth";
const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
afterAll(async () => {
  await db.adminUser.deleteMany({ where: { id } });
  await db.$disconnect();
  vi.unstubAllEnvs();
});
describe("server-side role checks using an isolated external auth fixture", () => {
  it("fails closed when Supabase is unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    await expect(requireAdmin()).rejects.toThrow("Configure o Supabase");
  });
  it("rejects unauthenticated identities and users without an active database grant", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://auth-fixture.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "fixture");
    fixture.user = null;
    await expect(requireAdmin()).rejects.toThrow("Autenticação");
    fixture.user = { id };
    await expect(requireAdmin()).rejects.toThrow("não autorizado");
  });
  it("enforces roles and immediate deactivation on the server", async () => {
    await db.adminUser.upsert({
      where: { id },
      create: { id, email: "role-fixture@example.test", role: "VIEWER" },
      update: { role: "VIEWER", active: true },
    });
    expect((await requireAdmin()).role).toBe("VIEWER");
    await expect(requireAdmin(["ADMIN", "OPERATOR"])).rejects.toThrow(
      "não autorizado",
    );
    await db.adminUser.update({ where: { id }, data: { role: "OPERATOR" } });
    expect((await requireAdmin(["OPERATOR"])).role).toBe("OPERATOR");
    await expect(requireAdmin(["ADMIN"])).rejects.toThrow("não autorizado");
    await db.adminUser.update({ where: { id }, data: { active: false } });
    await expect(requireAdmin()).rejects.toThrow("não autorizado");
  });
});
