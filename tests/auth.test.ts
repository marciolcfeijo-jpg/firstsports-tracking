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
import { PATCH as editUserPermissions } from "../src/app/api/admin/users/route";
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
  it("restringe um vendedor ao papel explícito de carteira", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://auth-fixture.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "fixture");
    fixture.user = { id };
    await db.adminUser.upsert({
      where: { id },
      create: { id, email: "role-fixture@example.test", role: "SALES" },
      update: { role: "SALES", active: true },
    });
    expect((await requireAdmin(["SALES"])).id).toBe(id);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
    await expect(requireAdmin(["ADMIN", "OPERATOR"])).rejects.toMatchObject({
      status: 403,
    });
  });
  it("permite ao administrador editar outro perfil e rejeita edição desatualizada ou do próprio acesso", async () => {
    const target = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://auth-fixture.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "fixture");
    fixture.user = { id };
    await db.adminUser.upsert({
      where: { id },
      create: { id, email: "role-fixture@example.test", role: "ADMIN" },
      update: { role: "ADMIN", active: true },
    });
    await db.adminUser.upsert({
      where: { id: target },
      create: {
        id: target,
        email: "carteira-fixture@example.test",
        role: "VIEWER",
      },
      update: { role: "VIEWER", active: true },
    });
    const patch = (
      userId: string,
      previousRole: "VIEWER" | "ADMIN",
      role: "SALES" | "VIEWER",
    ) =>
      editUserPermissions(
        new Request("http://localhost:3000/api/admin/users", {
          method: "PATCH",
          headers: {
            origin: "http://localhost:3000",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: userId,
            previous: { role: previousRole, active: true },
            role,
            active: true,
          }),
        }),
      );

    try {
      expect((await patch(id, "ADMIN", "SALES")).status).toBe(400);
      expect((await patch(target, "VIEWER", "SALES")).status).toBe(200);
      expect((await patch(target, "VIEWER", "VIEWER")).status).toBe(409);
      expect(
        await db.adminUser.findUnique({ where: { id: target } }),
      ).toMatchObject({
        email: "carteira-fixture@example.test",
        role: "SALES",
        active: true,
      });
      fixture.user = { id: target };
      expect((await patch(target, "VIEWER", "VIEWER")).status).toBe(403);
    } finally {
      await db.auditLog.deleteMany({ where: { entityId: target } });
      await db.adminUser.deleteMany({ where: { id: target } });
    }
  });
});
