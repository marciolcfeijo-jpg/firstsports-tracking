import Link from "next/link";
export default function NotFound() {
  return (
    <main className="container page">
      <h1>Página não encontrada</h1>
      <Link href="/" className="button">
        Voltar ao início
      </Link>
    </main>
  );
}
