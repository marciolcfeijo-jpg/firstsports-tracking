import { test, expect, type Page } from "@playwright/test";
import { shipmentFixture } from "../fixtures";
async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("E-mail", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password-only");
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(
    page.getByRole("heading", { name: "Visão geral das entregas" }),
  ).toBeVisible();
}
test("public responsive flow, help and server access control", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Onde está/ })).toBeVisible();
  await page.getByRole("button", { name: "RASTREAR ENTREGA" }).click();
  await expect(
    page.getByText("Informe o pedido ou a nota fiscal"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Precisa de ajuda?" }).click();
  await expect(
    page.getByRole("heading", { name: "Vamos acompanhar sua entrega" }),
  ).toBeVisible();
  await page.goto("/admin/remessas");
  await expect(page).toHaveURL(/admin\/login/);
  expect((await request.get("/api/admin/shipments")).status()).toBe(401);
  expect(
    (
      await request.post("/api/admin/shipments", {
        headers: { origin: "https://evil.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await page.goto("/rastreio/invalid");
  await expect(
    page.getByRole("heading", { name: "Link indisponível" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("admin login, manual persistence, multiple invoices, secure lookup and revocation", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Remessas", exact: true }).click();
  await page.getByRole("link", { name: "+ Nova remessa" }).click();
  const order = "E2E-" + test.info().project.name;
  for (const [label, value] of [
    ["Número do pedido", order],
    ["Número da NF", test.info().project.name === "mobile" ? "992" : "991"],
    ["Série da NF", "1"],
    ["CNPJ do remetente", shipmentFixture.cnpj_remetente],
    ["CPF/CNPJ do destinatário", shipmentFixture.cpf_cnpj_destinatario],
    ["Nome do cliente", "Cliente fictício E2E"],
    ["Data de emissão", "2026-10-24"],
    ["Cidade de destino", "São Paulo"],
    ["UF de destino", "SP"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page
    .getByRole("combobox", { name: "Transportadora", exact: true })
    .selectOption("BRASPRESS");
  await page.getByRole("button", { name: "Cadastrar remessa" }).click();
  await expect(
    page.getByRole("heading", { name: "Pedido " + order, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status")).toContainText("Operação concluída");
  await page.getByLabel("Série", { exact: true }).fill("1");
  await page
    .getByLabel("Número da NF", { exact: true })
    .fill(test.info().project.name === "mobile" ? "996" : "995");
  await page
    .getByRole("button", { name: "Vincular nota", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Operação concluída");
  await page.getByRole("button", { name: "Gerar link seguro" }).click();
  const input = page.getByLabel("Link pessoal — válido por 30 dias");
  await expect(input).toBeVisible();
  const url = await input.inputValue();
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Pedido " + order, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Aguardando a primeira atualização", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    shipmentFixture.cpf_cnpj_destinatario,
  );
  await page.goto("/");
  await page
    .getByLabel("Número do pedido ou nota fiscal", { exact: true })
    .fill(order);
  await page
    .getByLabel("CPF ou CNPJ do destinatário", { exact: true })
    .fill(shipmentFixture.cpf_cnpj_destinatario);
  await page.getByRole("button", { name: "RASTREAR ENTREGA" }).click();
  await expect(
    page.getByRole("link", { name: "Acompanhar remessa 1" }),
  ).toBeVisible();
  await page.goto("/admin/remessas");
  await page.getByLabel("Buscar", { exact: true }).fill(order);
  await page.getByRole("button", { name: "Filtrar" }).click();
  await page.getByRole("link", { name: "Visualizar →" }).click();
  await page
    .getByRole("button", { name: "Revogar", exact: true })
    .first()
    .click();
  await expect(page.getByRole("status")).toContainText("Operação concluída");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("real CSV upload, preview, confirmation and duplicate-safe import", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Importações", exact: true }).click();
  const headers = Object.keys(shipmentFixture);
  const row = {
    ...shipmentFixture,
    numero_pedido: "E2E-IMPORT-" + test.info().project.name,
    numero_nf: test.info().project.name === "mobile" ? "994" : "993",
  };
  const csv =
    headers.join(";") +
    "\n" +
    headers.map((k) => row[k as keyof typeof row]).join(";");
  for (let i = 0; i < 2; i++) {
    await page.getByLabel("Selecione sua planilha").setInputFiles({
      name: "synthetic.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await page.getByRole("button", { name: "Validar e visualizar" }).click();
    await expect(
      page.getByRole("heading", { name: "Prévia dos dados" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Confirmar registros válidos" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Relatório de importação" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        i === 0
          ? "Importação concluída. Importadas: 1"
          : "Importação concluída. Importadas: 0",
        { exact: false },
      ),
    ).toBeVisible();
  }
  await page
    .getByRole("link", { name: "Transportadoras", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Transportadoras", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Configurações do ambiente" }),
  ).toBeVisible();
});
