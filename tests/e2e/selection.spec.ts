import { test, expect } from "@playwright/test";
import { shipmentFixture } from "../fixtures";

test("selects only page shipments and submits them through bulk progress", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("E-mail", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fixture-password-only");
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(
    page.getByRole("heading", { name: "Visão geral das entregas" }),
  ).toBeVisible();
  const prefix = "SELECTION-" + test.info().project.name;
  const ids: string[] = [];
  for (let i = 0; i < 2; i++) {
    const response = await page.request.post("/api/admin/shipments", {
      headers: { origin: "http://localhost:3100" },
      data: {
        ...shipmentFixture,
        numero_pedido: `${prefix}-${i}`,
        numero_nf: String(
          881000 + (test.info().project.name === "mobile" ? 10 : 0) + i,
        ),
      },
    });
    expect(response.ok()).toBe(true);
    ids.push((await response.json()).id);
  }
  const starts: { shipmentIds: string[] }[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const summary = {
    runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    selectedCount: 2,
    status: "ACTIVE",
    total: 2,
    processed: 0,
    succeeded: 0,
    failed: 0,
    remaining: 2,
    eligible: 2,
    busy: false,
    errors: {},
  };
  await page.route("**/api/admin/shipments/sync-pending", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: null });
    const body = route.request().postDataJSON();
    if (body.action === "start") {
      starts.push(body);
      return route.fulfill({ json: summary });
    }
    expect(body).toEqual({ action: "next", runId: summary.runId });
    await gate;
    return route.fulfill({
      json: {
        ...summary,
        status: "DONE",
        processed: 2,
        succeeded: 2,
        remaining: 0,
        eligible: 0,
      },
    });
  });
  await page.goto("/admin/remessas?q=" + prefix);
  const all = page.getByRole("checkbox", {
    name: "Selecionar todas as remessas desta página",
  });
  const rows = page.getByRole("checkbox", { name: /Selecionar pedido/ });
  const update = page.getByRole("button", {
    name: "Atualizar selecionadas",
    exact: true,
  });
  await expect(rows).toHaveCount(2);
  await expect(update).toBeDisabled();
  await rows.first().check();
  await expect(all).toHaveJSProperty("indeterminate", true);
  await expect(page).toHaveURL(/admin\/remessas\?q=/);
  await all.check();
  await expect(rows.first()).toBeChecked();
  await expect(rows.last()).toBeChecked();
  await all.uncheck();
  await expect(update).toBeDisabled();
  await all.check();
  await update.click();
  try {
    await expect(rows.first()).toBeDisabled();
    await expect(
      page.getByText("Escopo: 2 remessa(s) selecionada(s).", { exact: false }),
    ).toBeVisible();
    expect(starts).toHaveLength(1);
    expect([...starts[0].shipmentIds].sort()).toEqual([...ids].sort());
  } finally {
    release();
  }
  await expect(
    page.getByText("Atualização encerrada.", { exact: false }),
  ).toBeVisible();
  await expect(rows.first()).toBeEnabled();
  await page.getByRole("combobox", { name: "Ordenação" }).selectOption("asc");
  await page.getByRole("button", { name: "Filtrar", exact: true }).click();
  // Changing filters resets page selection, even when the same IDs remain visible.
  await expect(update).toBeDisabled();
});
