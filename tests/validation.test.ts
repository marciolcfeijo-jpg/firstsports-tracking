import { describe, it, expect } from "vitest";
import {
  validDocument,
  shipmentSchema,
  fiscalKey,
} from "../src/lib/validation";
import { shipmentFixture } from "./fixtures";
describe("CPF/CNPJ and fiscal identity", () => {
  it.each(["529.982.247-25", "11.222.333/0001-81"])(
    "accepts valid check digits %s",
    (s) => expect(validDocument(s)).toBe(true),
  );
  it.each([
    "11111111111",
    "00000000000000",
    "52998224724",
    "11222333000182",
    "",
  ])("rejects invalid %s", (s) => expect(validDocument(s)).toBe(false));
  it("validates actual dates, states, e-mail and required fields", () => {
    expect(shipmentSchema.safeParse(shipmentFixture).success).toBe(true);
    for (const data of [
      { data_emissao: "2026-02-30" },
      { uf_destino: "XX" },
      { email_cliente: "nope" },
      { numero_pedido: "" },
    ])
      expect(
        shipmentSchema.safeParse({ ...shipmentFixture, ...data }).success,
      ).toBe(false);
  });
  it("canonicalizes numeric identifiers without mixing issuers", () => {
    expect(fiscalKey(shipmentFixture)).toBe("11222333000181:1:123");
    expect(
      fiscalKey({ ...shipmentFixture, cnpj_remetente: "04252011000110" }),
    ).not.toBe(fiscalKey(shipmentFixture));
  });
});
