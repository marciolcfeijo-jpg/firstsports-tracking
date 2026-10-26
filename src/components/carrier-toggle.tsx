"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function CarrierToggle({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <>
      <button
        className="button secondary"
        onClick={async () => {
          try {
            const r = await fetch("/api/admin/carriers", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, enabled: !enabled }),
            });
            const b = await r.json();
            if (!r.ok) throw new Error(b.error);
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Erro");
          }
        }}
      >
        {enabled ? "Desativar consultas" : "Habilitar consultas"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
