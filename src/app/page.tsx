import { PublicShell } from "@/components/public-shell";
import { LookupForm } from "@/components/lookup-form";
import { ShieldCheck, Truck, Link as LinkIcon } from "lucide-react";
export default function Home() {
  return (
    <PublicShell>
      <main>
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="eyebrow">Sua entrega, mais perto</div>
              <h1>
                Onde está
                <br />
                minha <span className="text-blue-600">entrega?</span>
              </h1>
              <p>
                Acompanhe seu pedido de forma rápida e segura, em um só lugar.
              </p>
              <div className="chips">
                <span>
                  <ShieldCheck size={16} /> Consulta segura
                </span>
                <span>
                  <Truck size={16} /> Todas as suas remessas
                </span>
              </div>
            </div>
            <LookupForm />
          </div>
        </section>
        <section className="section">
          <div className="container">
            <div className="section-title">
              <h2>Do nosso time até você</h2>
              <p>Mais transparência em cada etapa da sua entrega.</p>
            </div>
            <div className="steps">
              <article className="step">
                <small>01 · IDENTIFIQUE</small>
                <h3>Informe seu pedido</h3>
                <p>
                  Use o número do pedido ou da nota fiscal e o documento do
                  destinatário.
                </p>
              </article>
              <article className="step">
                <small>02 · ACOMPANHE</small>
                <h3>Veja cada movimentação</h3>
                <p>
                  Consulte os eventos registrados e a previsão informada pela
                  transportadora.
                </p>
              </article>
              <article className="step">
                <small>03 · FIQUE POR DENTRO</small>
                <h3>Tudo em um só lugar</h3>
                <p>
                  Da coleta à entrega, acompanhe suas remessas sem trocar de
                  site.
                </p>
              </article>
            </div>
            <div className="notice flex gap-3 items-start !mt-6">
              <LinkIcon size={19} className="shrink-0 mt-0.5" />
              <div>
                <strong>Recebeu um link de rastreamento?</strong>
                <br />
                Acesse diretamente o link enviado pela First Sports. Ele é
                pessoal e dispensa o preenchimento dos dados.
              </div>
            </div>
          </div>
        </section>
        <section className="partners">
          <span className="text-xs">
            ESPORTE QUE CONECTA. MARCAS QUE INSPIRAM.
          </span>
          <div>
            <span>Joma</span>
            <span>uhlsport</span>
            <span>Kempa</span>
            <span>Spalding</span>
          </div>
          <p className="text-xs !mt-3 !mb-0">
            Marcas distribuídas pelo grupo First Sports
          </p>
        </section>
      </main>
    </PublicShell>
  );
}
