import { TrackingHistory } from "./tracking-history";
import { type publicShipment } from "@/lib/shipments";
import { statusLabels, dateTime, dateOnly } from "@/lib/status";
import {
  PackageCheck,
  Truck,
  Clock,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
type Shipment = ReturnType<typeof publicShipment>;
export function TrackingResult({ shipment: s }: { shipment: Shipment }) {
  return (
    <>
      <Link href="/" className="muted small flex gap-2 items-center !mb-6">
        <ArrowLeft size={15} /> Nova consulta
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Acompanhamento de entrega</div>
          <h1>Pedido {s.orderNumber}</h1>
          <p>
            Informações da sua remessa, diretamente dos registros logísticos.
          </p>
        </div>
        <span className="badge">
          <ShieldCheck size={13} className="mr-1" /> Consulta protegida
        </span>
      </div>
      <div className="detail-grid">
        <div>
          <section className="card">
            <div className="flex gap-4 items-center">
              <div className="icon-box !mb-0">
                {s.status === "DELIVERED" ? <PackageCheck /> : <Truck />}
              </div>
              <div>
                <span className={"badge " + s.status}>
                  {statusLabels[s.status]}
                </span>
                <h2 className="!mt-2 !mb-1">
                  {s.status === "DELIVERED"
                    ? "Sua encomenda foi entregue!"
                    : s.status === "EXCEPTION"
                      ? "Há uma ocorrência na entrega"
                      : s.status === "IN_TRANSIT" ||
                          s.status === "OUT_FOR_DELIVERY"
                        ? "Sua encomenda está a caminho!"
                        : "Acompanhe o andamento da sua entrega"}
                </h2>
              </div>
            </div>
            {s.stale && (
              <div className="notice">
                {s.lastSyncedAt
                  ? "As informações podem estar desatualizadas. Exibimos o último registro disponível."
                  : "Aguardando a primeira atualização da transportadora. Ainda não há previsão confirmada."}
              </div>
            )}
            {s.integrationError && (
              <div className="notice">
                Não foi possível atualizar o rastreamento. A última informação
                registrada foi preservada.
              </div>
            )}
            <hr className="border-slate-100 my-6" />
            <dl className="data-list">
              <div>
                <dt>Previsão de entrega</dt>
                <dd>{dateOnly(s.estimatedDelivery)}</dd>
              </div>
              <div>
                <dt>Transportadora</dt>
                <dd>{s.carrier}</dd>
              </div>
              {s.deliveredAt && (
                <div>
                  <dt>Entrega confirmada</dt>
                  <dd>{dateTime(s.deliveredAt)}</dd>
                </div>
              )}
              {s.proofOfDeliveryUrl && (
                <div>
                  <dt>Comprovante</dt>
                  <dd>
                    <a
                      href={s.proofOfDeliveryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--brand-purple-dark)]"
                    >
                      Consultar comprovante ↗
                    </a>
                  </dd>
                </div>
              )}
              <div>
                <dt>Última consulta à transportadora</dt>
                <dd>{dateTime(s.lastSyncedAt)}</dd>
              </div>
            </dl>
          </section>
          <section className="card spaced">
            <h2 className="!text-xl">Histórico da entrega</h2>
            <TrackingHistory events={s.events} />
          </section>
        </div>
        <aside>
          <section className="card">
            <h3>Detalhes da remessa</h3>
            <dl className="data-list !grid-cols-1">
              <div>
                <dt>Pedido</dt>
                <dd>{s.orderNumber}</dd>
              </div>
              <div>
                <dt>Nota(s) fiscal(is)</dt>
                <dd>
                  {s.invoices
                    .map((i) => `${i.number} · série ${i.series}`)
                    .join(", ")}
                </dd>
              </div>
              <div>
                <dt>Conhecimento de transporte</dt>
                <dd>{s.cte || "Não informado"}</dd>
              </div>
            </dl>
          </section>
          <div className="notice">
            <Clock size={18} className="mb-2" />
            As datas e horários são exibidos no fuso de Brasília.
          </div>
          <section className="card spaced">
            <h3>Precisa de ajuda?</h3>
            <p className="small">
              Veja as orientações para acompanhar sua entrega.
            </p>
            <Link href="/ajuda" className="button secondary full">
              Central de ajuda →
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
