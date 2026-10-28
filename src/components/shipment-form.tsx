"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { shipmentSchema } from "@/lib/validation";
import { z } from "zod";
import { useState } from "react";
import { useRouter } from "next/navigation";
const labels: Record<string, string> = {
  numero_pedido: "Número do pedido",
  numero_nf: "Número da NF",
  serie_nf: "Série da NF",
  cnpj_remetente: "CNPJ do remetente",
  cnpj_tomador: "CNPJ do tomador (opcional)",
  cpf_cnpj_destinatario: "CPF/CNPJ do destinatário",
  nome_cliente: "Nome do cliente",
  email_cliente: "E-mail do cliente (opcional)",
  transportadora: "Transportadora",
  data_emissao: "Data de emissão",
  codigo_rastreio: "Código do objeto Correios (13 caracteres)",
  numero_cte: "Número do CT-e (opcional)",
  cidade_destino: "Cidade de destino",
  uf_destino: "UF de destino",
};
type Input = z.input<typeof shipmentSchema>;
export function ShipmentForm({
  carriers,
  sellers = [],
}: {
  carriers: { code: string; name: string }[];
  sellers?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Input>({
    resolver: zodResolver(shipmentSchema),
    defaultValues: { serie_nf: "1", transportadora: carriers[0]?.code || "" },
  });
  async function submit(data: Input) {
    setError("");
    try {
      const r = await fetch("/api/admin/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      if (body.duplicate)
        setError("A nota já foi cadastrada. Abrindo a remessa existente.");
      router.push("/admin/remessas/" + body.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }
  return (
    <form onSubmit={handleSubmit(submit)} className="card" noValidate>
      <div className="grid-2">
        <label className="field">
          Vendedor / representante (opcional)
          <select {...register("vendedor_id")}>
            <option value="">Sem vendedor</option>
            {sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </select>
          <span className="text-red-700">{errors.vendedor_id?.message}</span>
        </label>
        {Object.entries(labels).map(([key, label]) => (
          <label className="field" key={key}>
            {label}
            {key === "transportadora" ? (
              <select {...register("transportadora")}>
                {carriers.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                {...register(key as keyof Input)}
                type={
                  key === "data_emissao"
                    ? "date"
                    : key === "email_cliente"
                      ? "email"
                      : "text"
                }
                maxLength={
                  key === "uf_destino"
                    ? 2
                    : key === "codigo_rastreio"
                      ? 13
                      : 254
                }
              />
            )}
            <span className="text-red-700">
              {errors[key as keyof Input]?.message}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <button disabled={isSubmitting} className="button">
        {isSubmitting ? "Salvando…" : "Cadastrar remessa"}
      </button>
    </form>
  );
}
