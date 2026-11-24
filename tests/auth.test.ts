import { describe, it, expect, vi, afterAll } from "vitest";
import { db } from "../src/lib/db";
const fixture = vi.hoisted(() => ({ user: null as null | { id: string } }));
const authAdmin = vi.hoisted(() => ({ getUserById: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { admin: authAdmin } }),
}));
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
import { PATCH as editOrderStage } from "../src/app/api/admin/orders/route";
import { POST as refreshInvoice } from "../src/app/api/admin/shipments/[id]/sync/route";
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
  it("troca o UUID verificado e mantém os vínculos existentes da carteira", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://auth-fixture.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "fixture");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-fixture");
    fixture.user = { id };
    const before = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const after = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const email = "vinculo-uuid@example.test";
    await db.adminUser.upsert({
      where: { id },
      create: { id, email: "role-fixture@example.test", role: "ADMIN" },
      update: { role: "ADMIN", active: true },
    });
    await db.adminUser.create({ data: { id: before, email, role: "SALES" } });
    const customer = await db.customer.create({
      data: {
        name: "Fixture UUID",
        documentHash: "auth-uuid-fixture",
        city: "São Paulo",
        state: "SP",
      },
    });
    const order = await db.order.create({
      data: {
        number: "AUTH-UUID-TEST",
        customerId: customer.id,
        sellerId: before,
      },
    });
    const carrier = await db.carrier.upsert({
      where: { code: "BRASPRESS" },
      update: {},
      create: { code: "BRASPRESS", name: "Braspress" },
    });
    const shipment = await db.shipment.create({
      data: {
        orderId: order.id,
        sellerId: before,
        carrierId: carrier.id,
        senderDocument: "11222333000181",
        issuedAt: new Date(),
      },
    });

    const patch = () =>
      editUserPermissions(
        new Request("http://localhost:3000/api/admin/users", {
          method: "PATCH",
          headers: {
            origin: "http://localhost:3000",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: before,
            newId: after,
            previous: { role: "SALES", active: true },
            role: "SALES",
            active: true,
          }),
        }),
      );

    try {
      authAdmin.getUserById.mockResolvedValueOnce({
        data: {
          user: {
            id: after,
            email: "alheio@example.test",
            email_confirmed_at: "confirmed",
          },
        },
        error: null,
      });
      expect((await patch()).status).toBe(422);
      expect(
        (await db.shipment.findUniqueOrThrow({ where: { id: shipment.id } }))
          .sellerId,
      ).toBe(before);
      authAdmin.getUserById.mockResolvedValueOnce({
        data: { user: { id: after, email, email_confirmed_at: "confirmed" } },
        error: null,
      });
      const result = await patch();
      expect(result.status).toBe(200);
      expect(await result.json()).toMatchObject({ id: after });
      expect(
        await db.adminUser.findUnique({ where: { id: before } }),
      ).toBeNull();
      expect(
        (await db.shipment.findUniqueOrThrow({ where: { id: shipment.id } }))
          .sellerId,
      ).toBe(after);
      expect(
        (await db.order.findUniqueOrThrow({ where: { id: order.id } }))
          .sellerId,
      ).toBe(after);
      expect(
        await db.auditLog.findFirst({ where: { entityId: after } }),
      ).toMatchObject({
        action: "ADMIN_USER_UPDATE",
        snapshot: { uuid: { from: before, to: after } },
      });
    } finally {
      await db.shipment.delete({ where: { id: shipment.id } });
      await db.order.delete({ where: { id: order.id } });
      await db.customer.delete({ where: { id: customer.id } });
      await db.auditLog.deleteMany({
        where: { entityId: { in: [before, after] } },
      });
      await db.adminUser.deleteMany({ where: { id: { in: [before, after] } } });
    }
  });
  it("permite ao vendedor atualizar somente pedidos e NFs da própria carteira", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://auth-fixture.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "fixture");
    fixture.user = { id };
    await db.adminUser.upsert({
      where: { id },
      create: { id, email: "role-fixture@example.test", role: "SALES" },
      update: { role: "SALES", active: true },
    });
    const customer = await db.customer.create({
      data: {
        name: "Cliente fictício",
        documentHash: "sales-mutations-fixture",
        city: "São Paulo",
        state: "SP",
      },
    });
    const [own, outside, billed] = await db.order.createManyAndReturn({
      data: [
        {
          number: "TEST-SALES-OWN",
          customerId: customer.id,
          stage: "RECEIVED",
          sellerId: id,
        },
        {
          number: "TEST-SALES-OUTSIDE",
          customerId: customer.id,
          stage: "RECEIVED",
        },
        {
          number: "TEST-SALES-BILLED",
          customerId: customer.id,
          stage: "RECEIVED",
          sellerId: id,
        },
      ],
    });
    const carrier = await db.carrier.create({
      data: {
        code: "SALES_MUTATION_FIXTURE",
        name: "Transportadora desativada de teste",
        enabled: false,
      },
    });
    const [assigned, unrelated] = await db.shipment.createManyAndReturn({
      data: [billed, outside].map((order) => ({
        orderId: order.id,
        carrierId: carrier.id,
        senderDocument: "11222333000181",
        issuedAt: new Date(),
      })),
    });
    const headers = {
      origin: "http://localhost:3000",
      "Content-Type": "application/json",
    };
    const stage = (orderId: string, next = "PREPARING") =>
      editOrderStage(
        new Request("http://localhost:3000/api/admin/orders", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ id: orderId, from: "RECEIVED", stage: next }),
        }),
      );
    const sync = (shipmentId: string) =>
      refreshInvoice(
        new Request(
          "http://localhost:3000/api/admin/shipments/" + shipmentId + "/sync",
          { method: "POST", headers },
        ),
        { params: Promise.resolve({ id: shipmentId }) },
      );

    try {
      expect((await stage(outside.id)).status).toBe(404);
      expect((await stage(own.id, "CANCELLED")).status).toBe(403);
      expect((await stage(billed.id)).status).toBe(409);
      expect((await stage(own.id)).status).toBe(204);
      expect(
        (await db.order.findUniqueOrThrow({ where: { id: own.id } })).stage,
      ).toBe("PREPARING");
      expect((await sync(unrelated.id)).status).toBe(404);
      expect(
        await db.auditLog.count({ where: { entityId: unrelated.id } }),
      ).toBe(0);
      const response = await sync(assigned.id);
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        code: "INTEGRATION_DISABLED",
      });
      expect(
        await db.auditLog.count({
          where: { entityId: assigned.id, action: "SYNC_REQUEST", actorId: id },
        }),
      ).toBe(1);
    } finally {
      const shipmentIds = [assigned.id, unrelated.id];
      await db.syncLog.deleteMany({
        where: { shipmentId: { in: shipmentIds } },
      });
      await db.shipment.deleteMany({ where: { id: { in: shipmentIds } } });
      await db.auditLog.deleteMany({
        where: {
          entityId: { in: [...shipmentIds, own.id, outside.id, billed.id] },
        },
      });
      await db.order.deleteMany({ where: { customerId: customer.id } });
      await db.customer.delete({ where: { id: customer.id } });
      await db.carrier.delete({ where: { id: carrier.id } });
    }
  });
});
