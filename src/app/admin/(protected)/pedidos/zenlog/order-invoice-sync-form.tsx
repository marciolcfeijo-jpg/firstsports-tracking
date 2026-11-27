"use client";

import { useActionState } from "react";
import { syncOrderInvoices } from "./actions";

export function OrderInvoiceSyncForm({
  orderId,
  hasInvoices,
}: {
  orderId: string;
  hasInvoices: boolean;
}) {
  const [result, action, pending] = useActionState(syncOrderInvoices, null);

  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="orderId" value={orderId} />
      <button type="submit" className="button secondary" disabled={pending}>
        {pending
          ? "Consultando ZenLOG…"
          : hasInvoices
            ? "Consultar novas NFs"
            : "Consultar e vincular NFs"}
      </button>
      {result && !pending && (
        <small
          className="order-row-detail"
          role={result.error ? "alert" : "status"}
        >
          {result.message}
        </small>
      )}
    </form>
  );
}
