"use client";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { orderLookupSchema, trackingLookupSchema } from "@/lib/validation";
import { Search, LockKeyhole, ArrowRight, PackageSearch } from "lucide-react";
import {
  LookupResults,
  OrderLookupResult,
  type LookupRow,
  type OrderResult,
} from "./lookup-results";
const schema = z.discriminatedUnion("mode", [
  trackingLookupSchema.extend({ mode: z.literal("invoice") }),
  orderLookupSchema.extend({ mode: z.literal("order") }),
]);
type LookupData = z.infer<typeof schema>;
type LookupResult =
  | { mode: "invoice"; links: LookupRow[] }
  | { mode: "order"; order: OrderResult };

export function LookupForm({
  initialMode = "invoice",
}: {
  initialMode?: LookupData["mode"];
}) {
  const [error, setError] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
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
    control,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<LookupData>({
    resolver: zodResolver(schema),
    defaultValues: { mode: initialMode, number: "", document: "" },
  });
  const mode = useWatch({ control, name: "mode" });
  const byOrder = mode === "order";
  async function submit({ mode, ...data }: LookupData) {
    setError("");
    setResult(null);
    try {
      const response = await fetch(
        mode === "order" ? "/api/tracking/order" : "/api/tracking/lookup",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setResult(
        mode === "order" ? { mode, order: body } : { mode, links: body.links },
      );
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
            Buscar por
            <select
              {...register("mode", { onChange: () => resetField("number") })}
              disabled={isSubmitting}
            >
              <option value="invoice">Nota fiscal</option>
              <option value="order">Pedido</option>
            </select>
          </label>
          <label className="field">
            {byOrder ? "Número do pedido" : "Número da nota fiscal"}
            <input
              {...register("number")}
              placeholder={byOrder ? "Ex.: PED-33541" : "Ex.: 33541"}
              inputMode={byOrder ? "text" : "numeric"}
              maxLength={byOrder ? 120 : 12}
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
      {result?.mode === "invoice" && <LookupResults rows={result.links} />}
      {result?.mode === "order" && <OrderLookupResult order={result.order} />}
    </>
  );
}
