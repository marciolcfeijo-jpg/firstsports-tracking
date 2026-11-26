"use client";

import Link from "next/link";
import { useActionState } from "react";
import { linkZenlogInvoice } from "./actions";

export function LinkInvoiceForm({
  orderId,
  orderNumber,
  recipientRef,
  invoiceHash,
  invoiceNumber,
  pendingLink,
}: {
  orderId?: string;
  orderNumber: string;
  recipientRef: string;
  invoiceHash: string;
  invoiceNumber: string;
  pendingLink: boolean;
}) {
  const [result, action, pending] = useActionState(linkZenlogInvoice, null);
  if (!pendingLink && !result && !pending) return null;
  return (
    <form action={action} className="actions mt-2 mb-2">
      <input type="hidden" name="orderId" value={orderId ?? ""} />
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <input type="hidden" name="recipientRef" value={recipientRef} />
      <input type="hidden" name="invoiceHash" value={invoiceHash} />
      <input type="hidden" name="invoiceNumber" value={invoiceNumber} />
      {pendingLink && (!result || result.error) && (
        <button
          className="button secondary"
          type="submit"
          disabled={pending}
          aria-label={`${orderId ? "Vincular NF" : "Importar pedido e vincular NF"} ${invoiceNumber}`}
        >
          {pending
            ? "Vinculando…"
            : orderId
              ? "Vincular NF"
              : "Importar e vincular NF"}
        </button>
      )}
      {result && (
        <span role={result.error ? "alert" : "status"}>{result.message}</span>
      )}
      {result && !result.error && result.orderId && (
        <Link href={`/admin/pedidos/${result.orderId}#notas-fiscais`}>
          Ver NF no pedido
        </Link>
      )}
    </form>
  );
}
