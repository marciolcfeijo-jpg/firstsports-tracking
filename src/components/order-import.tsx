"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { orderSchema } from "@/lib/validation";

type ImportResult = {
  created: number;
  skipped: number;
  errors: { line: number; messages: string[] }[];
};

export function OrderImport() {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setResult(null);
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/orders", {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok && response.status !== 422) throw new Error(body.error);
      setResult(body);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Falha ao importar pedidos.",
      );
    } finally {
      setBusy(false);
    }
  }

  const csv = Object.keys(orderSchema.shape).join(";") + "\r\n";
  return (
    <section className="card">
      <p>
        Use uma planilha XLSX ou CSV de até 4 MB e 2.000 linhas. Formate o
        número do pedido e o CPF/CNPJ como texto para preservar zeros à
        esquerda.
      </p>
      <a
        href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
        download="modelo-pedidos.csv"
      >
        Baixar modelo CSV
      </a>
      <form method="post" className="mt-4" onSubmit={submit}>
        <label className="field">
          Planilha de pedidos
          <input type="file" name="file" accept=".xlsx,.csv" required />
        </label>
        <button className="button" disabled={busy}>
          {busy ? "Importando…" : "Importar planilha"}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="mt-4" role="status">
          {result.errors.length ? (
            <>
              <p>
                Nenhum pedido foi importado. Corrija as linhas abaixo e envie a
                planilha novamente.
              </p>
              <ul>
                {result.errors.map(({ line, messages }) => (
                  <li key={line}>
                    Linha {line} · {messages.join(" · ")}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              {result.created} pedidos cadastrados. {result.skipped} linhas
              duplicadas ou já cadastradas.{" "}
              <Link href="/admin/pedidos">Ver pedidos</Link>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
