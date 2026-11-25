"use client";

import { useState, type FormEvent } from "react";

export function CarrierCnpjForm({
  id,
  cnpj,
  editable,
}: {
  id: string;
  cnpj: string | null;
  editable: boolean;
}) {
  const formatted =
    cnpj?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") ??
    "";
  const [value, setValue] = useState(formatted);
  const [saved, setSaved] = useState(formatted);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();

  if (!editable)
    return <p>CNPJ para o ZenLOG · {formatted || "Não informado"}</p>;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/admin/carriers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, cnpj: value }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Não foi possível salvar o CNPJ.",
        );
      }
      const normalized = value
        .replace(/\D/g, "")
        .replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
      setValue(normalized);
      setSaved(normalized);
      setMessage({ text: "CNPJ salvo." });
    } catch (error) {
      setMessage({
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o CNPJ.",
        error: true,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mb-4" onSubmit={save}>
      <label className="field">
        CNPJ para o ZenLOG
        <input
          value={value}
          disabled={pending}
          maxLength={18}
          inputMode="numeric"
          onChange={(event) => {
            setValue(event.target.value);
            setMessage(undefined);
          }}
          aria-describedby={id + "-cnpj-help"}
        />
        <small id={id + "-cnpj-help"}>
          Use o CNPJ que o ZenLOG informa para esta transportadora.
        </small>
      </label>
      <button
        className="button secondary"
        disabled={pending || value.trim() === saved}
      >
        {pending ? "Salvando…" : "Salvar CNPJ"}
      </button>
      {message && (
        <p role={message.error ? "alert" : "status"}>{message.text}</p>
      )}
    </form>
  );
}
