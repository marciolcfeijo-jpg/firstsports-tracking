"use client";

import Link from "next/link";
import { useActionState } from "react";
import { linkZenlogInvoice } from "./actions";

export function LinkInvoiceForm({
  orderId,
  invoiceHash,
  invoiceNumber,
  pendingLink,
}: {
  orderId: string;
  invoiceHash: string;
  invoiceNumber: string;
  pendingLink: boolean;
}) {
  const [result, action, pending] = useActionState(linkZenlogInvoice, null);
  if (!pendingLink && !result && !pending) return null;
  return (
    <form action={action} className="actions mt-2 mb-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="invoiceHash" value={invoiceHash} />
      <input type="hidden" name="invoiceNumber" value={invoiceNumber} />
      {pendingLink && (!result || result.error) && (
        <button
          className="button secondary"
          type="submit"
          disabled={pending}
          aria-label={`Vincular NF ${invoiceNumber}`}
        >
          {pending ? "Vinculando…" : "Vincular NF"}
        </button>
      )}
      {result && (
        <span role={result.error ? "alert" : "status"}>{result.message}</span>
      )}
      {result && !result.error && (
        <Link href={`/admin/pedidos/${orderId}#notas-fiscais`}>
          Ver NF no pedido
        </Link>
      )}
    </form>
  );
}
