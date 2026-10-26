"use client";
import { useRouter } from "next/navigation";
export function ImportHistory({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      className="button secondary"
      onClick={() => {
        router.push("/admin/importacoes?batch=" + id);
        router.refresh();
      }}
    >
      Abrir lote
    </button>
  );
}
