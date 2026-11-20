"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function OrderShipmentSync({
  shipmentId,
  enabled,
}: {
  shipmentId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function sync() {
    setSending(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/admin/shipments/${shipmentId}/sync`, {
        method: "POST",
      });
      startTransition(() => router.refresh());
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          (result.error ||
            result.code ||
            "Não foi possível atualizar o rastreamento.") +
            (result.requestId ? ` Referência: ${result.requestId}` : ""),
        );
      }
      setMessage("Rastreamento atualizado com os dados da transportadora.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Falha na atualização.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <button
        className="button"
        type="button"
        onClick={sync}
        disabled={sending || refreshing || !enabled}
      >
        {sending || refreshing ? "Atualizando…" : "Atualizar status da NF"}
      </button>
      {!enabled && (
        <p className="small mt-2">
          As consultas dessa transportadora estão desabilitadas.
        </p>
      )}
      {message && (
        <p className="small mt-2" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error mt-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
