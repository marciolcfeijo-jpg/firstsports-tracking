"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="container page">
      <div className="card">
        <h1 className="!text-3xl">Não foi possível carregar esta página</h1>
        <p>
          Tente novamente em alguns instantes. Se o problema persistir, entre em
          contato com o atendimento.
        </p>
        <button className="button" onClick={reset}>
          Tentar novamente
        </button>
      </div>
    </main>
  );
}
