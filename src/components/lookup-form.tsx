"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { validDocument } from "@/lib/validation";
import { Search, LockKeyhole, ArrowRight, PackageSearch } from "lucide-react";
import Link from "next/link";
const schema = z.object({
  number: z
    .string()
    .trim()
    .min(1, "Informe o pedido ou a nota fiscal")
    .max(120),
  document: z.string().refine(validDocument, "Informe um CPF ou CNPJ válido"),
});
export function LookupForm() {
  const [error, setError] = useState("");
  const [links, setLinks] = useState<{ url: string }[]>([]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  async function submit(data: z.infer<typeof schema>) {
    setError("");
    setLinks([]);
    try {
      const response = await fetch("/api/tracking/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setLinks(body.links);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha na consulta. Tente novamente.",
      );
    }
  }
  return (
    <div className="card lookup-card">
      <div className="icon-box">
        <PackageSearch size={23} />
      </div>
      <h2 className="!text-xl !mb-1">Encontre sua encomenda</h2>
      <p className="small !mb-6">
        Informe os dados abaixo para acompanhar a entrega.
      </p>
      <form onSubmit={handleSubmit(submit)} noValidate>
        <label className="field">
          Número do pedido ou nota fiscal
          <input
            {...register("number")}
            placeholder="Ex.: número recebido na compra"
            autoComplete="off"
            aria-invalid={!!errors.number}
          />
          {errors.number && (
            <span className="text-red-700">{errors.number.message}</span>
          )}
        </label>
        <label className="field">
          CPF ou CNPJ do destinatário
          <input
            {...register("document")}
            placeholder="Somente os números do documento"
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={!!errors.document}
          />
          {errors.document && (
            <span className="text-red-700">{errors.document.message}</span>
          )}
        </label>
        <button className="button full" disabled={isSubmitting}>
          <Search size={17} />
          {isSubmitting ? "CONSULTANDO…" : "RASTREAR ENTREGA"}
          <ArrowRight size={17} className="ml-auto" />
        </button>
        <p className="secure-note">
          <LockKeyhole size={12} /> Seus dados são usados apenas para validar a
          consulta.
        </p>
      </form>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {links.length > 0 && (
        <div className="link-list" role="status">
          <strong>{links.length} remessa(s) encontrada(s)</strong>
          {links.map((l, i) => (
            <Link key={l.url} href={l.url}>
              Acompanhar remessa {i + 1} →
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
