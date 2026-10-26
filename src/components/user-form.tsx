"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function UserForm() {
  const [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <form
      className="card spaced"
      onSubmit={async (e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        try {
          const r = await fetch("/api/admin/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: d.get("id"),
              email: d.get("email"),
              role: d.get("role"),
              active: d.get("active") === "on",
            }),
          });
          const b = await r.json();
          if (!r.ok) throw new Error(b.error);
          setMessage("Permissões salvas.");
          router.refresh();
        } catch (e) {
          setMessage(e instanceof Error ? e.message : "Erro ao salvar");
        }
      }}
    >
      <h3>Vincular ou atualizar usuário Supabase</h3>
      <p className="small">
        Crie e verifique o usuário no Supabase Auth antes de conceder acesso
        aqui.
      </p>
      <div className="grid-2">
        <label className="field">
          UUID do usuário
          <input name="id" required />
        </label>
        <label className="field">
          E-mail
          <input name="email" type="email" required />
        </label>
        <label className="field">
          Papel
          <select name="role">
            <option value="VIEWER">Leitura</option>
            <option value="OPERATOR">Operação</option>
            <option value="ADMIN">Administração</option>
          </select>
        </label>
        <label className="field">
          Acesso ativo
          <input
            type="checkbox"
            name="active"
            defaultChecked
            className="!w-5 !min-h-5"
          />
        </label>
      </div>
      <button className="button">Salvar permissões</button>
      <p role="status" className="small !mt-3">
        {message}
      </p>
    </form>
  );
}
