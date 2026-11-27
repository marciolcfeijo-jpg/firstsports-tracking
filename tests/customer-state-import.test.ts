import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { importCustomerStates } from "../src/app/admin/(protected)/clientes/importar-uf/actions";
import { db } from "../src/lib/db";
import { documentHash } from "../src/lib/security";

vi.mock("../src/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ id: "operador-teste" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "Customer", "AuditLog" CASCADE');
});
afterAll(() => db.$disconnect());

function upload(confirmation?: string) {
  const form = new FormData();
  const text = [
    "Cliente\tCNPJ Cliente\tUF",
    "6\t10000000009959\tRJ",
    "11\t1234567809938\tSP",
    "12\t10000000009959\tCZ",
    "13\t0\tGO",
    "14\t20000000009902\tGO",
  ].join("\r\n");
  form.set("arquivo", new File([text], "clientes.txt"));
  if (confirmation) form.set("confirmacao", confirmation);
  return importCustomerStates(form);
}

it("checks the preview before applying, preserves customer details and avoids duplicate records", async () => {
  const existing = await db.customer.create({
    data: {
      name: "Cliente existente",
      city: "Goiânia",
      state: "SP",
      documentHash: documentHash("20000000009902"),
    },
  });
  const preview = await upload();
  expect(preview.summary).toEqual({
    "Cliente repetido no arquivo": 1,
    "Novo cadastro": 1,
    "UF inválida": 1,
    "Documento inválido": 1,
    "Pronto para atualizar": 1,
  });
  expect(await db.customer.count()).toBe(1);

  await db.customer.update({
    where: { id: existing.id },
    data: { state: "MG" },
  });
  expect((await upload(preview.confirmation)).error).toContain(
    "Consulte a prévia",
  );
  expect(await db.customer.count()).toBe(1);

  const fresh = await upload();
  expect(await upload(fresh.confirmation)).toEqual({ created: 1, updated: 1 });
  expect(
    await db.customer.findUnique({ where: { id: existing.id } }),
  ).toMatchObject({
    erpCode: "14",
    state: "GO",
    name: "Cliente existente",
    city: "Goiânia",
  });
  expect(
    await db.customer.findUnique({ where: { erpCode: "11" } }),
  ).toMatchObject({
    name: "Cliente ERP 11",
    state: "SP",
    documentHash: documentHash("01234567809938"),
  });
  expect((await upload()).summary?.["Já estava correto"]).toBe(2);
  expect((await upload()).canApply).toBe(false);
});
