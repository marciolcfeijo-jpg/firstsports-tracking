"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
type Props = {
  id: string;
  version: number;
  cte: string | null;
  estimatedDelivery: string | null;
  senderDocument: string;
  links: { id: string; expiresAt: string; revokedAt: string | null }[];
  canWrite: boolean;
  name: string;
  email: string | null;
  city: string;
  state: string;
  payerDocument: string | null;
  carrierCode: string;
  carriers: { code: string; name: string }[];
};
export function ShipmentActions(p: Props) {
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function call(path: string, body?: unknown, method = "POST") {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(`/api/admin/shipments/${p.id}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json();
      // Sync failures are persisted too: refresh the server-rendered error and log.
      if (path === "/sync") router.refresh();
      if (!r.ok)
        throw new Error(
          data.error || data.code || "Não foi possível concluir a ação",
        );
      if (path !== "/sync") router.refresh();
      setMessage(
        path === "/sync"
          ? "Rastreamento atualizado com dados da transportadora."
          : "Operação concluída.",
      );
      return data;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha na operação");
    } finally {
      setBusy(false);
    }
  }
  if (!p.canWrite)
    return <div className="notice">Seu acesso permite somente leitura.</div>;
  return (
    <>
      <section className="card spaced">
        <h3>Ações da remessa</h3>
        <div className="actions">
          <button
            className="button"
            disabled={busy}
            onClick={() => call("/sync")}
          >
            Atualizar rastreamento
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              const data = await call("/links");
              if (data) setLink(data.url);
            }}
          >
            Gerar link seguro
          </button>
        </div>
        {link && (
          <div className="spaced">
            <label className="field">
              Link pessoal — válido por 30 dias
              <input readOnly value={link} />
            </label>
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setMessage("Link copiado.");
                } catch {
                  setMessage("Selecione o link acima e copie manualmente.");
                }
              }}
            >
              Copiar link
            </button>
          </div>
        )}
        <p role="status" className="small !mt-4 !mb-0">
          {message}
        </p>
      </section>
      <section className="card spaced">
        <h3>Editar dados cadastrais</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            await call(
              "",
              {
                version: p.version,
                name: d.get("name"),
                email: d.get("email"),
                city: d.get("city"),
                state: d.get("state"),
                payerDocument: d.get("payer"),
                carrierCode: d.get("carrier"),
                cte: String(d.get("cte") || "") || null,
                estimatedDelivery: d.get("eta")
                  ? new Date(
                      String(d.get("eta")) + "T23:59:59-03:00",
                    ).toISOString()
                  : null,
              },
              "PATCH",
            );
          }}
        >
          <div className="grid-2">
            <label className="field">
              Nome do cliente
              <input name="name" defaultValue={p.name} required />
            </label>
            <label className="field">
              E-mail do cliente
              <input name="email" type="email" defaultValue={p.email || ""} />
            </label>
            <label className="field">
              Cidade de destino
              <input name="city" defaultValue={p.city} required />
            </label>
            <label className="field">
              UF de destino
              <input
                name="state"
                defaultValue={p.state}
                required
                maxLength={2}
              />
            </label>
            <label className="field">
              CNPJ do tomador
              <input name="payer" defaultValue={p.payerDocument || ""} />
            </label>
            <label className="field">
              Transportadora
              <select name="carrier" defaultValue={p.carrierCode}>
                {p.carriers.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Conhecimento de transporte
              <input name="cte" defaultValue={p.cte || ""} maxLength={60} />
            </label>
            <label className="field">
              Previsão de entrega
              <input
                name="eta"
                type="date"
                defaultValue={p.estimatedDelivery?.slice(0, 10) || ""}
              />
            </label>
          </div>
          <button disabled={busy} className="button secondary">
            Salvar alterações
          </button>
        </form>
      </section>
      <section className="card spaced">
        <h3>Vincular outra nota fiscal</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            await call("/invoices", {
              cnpj_remetente: p.senderDocument,
              serie_nf: data.get("series"),
              numero_nf: data.get("number"),
            });
          }}
        >
          <div className="grid-2">
            <label className="field">
              Série
              <input
                name="series"
                required
                pattern="[0-9]{1,3}"
                defaultValue="1"
              />
            </label>
            <label className="field">
              Número da NF
              <input name="number" required pattern="[0-9]{1,12}" />
            </label>
          </div>
          <button disabled={busy} className="button secondary">
            Vincular nota
          </button>
        </form>
      </section>
      <section className="card spaced">
        <h3>Links emitidos</h3>
        <p className="small">
          O token é exibido somente na criação. Revogar interrompe o acesso por
          esse link.
        </p>
        {p.links.map((l) => (
          <div
            key={l.id}
            className="flex justify-between items-center gap-4 py-3 border-b border-slate-100"
          >
            <span className="small">
              {l.revokedAt
                ? "Revogado"
                : new Date(l.expiresAt) < new Date()
                  ? "Expirado"
                  : "Ativo"}{" "}
              · expira{" "}
              {new Date(l.expiresAt).toLocaleDateString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}
            </span>
            {!l.revokedAt && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => call("/links", { linkId: l.id }, "DELETE")}
              >
                Revogar
              </button>
            )}
          </div>
        ))}
        {!p.links.length && <p className="small">Nenhum link emitido.</p>}
      </section>
    </>
  );
}
