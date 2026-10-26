import { z } from "zod";
export const digits = (s: string) => s.replace(/\D/g, "");
export function validDocument(input: string) {
  const s = digits(input);
  if (!/^\d{11}$|^\d{14}$/.test(s) || /^(\d)\1+$/.test(s)) return false;
  const check = (base: string, weights: number[]) => {
    const mod =
      [...base].reduce((v, n, i) => v + Number(n) * weights[i], 0) % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  if (s.length === 11)
    return (
      check(s.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]) === +s[9] &&
      check(s.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === +s[10]
    );
  return (
    check(s.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === +s[12] &&
    check(s.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === +s[13]
  );
}
const doc = z
  .string()
  .transform(digits)
  .refine(validDocument, "CPF/CNPJ inválido");
const text = z.string().trim().min(1, "Campo obrigatório").max(120);
export const columns = [
  "numero_pedido",
  "numero_nf",
  "serie_nf",
  "cnpj_remetente",
  "cnpj_tomador",
  "cpf_cnpj_destinatario",
  "nome_cliente",
  "email_cliente",
  "transportadora",
  "data_emissao",
  "numero_cte",
  "cidade_destino",
  "uf_destino",
] as const;
export const shipmentSchema = z.object({
  numero_pedido: text,
  numero_nf: z.string().regex(/^\d{1,12}$/, "NF deve ser texto numérico"),
  serie_nf: z.string().regex(/^\d{1,3}$/, "Série inválida"),
  cnpj_remetente: doc.refine((v) => v.length === 14, "Informe um CNPJ"),
  cnpj_tomador: z
    .union([doc.refine((v) => v.length === 14), z.literal("")])
    .optional(),
  cpf_cnpj_destinatario: doc,
  nome_cliente: text,
  email_cliente: z.union([z.email(), z.literal("")]).optional(),
  transportadora: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,31}$/, "Código de transportadora inválido"),
  data_emissao: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use AAAA-MM-DD")
    .refine(
      (s) =>
        !Number.isNaN(Date.parse(s)) &&
        new Date(s).toISOString().slice(0, 10) === s,
      "Data inválida",
    ),
  numero_cte: z.string().max(60).optional(),
  cidade_destino: text,
  uf_destino: z.enum([
    "AC",
    "AL",
    "AP",
    "AM",
    "BA",
    "CE",
    "DF",
    "ES",
    "GO",
    "MA",
    "MT",
    "MS",
    "MG",
    "PA",
    "PB",
    "PR",
    "PE",
    "PI",
    "RJ",
    "RN",
    "RS",
    "RO",
    "RR",
    "SC",
    "SP",
    "SE",
    "TO",
  ]),
});
export type ShipmentInput = z.infer<typeof shipmentSchema>;
export const fiscalKey = (
  s: Pick<ShipmentInput, "cnpj_remetente" | "serie_nf" | "numero_nf">,
) =>
  [
    digits(s.cnpj_remetente),
    String(Number(s.serie_nf)),
    String(Number(s.numero_nf)),
  ].join(":");
