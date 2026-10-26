import Link from "next/link";
import { CircleHelp, ArrowUpRight } from "lucide-react";
export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="First Sports — início">
      FIRST <span>SPORTS</span>
      <small>PORTAL DE RASTREAMENTO</small>
    </Link>
  );
}
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="header">
        <div className="container">
          <Brand />
          <nav className="nav">
            <Link href="/ajuda" className="flex items-center gap-2">
              <CircleHelp size={16} /> Precisa de ajuda?
            </Link>
            <Link href="/admin" className="admin-link">
              Área administrativa <ArrowUpRight size={13} className="inline" />
            </Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="footer">
        <div className="container">
          <span>
            © {new Date().getFullYear()} First Sports. Todos os direitos
            reservados.
          </span>
          <div>
            <Link href="/ajuda">Central de ajuda</Link>
            <Link href="/privacidade">Privacidade</Link>
            <a
              href="https://firstsports.com.br"
              target="_blank"
              rel="noreferrer"
            >
              Site institucional ↗
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
