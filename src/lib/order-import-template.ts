import ExcelJS from "exceljs";
import { orderStageLabels } from "./order-status";
import { orderImportColumns } from "./validation";

export async function orderImportTemplate() {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Pedidos", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = orderImportColumns.map((column) => ({
    header: column,
    width: column === "chave_acesso_nf" ? 48 : 26,
    style: { numFmt: "@" },
  }));
  sheet.getRow(1).font = { bold: true };
  const guide = book.addWorksheet("Instruções");
  guide.getColumn(1).width = 110;
  guide.addRows([
    [
      "Transportadoras: use o código cadastrado (por exemplo BRASPRESS, ALFA, CORREIOS ou ICARO).",
    ],
    [
      "Campos básicos: numero_pedido, nome_cliente, cpf_cnpj_destinatario, cidade_destino e uf_destino.",
    ],
    [`status_pedido: ${Object.values(orderStageLabels).join(", ")}.`],
    [
      "Em branco, status_pedido mantém a etapa existente. Para pedidos novos, o padrão é Pedido recebido.",
    ],
    [
      "A planilha atualiza a etapa interna do pedido. O status de entrega vem das remessas.",
    ],
    ["Use AAAA-MM-DD para data_emissao_pedido e data_emissao_nf."],
    ["Informe email_vendedor com o e-mail de um usuário ativo cadastrado."],
    ["Sem NF emitida, deixe as colunas fiscais e de transporte vazias."],
    [
      "Com NF, informe número, série, data de emissão, CNPJ do remetente e código da transportadora.",
    ],
    [
      "Para Correios, informe codigo_rastreio. Sem CNPJ do tomador, o sistema usa o CNPJ do remetente.",
    ],
    [
      "Se houver mais de uma NF para o mesmo pedido, use uma linha por NF. Mantenha os identificadores como texto.",
    ],
    ["Limite de 2.000 linhas e 4 MB por arquivo."],
  ]);
  return new Uint8Array(await book.xlsx.writeBuffer());
}
