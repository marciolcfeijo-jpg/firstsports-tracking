import { OperationalReports } from "@/components/operational-reports";
import { requirePageAdmin } from "@/lib/page-auth";

export default async function SalesReports({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  const seller = await requirePageAdmin(["SALES"]);
  return (
    <OperationalReports
      requestedDays={(await searchParams).days}
      sellerId={seller.id}
    />
  );
}
