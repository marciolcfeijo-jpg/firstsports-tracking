"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { Role } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { userRoleLabels } from "@/lib/user-roles";

type LinkedUser = {
  id: string;
  email: string;
  role: Role;
  active: boolean;
  erpSellerCode?: string | null;
};

export function UserForm({ user }: { user?: LinkedUser }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const permissions = {
      role: form.get("role"),
      active: form.get("active") === "on",
      erpSellerCode: form.get("erpSellerCode"),
    };
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: user ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          user
            ? {
                id: user.id,
                newId: form.get("id"),
                previous: { role: user.role, active: user.active },
                ...permissions,
              }
            : { id: form.get("id"), email: form.get("email"), ...permissions },
        ),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage("Permissões salvas.");
      startTransition(() => {
        if (user && body.id !== user.id)
          router.replace(
            `/admin/usuarios?editar=${encodeURIComponent(body.id)}#permissoes`,
          );
        else router.refresh();
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || refreshing;
  return (
    <form
      id="permissoes"
      className="card spaced"
      method="post"
      onSubmit={submit}
    >
      <h2>{user ? "Editar permissões" : "Vincular usuário Supabase"}</h2>
      {user ? (
        <p>{user.email}</p>
      ) : (
        <p className="small">
          Crie e verifique o usuário no Supabase Auth antes de conceder acesso
          aqui.
        </p>
      )}
      <fieldset className="grid-2 mt-3" disabled={busy}>
        <label className="field">
          UUID do usuário
          <input
            name="id"
            required
            defaultValue={user?.id}
            autoComplete="off"
          />
          {user && (
            <span className="small">
              Para trocar, copie o UUID da conta com este mesmo e-mail no
              Supabase Auth.
            </span>
          )}
        </label>
        {!user && (
          <label className="field">
            E-mail
            <input name="email" type="email" required />
          </label>
        )}
        <label className="field">
          Papel
          <select name="role" defaultValue={user?.role ?? "VIEWER"}>
            {Object.entries(userRoleLabels).map(([role, label]) => (
              <option value={role} key={role}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Código do vendedor no ERP
          <input
            name="erpSellerCode"
            maxLength={60}
            defaultValue={user?.erpSellerCode ?? ""}
          />
        </label>
        <label className="field">
          Acesso ativo
          <input
            type="checkbox"
            name="active"
            defaultChecked={user?.active ?? true}
            className="!w-5 !min-h-5"
          />
        </label>
      </fieldset>
      <div className="actions">
        <button className="button" disabled={busy}>
          {busy ? "Salvando…" : "Salvar permissões"}
        </button>
        {user && (
          <Link className="button secondary" href="/admin/usuarios#permissoes">
            Voltar ao cadastro
          </Link>
        )}
      </div>
      {error && (
        <p role="alert" className="error mt-3">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="small mt-3">
          {message}
        </p>
      )}
    </form>
  );
}
