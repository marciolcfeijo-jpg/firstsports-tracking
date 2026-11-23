import { AdminShell } from "@/components/admin-shell";
import { Brand } from "@/components/brand-logos";
import { requirePageAdmin } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const seller = await requirePageAdmin(["SALES"]);
  return (
    <AdminShell
      email={seller.email}
      role={seller.role}
      brand={<Brand admin href="/admin/carteira" />}
    >
      {children}
    </AdminShell>
  );
}
