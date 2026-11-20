"use client";

import { useState, type FormEvent } from "react";
import { dateOnly, statusLabels } from "@/lib/status";
import { orderLookupSchema } from "@/lib/validation";

type OrderResult = {
  number: string;
  status: string;
  shipments: {
    id: string;
    status: keyof typeof statusLabels;
    carrier: { name: string };
    invoices: { number: string }[];
    estimatedDelivery: string | null;
    deliveredAt: string | null;
  }[];
};

export function OrderLookup() {
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOrder(null);
    setError("");
    const data = orderLookupSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!data.success) {
      setError(data.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/tracking/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.data),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setOrder(body);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Falha na consulta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form
        method="post"
        className="card lookup-card"
        onSubmit={submit}
        onChange={() => {
          setOrder(null);
          setError("");
        }}
      >
        <label className="field">
          Número do pedido
          <input name="number" maxLength={120} disabled={busy} required />
        </label>
        <label className="field">
          CPF ou CNPJ do destinatário
          <input
            name="document"
            maxLength={25}
            inputMode="numeric"
            autoComplete="off"
            disabled={busy}
            required
          />
        </label>
        <button className="button" disabled={busy}>
          {busy ? "Consultando…" : "Consultar pedido"}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
      <div aria-live="polite">
        {order && (
          <section className="card mt-4">
            <h2>Pedido {order.number}</h2>
            <p>{order.status}</p>
            {order.shipments.length > 0 && (
              <>
                <h3>Remessas</h3>
                <ul>
                  {order.shipments.map((shipment) => (
                    <li className="mb-3" key={shipment.id}>
                      <strong>
                        {shipment.carrier.name} ·{" "}
                        {statusLabels[shipment.status]}
                      </strong>
                      <div>
                        NF{" "}
                        {shipment.invoices
                          .map(({ number }) => number)
                          .join(", ")}
                      </div>
                      {shipment.deliveredAt ? (
                        <div>Entrega em {dateOnly(shipment.deliveredAt)}</div>
                      ) : (
                        shipment.estimatedDelivery && (
                          <div>
                            Previsão de entrega{" "}
                            {dateOnly(shipment.estimatedDelivery)}
                          </div>
                        )
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
      </div>
    </>
  );
}
