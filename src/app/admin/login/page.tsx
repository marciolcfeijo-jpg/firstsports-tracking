import { PublicShell } from "@/components/public-shell";
import { LoginForm } from "@/components/login-form";
import { LockKeyhole } from "lucide-react";
export const dynamic = "force-dynamic";
export default function Login() {
  const configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return (
    <PublicShell>
      <main className="container page">
        <div className="login card">
          <div className="icon-box">
            <LockKeyhole />
          </div>
          <h1 className="!text-3xl">Área administrativa</h1>
          <p className="small">
            Acesso exclusivo para a equipe autorizada First Sports.
          </p>
          {!configured && (
            <div className="notice">
              Autenticação ainda não configurada. O responsável pelo ambiente
              deve conectar um projeto Supabase e cadastrar o primeiro
              administrador.
            </div>
          )}
          <LoginForm />
          <p className="small !mt-5 !mb-0">
            Para recuperar seu acesso, contate o administrador do projeto
            Supabase.
          </p>
        </div>
      </main>
    </PublicShell>
  );
}
