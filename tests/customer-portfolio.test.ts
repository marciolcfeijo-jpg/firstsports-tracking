import { afterAll, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { documentHash } from "../src/lib/security";
import { importPortfolio } from "../src/app/admin/(protected)/clientes/importar/actions";

vi.mock("../src/lib/auth", () => ({
  requireAdmin: async () => ({ id: "portfolio-test-actor" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { actorId: "portfolio-test-actor" } });
  await db.customer.deleteMany({ where: { id: "portfolio-test-customer" } });
  await db.adminUser.deleteMany({ where: { id: "portfolio-test-seller" } });
  await db.$disconnect();
});

it("matches a CNPJ with a missing leading zero and applies the reviewed assignment once", async () => {
  const seller = await db.adminUser.create({
    data: {
      active: false,
      id: "portfolio-test-seller",
      email: "portfolio@example.test",
      role: "SALES",
      erpSellerCode: "portfolio-seller",
    },
  });
  const customer = await db.customer.create({
    data: {
      id: "portfolio-test-customer",
      name: "Cliente de teste",
      city: "",
      state: "",
      documentHash: documentHash("06182429000123"),
    },
  });
  const form = new FormData();
  form.set(
    "arquivo",
    new File(
      [
        "Cliente\tRepres./Vend.\tCNPJ Cliente\tTIPO DE CANAL\r\nportfolio-client\tportfolio-seller\t6182429000123\tLOJA",
      ],
      "clientes.tsv",
    ),
  );
  const preview = await importPortfolio(form);
  expect(preview.summary).toEqual({ "Pronto para atualizar": 1 });
  expect(preview.detail?.[0]).toMatchObject({
    email: seller.email,
    inactive: true,
  });
  expect(
    await db.customer.findUnique({ where: { id: customer.id } }),
  ).toMatchObject({ responsibleId: null });
  form.set("confirmacao", preview.confirmation!);
  expect(await importPortfolio(form)).toEqual({ updated: 1 });
  expect(
    await db.adminUser.findUnique({ where: { id: seller.id } }),
  ).toMatchObject({ active: false });
  expect(
    await db.customer.findUnique({ where: { id: customer.id } }),
  ).toMatchObject({
    responsibleId: seller.id,
    erpCode: "portfolio-client",
  });
  expect(await importPortfolio(form)).toMatchObject({
    error: expect.any(String),
  });
});
