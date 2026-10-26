import { db } from "@/lib/db";
import { requirePageAdmin } from "@/lib/page-auth";
import { notFound } from "next/navigation";
import { dateOnly, dateTime, statusLabels } from "@/lib/status";
import { ShipmentActions } from "@/components/shipment-actions";
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageAdmin();
  const s = await db.shipment.findUnique({
    where: { id: (await params).id },
    include: {
      order: { include: { customer: true } },
      carrier: true,
      invoices: true,
      events: { orderBy: { occurredAt: "desc" } },
      syncLogs: { orderBy: { createdAt: "desc" }, take: 20 },
      links: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!s) notFound();
  const carriers = await db.carrier.findMany({
    select: { code: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Detalhes da remessa</div>
          <h1>Pedido {s.order.number}</h1>
          <p>
            {s.order.customer.name} · {s.destinationCity}/{s.destinationState}
          </p>
        </div>
        <span className={"badge " + s.status}>{statusLabels[s.status]}</span>
      </div>
      <div className="detail-grid">
        <div>
          <div className="card">
            <h3>Informações de transporte</h3>
            <dl className="data-list">
              <div>
                <dt>Transportadora</dt>
                <dd>{s.carrier.name}</dd>
              </div>
              <div>
                <dt>Previsão</dt>
                <dd>{dateOnly(s.estimatedDelivery)}</dd>
              </div>
              <div>
                <dt>Notas fiscais</dt>
                <dd>
                  {s.invoices
                    .map((i) => i.number + " / série " + i.series)
                    .join(", ")}
                </dd>
              </div>
              <div>
                <dt>Última atualização da API</dt>
                <dd>{dateTime(s.lastSyncedAt)}</dd>
              </div>
              <div>
                <dt>CT-e</dt>
                <dd>{s.cte || "Não informado"}</dd>
              </div>
              <div>
                <dt>Consultas da transportadora</dt>
                <dd>{s.carrier.enabled ? "Habilitadas" : "Desabilitadas"}</dd>
              </div>
              <div>
                <dt>Última tentativa</dt>
                <dd>{dateTime(s.syncLogs[0]?.createdAt)}</dd>
              </div>
              <div>
                <dt>Falhas consecutivas</dt>
                <dd>{s.syncFailures}</dd>
              </div>
            </dl>
            {s.lastSyncError && (
              <div className="error" role="alert">
                <strong>Última falha registrada: {s.lastSyncError}.</strong>{" "}
                Últimos dados preservados.
                {s.lastSyncError === "INTEGRATION_DISABLED" && (
                  <p className="!mb-0 !mt-2 !text-inherit">
                    {s.carrier.enabled
                      ? "Essa tentativa ocorreu com a integração desabilitada. As consultas estão habilitadas agora; clique em Atualizar rastreamento para obter um novo resultado."
                      : "A transportadora está desabilitada. Habilite as consultas em Transportadoras antes de tentar novamente."}
                  </p>
                )}
              </div>
            )}
          </div>
          <ShipmentActions
            id={s.id}
            version={s.version}
            cte={s.cte}
            estimatedDelivery={s.estimatedDelivery?.toISOString() || null}
            senderDocument={s.senderDocument}
            links={s.links.map((l) => ({
              id: l.id,
              expiresAt: l.expiresAt.toISOString(),
              revokedAt: l.revokedAt?.toISOString() || null,
            }))}
            name={s.order.customer.name}
            email={s.order.customer.email}
            city={s.destinationCity}
            state={s.destinationState}
            payerDocument={s.payerDocument}
            carrierCode={s.carrier.code}
            carriers={carriers}
            canWrite={user.role !== "VIEWER"}
          />
          <section className="card spaced">
            <h3>Tentativas de atualização</h3>
            {!s.syncLogs.length && (
              <p className="small">Nenhuma tentativa realizada.</p>
            )}
            {s.syncLogs.map((log) => (
              <div
                key={log.id}
                className="small py-2 border-b border-slate-100"
              >
                {dateTime(log.createdAt)} · {log.success ? "Sucesso" : log.code}{" "}
                · {log.durationMs} ms
              </div>
            ))}
          </section>
        </div>
        <aside className="card h-fit">
          <h3>Eventos registrados</h3>
          <ol className="timeline">
            {s.events.map((e) => (
              <li key={e.id}>
                <strong>{statusLabels[e.status]}</strong>
                <p>{e.description}</p>
                <time>
                  {e.dateOnly
                    ? dateOnly(e.occurredAt) + " · horário não informado"
                    : dateTime(e.occurredAt)}
                </time>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}
