import { describe, expect, it } from "vitest";
import { orderStatus } from "../src/lib/order-status";
import { orderSchema } from "../src/lib/validation";

describe("acompanhamento do pedido", () => {
  it("exibe a etapa anterior à nota fiscal", () => {
    expect(orderStatus("RECEIVED", [])).toBe("Pedido recebido");
    expect(orderStatus("PREPARING", [])).toBe("Em preparação");
    expect(orderStatus("READY_TO_INVOICE", [])).toBe("Pronto para faturar");
    expect(orderStatus("CANCELLED", [])).toBe("Pedido cancelado");
    expect(orderStatus(null, [])).toBe("Sem remessa vinculada");
  });

  it("usa a remessa assim que a nota fiscal é cadastrada", () => {
    expect(orderStatus("PREPARING", [{ status: "INVOICED" }])).toBe(
      "Faturado · aguardando envio",
    );
    expect(orderStatus(null, [{ status: "IN_TRANSIT" }])).toBe("Em transporte");
  });

  it("mantém a entrega parcial enquanto há remessa pendente", () => {
    expect(
      orderStatus("RECEIVED", [
        { status: "DELIVERED" },
        { status: "IN_TRANSIT" },
      ]),
    ).toBe("Parcialmente entregue");
    expect(
      orderStatus("RECEIVED", [
        { status: "DELIVERED" },
        { status: "DELIVERED" },
      ]),
    ).toBe("Entregue");
  });

  it("distingue devolução, cancelamento e ocorrência", () => {
    expect(orderStatus(null, [{ status: "RETURNED" }])).toBe(
      "Remessa devolvida",
    );
    expect(orderStatus(null, [{ status: "CANCELLED" }])).toBe(
      "Remessas canceladas",
    );
    expect(orderStatus(null, [{ status: "EXCEPTION" }])).toBe(
      "Ocorrência na entrega",
    );
  });

  it("preserva zeros à esquerda e aceita identificadores alfanuméricos", () => {
    expect(orderSchema.shape.numero_pedido.parse(" 001-A ")).toBe("001-A");
    expect(
      orderSchema.shape.cpf_cnpj_destinatario.safeParse("123").success,
    ).toBe(false);
  });
});
