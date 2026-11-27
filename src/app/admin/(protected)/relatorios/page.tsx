import Link from "next/link";
import { OperationalReports } from "@/components/operational-reports";
import { requirePageAdmin } from "@/lib/page-auth";

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  await requirePageAdmin();
  return (
    <>
      <div className="actions mb-4">
        <Link className="button" href="/admin/relatorios/sla-por-uf">
          SLA por UF
        </Link>
      </div>
      <OperationalReports requestedDays={(await searchParams).days} />
    </>
  );
}
