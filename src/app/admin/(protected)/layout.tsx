import { requireAdmin } from "@/lib/auth";
import { Brand } from "@/components/brand-logos";
import { AdminShell } from "@/components/admin-shell";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await requireAdmin();
  } catch {
    redirect("/admin/login");
  }
  return (
    <AdminShell email={user.email} role={user.role} brand={<Brand admin />}>
      {children}
    </AdminShell>
  );
}
