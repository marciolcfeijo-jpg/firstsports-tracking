"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  CarrierResponseDiagnostics,
  TrackingResult,
} from "../../integrations/carriers/types";
import { inputDate } from "@/lib/status";
type Props = {
  id: string;
  version: number;
  cte: string | null;
  trackingCode: string | null;
  estimatedDelivery: string | null;
  senderDocument: string;
  orderNumber: string;
  issuedAt: string;
  invoices: { id: string; number: string; series: string }[];
  links: { id: string; expiresAt: string; revokedAt: string | null }[];
  canWrite: boolean;
  name: string;
  email: string | null;
  city: string;
  state: string;
  payerDocument: string | null;
  carrierCode: string;
  sellerId?: string | null;
  sellers?: { id: string; name: string; active: boolean }[];
  carriers: { code: string; name: string }[];
};
export function ShipmentActions(p: Props) {
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [diagnostics, setDiagnostics] =
    useState<TrackingResult["diagnostics"]>();
  const [responseDiagnostics, setResponseDiagnostics] =
    useState<CarrierResponseDiagnostics>();
  const [requestBusy, setBusy] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const busy = requestBusy || refreshing;
  const router = useRouter();
  async function call(path: string, body?: unknown, method = "POST") {
    setBusy(true);
    setMessage("");
    if (path === "/sync") {
      setDiagnostics(undefined);
      setResponseDiagnostics(undefined);
    }
    try {
      const r = await fetch(`/api/admin/shipments/${p.id}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json();
      // Sync failures are persisted too: refresh the server-rendered error and log.
      if (path === "/sync") {
        setResponseDiagnostics(data.responseDiagnostics);
        startTransition(() => router.refresh());
      }
      if (!r.ok)
        throw new Error(
          (data.error || data.code || "Não foi possível concluir a ação") +
            (data.requestId ? ` Referência: ${data.requestId}` : ""),
        );
      if (path !== "/sync") startTransition(() => router.refresh());
      if (data.linksRevoked) setLink("");
      if (path === "/sync") setDiagnostics(data.diagnostics);
      setMessage(
        path === "/sync"
          ? (data.diagnostics?.eventsNormalized === 0
              ? "Dados gerais atualizados, mas nenhum evento de histórico com data foi processado. Confira o diagnóstico abaixo."
              : "Rastreamento atualizado com dados da transportadora.") +
              (data.diagnostics
                ? ` API Braspress: ${data.diagnostics.timelineReceived} etapas, ${data.diagnostics.occurrencesReceived} ocorrências; ${data.diagnostics.undatedReceived} registros sem data. Histórico processado: ${data.diagnostics.eventsNormalized} eventos.${data.diagnostics.historySource ? ` Origem do histórico: ${data.diagnostics.historySource}.` : ""}`
                : "")
          : "Operação concluída." +
              (data.resetTracking
                ? " Cadastro corrigido. Gere um novo link e clique em Atualizar rastreamento. O histórico anterior foi arquivado."
                : ""),
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
        {responseDiagnostics && (
          <details className="small spaced" open>
            <summary>
              {responseDiagnostics.carrier === "CORREIOS"
                ? "Diagnóstico HTTP dos Correios"
                : "Diagnóstico do formato da resposta Alfa"}
            </summary>
            <p>
              {responseDiagnostics.carrier === "CORREIOS"
                ? "Etapa, ambiente e código HTTP da chamada. Nenhum token ou credencial é exibido."
                : "Somente campos e tipos incompatíveis; nenhum valor da remessa ou credencial é exibido."}
            </p>
            <pre className="overflow-auto !my-3">
              {JSON.stringify(responseDiagnostics, null, 2)}
            </pre>
            <button
              className="button secondary"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    JSON.stringify(responseDiagnostics, null, 2),
                  );
                  setMessage("Diagnóstico copiado.");
                } catch {
                  setMessage("Selecione o diagnóstico e copie manualmente.");
                }
              }}
            >
              Copiar diagnóstico
            </button>
          </details>
        )}
        {diagnostics?.structure && (
          <details className="small spaced">
            <summary className="cursor-pointer">
              Diagnóstico da estrutura da resposta Braspress
            </summary>
            <pre className="overflow-auto !my-3">
              {JSON.stringify(diagnostics, null, 2)}
            </pre>
            <button
              className="button secondary"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    JSON.stringify(diagnostics, null, 2),
                  );
                  setMessage(
                    "Diagnóstico copiado. Ele contém apenas contagens e nomes de campos.",
                  );
                } catch {
                  setMessage(
                    "Selecione o diagnóstico acima e copie manualmente.",
                  );
                }
              }}
            >
              Copiar diagnóstico
            </button>
          </details>
        )}
      </section>
      <section className="card spaced">
        <h3>Editar dados cadastrais</h3>
        <form
          key={p.version}
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            await call(
              "",
              {
                version: p.version,
                orderNumber: d.get("orderNumber"),
                recipientDocument: String(d.get("recipientDocument") || ""),
                senderDocument: d.get("senderDocument"),
                issuedAt: d.get("issuedAt"),
                invoices: p.invoices
                  .filter((i) => !d.get("remove-" + i.id))
                  .map((i) => ({
                    id: i.id,
                    number: String(d.get("number-" + i.id)),
                    series: String(d.get("series-" + i.id)),
                  })),
                name: d.get("name"),
                email: d.get("email"),
                city: d.get("city"),
                state: d.get("state"),
                payerDocument: d.get("payer"),
                carrierCode: d.get("carrier"),
                sellerId: String(d.get("sellerId") || "") || null,
                trackingCode: String(d.get("trackingCode") || ""),
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
          <fieldset disabled={busy} className="!border-0 !p-0 !m-0 min-w-0">
            <p className="small">
              Você pode corrigir os campos do cadastro. Alterações de
              destinatário, NF ou identificação do transporte arquivam o
              histórico atual e revogam os links anteriores. Depois, atualize o
              rastreamento e gere um novo link.
            </p>
            <div className="grid-2">
              <label className="field">
                Vendedor / representante
                <select name="sellerId" defaultValue={p.sellerId || ""}>
                  <option value="">Sem vendedor</option>
                  {(p.sellers || []).map((seller) => (
                    <option key={seller.id} value={seller.id}>
                      {seller.name}
                      {seller.active ? "" : " (inativo)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Número do pedido
                <input
                  name="orderNumber"
                  defaultValue={p.orderNumber}
                  required
                  maxLength={120}
                />
              </label>
              <label className="field">
                Corrigir CPF/CNPJ do destinatário
                <input
                  name="recipientDocument"
                  placeholder="Deixe em branco para manter o documento atual"
                  maxLength={25}
                />
              </label>
              <label className="field">
                CNPJ do remetente
                <input
                  name="senderDocument"
                  defaultValue={p.senderDocument}
                  required
                  maxLength={25}
                />
              </label>
              <label className="field">
                Data de emissão
                <input
                  name="issuedAt"
                  type="date"
                  defaultValue={inputDate(p.issuedAt)}
                  required
                />
              </label>
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
                CNPJ do tomador (vazio: usa o remetente)
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
                Código do objeto Correios
                <input
                  name="trackingCode"
                  defaultValue={p.trackingCode || ""}
                  maxLength={13}
                  placeholder="AA123456789BR"
                />
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
                  defaultValue={inputDate(p.estimatedDelivery)}
                />
              </label>
            </div>
            <fieldset className="invoice-corrections">
              <legend>Corrigir notas fiscais vinculadas</legend>
              {p.invoices.map((invoice, index) => (
                <div className="grid-2 card spaced" key={invoice.id}>
                  <label className="field">
                    Número da NF {index + 1}
                    <input
                      name={"number-" + invoice.id}
                      defaultValue={invoice.number}
                      required
                      pattern="[0-9]{1,12}"
                    />
                  </label>
                  <label className="field">
                    Série da NF {index + 1}
                    <input
                      name={"series-" + invoice.id}
                      defaultValue={invoice.series}
                      required
                      pattern="[0-9]{1,3}"
                    />
                  </label>
                  {p.invoices.length > 1 && (
                    <label className="small flex gap-2 items-center">
                      <input
                        className="!w-auto !min-h-0"
                        type="checkbox"
                        name={"remove-" + invoice.id}
                      />
                      Remover esta NF ao salvar
                    </label>
                  )}
                </div>
              ))}
            </fieldset>
            <button disabled={busy} className="button secondary">
              Salvar alterações
            </button>
          </fieldset>
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
