import Link from "next/link";
import { OperationalReports } from "@/components/operational-reports";
import { automaticUpdates } from "@/lib/automatic-updates";
import { requirePageAdmin } from "@/lib/page-auth";

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  await requirePageAdmin();
  const updates = await automaticUpdates(7);
  return (
    <>
      <div className="actions mb-4">
        <Link className="button" href="/admin/relatorios/sla-por-uf">
          SLA por UF
        </Link>
      </div>
      <section className="card mb-4">
        <h2>Atualizações automáticas</h2>
        <p>Registros atualizados com sucesso nos últimos 7 dias.</p>
        <div className="actions">
          <Link href="/admin/relatorios/atualizacoes-automaticas?tipo=pedidos">
            Pedidos atualizados ·{" "}
            {updates.pedidos.length.toLocaleString("pt-BR")}
          </Link>
          <Link href="/admin/relatorios/atualizacoes-automaticas?tipo=remessas">
            Remessas atualizadas ·{" "}
            {updates.remessas.length.toLocaleString("pt-BR")}
          </Link>
        </div>
      </section>
      <OperationalReports requestedDays={(await searchParams).days} />
    </>
  );
}
