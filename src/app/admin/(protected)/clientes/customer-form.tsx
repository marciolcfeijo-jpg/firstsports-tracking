"use client";

import { useActionState } from "react";
import { shipmentSchema } from "@/lib/validation";
import { saveCustomer } from "./actions";

type Customer = {
  id: string;
  name: string;
  city: string;
  state: string;
  erpCode: string | null;
  zenlogRecipientId: number | null;
  responsibleId: string | null;
};

export function CustomerForm({
  customer,
  sellers,
}: {
  customer?: Customer;
  sellers: { id: string; email: string; erpSellerCode: string | null }[];
}) {
  const [result, action, pending] = useActionState(saveCustomer, null);
  const unavailable =
    customer?.responsibleId &&
    !sellers.some(({ id }) => id === customer.responsibleId);
  return (
    <form id="cadastro" action={action} className="card mb-4">
      <h2>{customer ? "Editar cliente" : "Cadastrar cliente"}</h2>
      <input type="hidden" name="id" value={customer?.id ?? ""} />
      <fieldset className="grid-2 mt-3" disabled={pending}>
        <label className="field">
          Nome do cliente
          <input
            name="name"
            defaultValue={customer?.name}
            maxLength={120}
            required
          />
        </label>
        {!customer && (
          <label className="field">
            CPF/CNPJ
            <input
              name="document"
              inputMode="numeric"
              maxLength={18}
              required
            />
          </label>
        )}
        <label className="field">
          Código do cliente no ERP
          <input
            name="erpCode"
            defaultValue={customer?.erpCode ?? ""}
            maxLength={60}
          />
        </label>
        <label className="field">
          ID do destinatário no ZenLOG
          <input
            name="zenlogRecipientId"
            defaultValue={customer?.zenlogRecipientId ?? ""}
            inputMode="numeric"
            maxLength={10}
          />
        </label>
        <label className="field">
          Cidade de destino
          <input
            name="city"
            defaultValue={customer?.city ?? ""}
            maxLength={120}
          />
        </label>
        <label className="field">
          UF de destino
          <select name="state" defaultValue={customer?.state ?? ""}>
            <option value="">Não informada</option>
            {customer?.state &&
              !shipmentSchema.shape.uf_destino.safeParse(customer.state)
                .success && (
                <option value={customer.state}>
                  {customer.state} · revisar
                </option>
              )}
            {shipmentSchema.shape.uf_destino.options.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Vendedor ou representante
          <select
            name="responsibleId"
            defaultValue={customer?.responsibleId ?? ""}
          >
            <option value="">Sem responsável</option>
            {unavailable && (
              <option value={customer.responsibleId!}>
                Responsável indisponível
              </option>
            )}
            {sellers.map(({ id, email, erpSellerCode }) => (
              <option value={id} key={id}>
                {email}
                {erpSellerCode ? " · " + erpSellerCode : ""}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <button className="button" disabled={pending}>
        {pending ? "Salvando…" : "Salvar cliente"}
      </button>
      {result && (
        <p
          className={result.error ? "error mt-3" : "success mt-3"}
          role={result.error ? "alert" : "status"}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}
