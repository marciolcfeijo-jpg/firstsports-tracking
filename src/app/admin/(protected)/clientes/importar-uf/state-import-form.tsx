"use client";

import { useState, useTransition } from "react";
import { importCustomerStates } from "./actions";

const pageSize = 50;

export function StateImportForm() {
  const [file, setFile] = useState<File>();
  const [result, setResult] =
    useState<Awaited<ReturnType<typeof importCustomerStates>>>();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  function submit(confirmation?: string) {
    if (!file) return;
    const form = new FormData();
    form.set("arquivo", file);
    if (confirmation) form.set("confirmacao", confirmation);
    start(async () => {
      setStatus("");
      setPage(1);
      try {
        setResult(await importCustomerStates(form));
      } catch {
        setResult({
          error: "Não foi possível concluir. Consulte a prévia novamente.",
        });
      }
    });
  }

  const detail =
    result?.detail?.filter((row) => !status || row.status === status) ?? [];
  const pages = Math.max(1, Math.ceil(detail.length / pageSize));

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
            required
            disabled={pending}
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
          Clientes atualizados: {result.updated}. Clientes incluídos:{" "}
          {result.created}.
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
            {Boolean(result.summary["Novo cadastro"]) && (
              <p>
                Novos cadastros usam o nome provisório Cliente ERP seguido do
                código. A cidade fica em branco.
              </p>
            )}
            <button
              className="button"
              disabled={pending || !result.canApply}
              onClick={() => submit(result.confirmation)}
            >
              Aplicar atualizações e inclusões
            </button>
          </section>
          <label className="field">
            Situação
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
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
                  <th>Linha</th>
                  <th>Cliente ERP</th>
                  <th>UF atual</th>
                  <th>UF no arquivo</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {detail
                  .slice((page - 1) * pageSize, page * pageSize)
                  .map((row) => (
                    <tr key={row.line}>
                      <td>{row.line}</td>
                      <td>{row.code || "—"}</td>
                      <td>{row.previousState || "—"}</td>
                      <td>{row.state || "—"}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="actions">
              <button
                className="button secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </button>
              <span>
                Página {page} de {pages}
              </span>
              <button
                className="button secondary"
                disabled={page === pages}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
