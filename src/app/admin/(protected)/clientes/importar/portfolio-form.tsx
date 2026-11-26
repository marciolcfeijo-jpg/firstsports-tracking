"use client";

import { useState, useTransition } from "react";
import { importPortfolio } from "./actions";

export function PortfolioForm() {
  const [file, setFile] = useState<File>();
  const [result, setResult] =
    useState<Awaited<ReturnType<typeof importPortfolio>>>();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState("");

  function submit(confirmation?: string) {
    if (!file) return;
    const form = new FormData();
    form.set("arquivo", file);
    if (confirmation) form.set("confirmacao", confirmation);
    start(async () => {
      setStatus("");
      try {
        setResult(await importPortfolio(form));
      } catch {
        setResult({
          error: "Não foi possível concluir. Consulte a prévia novamente.",
        });
      }
    });
  }

  const detail =
    result?.detail?.filter((row) => !status || row.status === status) ?? [];
  return (
    <>
      <form
        className="card mb-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="field">
          Lista de clientes (.txt ou .tsv)
          <input
            type="file"
            accept=".txt,.tsv,text/plain"
            disabled={pending}
            required
            onChange={(event) => {
              setFile(event.target.files?.[0]);
              setResult(undefined);
            }}
          />
        </label>
        <button className="button" disabled={pending || !file}>
          {pending ? "Processando…" : "Consultar prévia"}
        </button>
      </form>
      {result?.error && (
        <p className="error" role="alert">
          {result.error}
        </p>
      )}
      {result?.updated !== undefined && (
        <p className="success" role="status">
          {result.updated} cliente(s) atualizado(s).
        </p>
      )}
      {result?.summary && (
        <>
          <section className="card mb-4">
            <h2>Resultado da prévia</h2>
            <ul>
              {Object.entries(result.summary).map(([label, count]) => (
                <li key={label}>
                  {label} · {count}
                </li>
              ))}
            </ul>
            <button
              className="button"
              disabled={pending || !result.summary["Pronto para atualizar"]}
              onClick={() => submit(result.confirmation)}
            >
              Aplicar vínculos disponíveis
            </button>
          </section>
          <label className="field">
            Situação
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">Todas as situações</option>
              {Object.keys(result.summary).map((label) => (
                <option key={label}>{label}</option>
              ))}
            </select>
          </label>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente ERP</th>
                  <th>Código do vendedor</th>
                  <th>E-mail de acesso</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {detail.map((row, index) => (
                  <tr key={index}>
                    <td>{row.code || "—"}</td>
                    <td>{row.sellerCode || "—"}</td>
                    <td>{row.email ?? "—"}</td>
                    <td>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
