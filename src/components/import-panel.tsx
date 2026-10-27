"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
type Batch = {
  id: string;
  status: string;
  filename: string;
  rows: {
    line: number;
    data: Record<string, unknown>;
    errors: string[];
    result: string;
  }[];
};
export function ImportPanel({
  canWrite,
  carriers,
  initialBatch,
}: {
  canWrite: boolean;
  carriers: { code: string; name: string }[];
  initialBatch?: Batch | null;
}) {
  const [batch, setBatch] = useState<Batch | null>(initialBatch || null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  async function preview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBatch(null);
    setBusy(true);
    try {
      const r = await fetch("/api/admin/imports", {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setBatch(b);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível ler o arquivo",
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!batch) return;
    setBusy(true);
    setError("");
    try {
      let completed = false;
      while (!completed) {
        const r = await fetch("/api/admin/imports/" + batch.id, {
          method: "POST",
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        completed = data.completed;
      }
      const result = await fetch("/api/admin/imports/" + batch.id);
      setBatch(await result.json());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na importação");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="card">
        <div className="page-heading">
          <div>
            <h2>Importar pedidos</h2>
            <p>Pré-validação → conferência → confirmação</p>
          </div>
          <a
            href="/api/admin/imports/template"
            download
            className="button secondary"
          >
            Baixar modelo Excel
          </a>
        </div>
        <p className="small">
          Arquivos XLSX ou CSV, até 5 MB e 2.000 registros. Linhas vazias e
          células apenas formatadas não entram na contagem. Preencha os
          identificadores como texto. A reimportação da mesma nota fiscal não
          cria outra remessa.
        </p>
        {canWrite && (
          <form
            onSubmit={preview}
            onChange={() => {
              setBatch(null);
              setError("");
            }}
          >
            <div className="field">
              <label htmlFor="import-carrier">
                Transportadora destas notas fiscais
              </label>
              <select
                id="import-carrier"
                name="carrier"
                required
                defaultValue=""
                disabled={busy}
              >
                <option value="" disabled>
                  Selecione a transportadora do lote
                </option>
                {carriers.map((carrier) => (
                  <option key={carrier.code} value={carrier.code}>
                    {carrier.name}
                  </option>
                ))}
                <option value="__FILE__">
                  Usar a transportadora de cada linha da planilha
                </option>
              </select>
            </div>
            <p className="small">
              A transportadora selecionada será aplicada a todas as linhas,
              substituindo o valor da coluna transportadora. Nesse modo, a
              coluna pode ficar vazia ou ser removida. Para arquivos com
              transportadoras diferentes, escolha usar a transportadora de cada
              linha.
            </p>
            <div className="file-drop">
              <label className="field !mb-0">
                Selecione sua planilha
                <input
                  disabled={busy}
                  name="file"
                  type="file"
                  accept=".xlsx,.csv"
                  required
                />
              </label>
            </div>
            <button disabled={busy} className="button spaced">
              {busy ? "Processando…" : "Validar e visualizar"}
            </button>
          </form>
        )}
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
      </div>
      {batch && (
        <section className="spaced">
          <div className="page-heading">
            <div>
              <h2>
                {batch.status === "COMPLETED"
                  ? "Relatório de importação"
                  : "Prévia dos dados"}
              </h2>
              <p>
                {batch.filename} · {batch.rows.length} linhas ·{" "}
                {batch.rows.filter((r) => r.errors.length > 0).length} com erros
              </p>
            </div>
            {canWrite && batch.status !== "COMPLETED" && (
              <button
                className="button"
                disabled={busy || !batch.rows.some((r) => !r.errors.length)}
                onClick={confirm}
              >
                {busy ? "Importando…" : "Confirmar registros válidos"}
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Pedido</th>
                  <th>Nota</th>
                  <th>Transportadora</th>
                  <th>Resultado / erros</th>
                </tr>
              </thead>
              <tbody>
                {batch.rows.map((row) => (
                  <tr key={row.line}>
                    <td>{row.line}</td>
                    <td>{String(row.data.numero_pedido || "—")}</td>
                    <td>{String(row.data.numero_nf || "—")}</td>
                    <td>
                      {carriers.find((c) => c.code === row.data.transportadora)
                        ?.name || String(row.data.transportadora || "—")}
                    </td>
                    <td className="!whitespace-normal">
                      {row.errors.length
                        ? row.errors.join("; ")
                        : row.result === "PENDING"
                          ? "Válida"
                          : row.result}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {batch.status === "COMPLETED" && (
            <div className="success spaced">
              Importação concluída. Importadas:{" "}
              {batch.rows.filter((r) => r.result === "IMPORTED").length}; já
              existentes:{" "}
              {batch.rows.filter((r) => r.result === "DUPLICATE").length};
              inválidas/erro:{" "}
              {
                batch.rows.filter((r) =>
                  ["INVALID", "ERROR"].includes(r.result),
                ).length
              }
              .
            </div>
          )}
        </section>
      )}
    </>
  );
}
