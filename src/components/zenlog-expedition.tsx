"use client";

import { useState } from "react";

type Event = {
  codigoevento: string;
  status: "A" | "E" | "S";
  inicio?: string | null;
  fim?: string | null;
  sequencia?: number;
};
const labels = { A: "Alerta", E: "Erro", S: "Sucesso" };

export function ZenlogExpedition({ orderId }: { orderId: string }) {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function consult() {
    setBusy(true);
    setError("");
    setEvents(null);
    try {
      const response = await fetch(
        `/api/admin/zenlog/${encodeURIComponent(orderId)}`,
        { method: "POST" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setEvents(body.events);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível consultar a expedição.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mt-4">
      <h2>Expedição no ZenLOG</h2>
      <p>Eventos de processamento do operador logístico.</p>
      <button
        className="button secondary mt-3"
        type="button"
        disabled={busy}
        onClick={consult}
      >
        {busy ? "Consultando…" : "Consultar ZenLOG"}
      </button>
      {error && (
        <p className="error mt-3" role="alert">
          {error}
        </p>
      )}
      {events && (
        <div className="mt-3" role="status">
          {events.length ? (
            <ul>
              {events.map((event, index) => (
                <li key={index}>
                  {event.codigoevento} · {labels[event.status]}
                  {event.fim || event.inicio
                    ? ` · ${event.fim || event.inicio}`
                    : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhum evento de expedição retornado para este pedido.</p>
          )}
        </div>
      )}
    </section>
  );
}
