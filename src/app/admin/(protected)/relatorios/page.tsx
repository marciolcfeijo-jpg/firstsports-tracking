import { OperationalReports } from "@/components/operational-reports";
import { requirePageAdmin } from "@/lib/page-auth";

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  await requirePageAdmin();
  return <OperationalReports requestedDays={(await searchParams).days} />;
}
