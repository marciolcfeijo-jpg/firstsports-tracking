"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { OrderStage } from "@prisma/client";
import { orderStageLabels, orderTransitions } from "@/lib/order-status";

export function OrderForm({
  order,
  canCancel = true,
}: {
  order: { id: string; stage: OrderStage | null };
  canCancel?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const transitions = order.stage
    ? orderTransitions[order.stage].filter(
        (stage) => canCancel || stage !== "CANCELLED",
      )
    : ["RECEIVED" as const];
  if (!transitions.length) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const stage = new FormData(event.currentTarget).get("stage");
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, from: order.stage, stage }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Falha ao atualizar a etapa.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form method="post" className="card" onSubmit={submit}>
      <h2>Etapa do pedido</h2>
      <label className="field">
        Nova etapa
        <select name="stage" required defaultValue="" disabled={busy}>
          <option value="" disabled>
            Selecione
          </option>
          {transitions.map((stage) => (
            <option value={stage} key={stage}>
              {orderStageLabels[stage]}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        {busy ? "Salvando…" : "Atualizar status do pedido"}
      </button>
    </form>
  );
}
