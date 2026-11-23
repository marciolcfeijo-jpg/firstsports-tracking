"use client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  ChartNoAxesColumn,
  Package,
  ClipboardList,
  Upload,
  Truck,
  Users,
  Settings,
  LogOut,
  ExternalLink,
} from "lucide-react";
const entries = [
  ["/admin", "Visão geral", LayoutDashboard],
  ["/admin/relatorios", "Relatórios", ChartNoAxesColumn],
  ["/admin/pedidos", "Pedidos", ClipboardList],
  ["/admin/remessas", "Remessas", Package],
  ["/admin/importacoes", "Importações", Upload],
  ["/admin/transportadoras", "Transportadoras", Truck],
  ["/admin/usuarios", "Usuários", Users],
  ["/admin/configuracoes", "Configurações", Settings],
] as const;
export function AdminShell({
  children,
  email,
  role,
  brand,
}: {
  children: React.ReactNode;
  email: string;
  role: string;
  brand: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    router.push("/admin/login");
    router.refresh();
  }
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        {brand}
        <nav>
          {entries
            .filter(([href]) => role === "ADMIN" || href !== "/admin/usuarios")
            .map(([href, label, Icon]) => (
              <Link
                key={href}
                href={href}
                className={
                  (href === "/admin" ? path === href : path.startsWith(href))
                    ? "active"
                    : ""
                }
              >
                <Icon size={17} />
                {label}
              </Link>
            ))}
        </nav>
        <Link href="/" className="small muted flex gap-2 items-center px-3">
          <ExternalLink size={15} /> Acessar portal do cliente
        </Link>
      </aside>
      <main className="admin-main">
        <div className="admin-top">
          <span>Operação logística · First Sports</span>
          <div className="flex items-center gap-3">
            <span>
              {email} · {role}
            </span>
            <button onClick={logout} aria-label="Sair" className="p-2">
              <LogOut size={17} />
            </button>
          </div>
        </div>
        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
}
