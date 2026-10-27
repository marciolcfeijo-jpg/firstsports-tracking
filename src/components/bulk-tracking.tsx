"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { BulkSummary } from "@/lib/bulk-sync";
const endpoint = "/api/admin/shipments/sync-pending";
export function BulkTracking() {
  const [summary, setSummary] = useState<BulkSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const stop = useRef(false),
    mounted = useRef(true),
    working = useRef(false);
  const router = useRouter();
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    async function read() {
      if (working.current) return;
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok && mounted.current) setSummary(await response.json());
      } catch {
        /* A failed status refresh never starts carrier calls. */
      }
    }
    void read();
    const timer = setInterval(() => void read(), 10000);
    return () => {
      mounted.current = false;
      stop.current = true;
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  async function send(body: unknown): Promise<BulkSummary> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Não foi possível atualizar as remessas.");
    return data;
  }
  async function update() {
    if (working.current) return;
    working.current = true;
    stop.current = false;
    setRunning(true);
    setStopping(false);
    setError("");
    try {
      let current = await send({ action: "start" });
      if (mounted.current) setSummary(current);
      while (!stop.current && current.status !== "DONE") {
        current = await send({ action: "next", runId: current.runId });
        if (mounted.current) setSummary(current);
        if (current.status === "PAUSED") break;
        if (current.status !== "DONE" && !stop.current)
          await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (stop.current && current.status !== "DONE") {
        current = await send({ action: "pause", runId: current.runId });
        if (mounted.current) setSummary(current);
      }
      if (mounted.current) router.refresh();
    } catch (e) {
      if (mounted.current) {
        setError(
          e instanceof Error
            ? e.message
            : "Falha na atualização. Você pode retomar o lote.",
        );
        router.refresh();
      }
    } finally {
      working.current = false;
      if (mounted.current) {
        setRunning(false);
        setStopping(false);
      }
    }
  }
  return (
    <section className="card !mb-6" aria-labelledby="bulk-tracking-title">
      <h3 id="bulk-tracking-title">Atualização de rastreamento em massa</h3>
      <p className="small">
        Consulta todas as remessas abertas com checagem vencida e transportadora
        habilitada, independentemente dos filtros abaixo. Respeita os intervalos
        de nova tentativa e os bloqueios de consultas em andamento.
      </p>
      <div className="actions">
        <button
          className="button"
          disabled={running || !!summary?.busy}
          onClick={update}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {running
            ? "Atualizando remessas…"
            : summary && summary.status !== "DONE"
              ? "Retomar atualização de pendentes"
              : "Atualizar pendentes em massa"}
        </button>
        {running && (
          <button
            className="button secondary"
            disabled={stopping}
            onClick={() => {
              stop.current = true;
              setStopping(true);
            }}
          >
            {stopping ? "Parando após este lote…" : "Parar após este lote"}
          </button>
        )}
      </div>
      {summary && (
        <div role="status" aria-live="polite" className="small spaced">
          <p className="!mb-1">
            {summary.status === "DONE"
              ? "Atualização encerrada."
              : summary.status === "PAUSED"
                ? "Atualização pausada; retome para continuar."
                : "Lote em andamento."}{" "}
            Consultadas: {summary.processed} de {summary.total} inicialmente
            pendentes. Sucessos: {summary.succeeded}. Falhas: {summary.failed}.
          </p>
          {summary.status === "DONE" && summary.total === 0 && (
            <p className="!mb-1">
              Nenhuma remessa pendente de checagem neste momento.
            </p>
          )}
          {summary.remaining > 0 && (
            <p className="!mb-1">
              Ainda pendentes deste lote: {summary.remaining}.{" "}
              {summary.eligible === 0
                ? "As consultas restantes foram suspensas por falha na transportadora; confira os motivos abaixo antes de iniciar outro lote."
                : "Consultas em andamento em outra tela ou processo são respeitadas."}
            </p>
          )}
          {Object.entries(summary.errors).map(([carrier, code]) => (
            <p className="!mb-1" key={carrier}>
              Consultas suspensas neste lote: {carrier} · {code}.
            </p>
          ))}
        </div>
      )}
      {running && (
        <p className="small !mt-3 !mb-0">
          Mantenha esta página aberta. A parada aguarda o lote atual; os dados
          já recebidos ficam salvos.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
