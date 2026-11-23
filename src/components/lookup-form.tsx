"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trackingLookupSchema } from "@/lib/validation";
import { Search, LockKeyhole, ArrowRight, PackageSearch } from "lucide-react";
import { LookupResults, type LookupRow } from "./lookup-results";

type LookupData = z.infer<typeof trackingLookupSchema>;

export function LookupForm() {
  const [error, setError] = useState("");
  const [result, setResult] = useState<LookupRow[] | null>(null);
  useEffect(() => {
    if (result) {
      const heading = document.getElementById("lookup-results-heading");
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: "start", behavior: "auto" });
    }
  }, [result]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LookupData>({
    resolver: zodResolver(trackingLookupSchema),
    defaultValues: { number: "", document: "" },
  });
  async function submit(data: LookupData) {
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/tracking/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setResult(body.links);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha na consulta. Tente novamente.",
      );
    }
  }
  return (
    <>
      <div className="card lookup-card">
        <div className="icon-box">
          <PackageSearch size={23} />
        </div>
        <h2 className="!text-xl !mb-1">Encontre sua encomenda</h2>
        <p className="small !mb-6">
          Informe os dados abaixo para acompanhar a entrega.
        </p>
        <form
          method="post"
          onSubmit={handleSubmit(submit)}
          onChange={() => {
            setResult(null);
            setError("");
          }}
          noValidate
        >
          <label className="field">
            Número da nota fiscal
            <input
              {...register("number")}
              placeholder="Ex.: 33541"
              inputMode="numeric"
              maxLength={12}
              disabled={isSubmitting}
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
              maxLength={25}
              disabled={isSubmitting}
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
            <LockKeyhole size={12} /> Seus dados são usados apenas para validar
            a consulta.
          </p>
        </form>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </div>
      {result && <LookupResults rows={result} />}
    </>
  );
}
