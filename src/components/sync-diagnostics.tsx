"use client";
import { useState } from "react";
import { dateTime } from "@/lib/status";
import type { SyncDiagnostic } from "@/lib/sync-diagnostic-data";
type Entry = { id: string; createdAt: string; diagnostic: SyncDiagnostic };
export function SyncDiagnostics({ entries }: { entries: Entry[] }) {
  const [message, setMessage] = useState("");
  return (
    <section className="card spaced">
      <h3>Diagnósticos técnicos das consultas</h3>
      <p className="small">
        Os registros mostram a etapa da falha e os campos incompatíveis, sem
        valores da remessa ou credenciais.
      </p>
      {!entries.length && (
        <p className="small">
          Faça uma nova tentativa de atualização para gerar um diagnóstico se
          houver falha.
        </p>
      )}
      {entries.map((entry) => (
        <details key={entry.id} className="small spaced">
          <summary>
            {dateTime(entry.createdAt)} · {entry.diagnostic.code} ·{" "}
            {entry.diagnostic.phase}
          </summary>
          <pre className="overflow-auto !my-3">
            {JSON.stringify(
              { createdAt: entry.createdAt, ...entry.diagnostic },
              null,
              2,
            )}
          </pre>
          <button
            className="button secondary"
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  JSON.stringify(
                    { createdAt: entry.createdAt, ...entry.diagnostic },
                    null,
                    2,
                  ),
                );
                setMessage("Diagnóstico copiado.");
              } catch {
                setMessage(
                  "Selecione o texto do diagnóstico e copie manualmente.",
                );
              }
            }}
          >
            Copiar diagnóstico
          </button>
        </details>
      ))}
      <p role="status" className="small">
        {message}
      </p>
    </section>
  );
}
