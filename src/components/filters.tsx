import { db } from "@/lib/db";
import { statusLabels } from "@/lib/status";
export async function Filters({ values }: { values: Record<string, string> }) {
  const carriers = await db.carrier.findMany({
    select: { code: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <form className="toolbar">
      <input
        name="q"
        placeholder="Buscar pedido, nota ou cliente"
        defaultValue={values.q}
        aria-label="Buscar"
      />
      <select
        name="carrier"
        defaultValue={values.carrier || ""}
        aria-label="Transportadora"
      >
        <option value="">Todas as transportadoras</option>
        {carriers.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        name="status"
        defaultValue={values.status || ""}
        aria-label="Status"
      >
        <option value="">Todos os status</option>
        {Object.entries(statusLabels).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <input
        name="state"
        placeholder="UF"
        maxLength={2}
        defaultValue={values.state}
        aria-label="UF de destino"
        className="!min-w-16 !max-w-20"
      />
      <input
        type="date"
        name="from"
        defaultValue={values.from}
        aria-label="Emissão de"
      />
      <input
        type="date"
        name="to"
        defaultValue={values.to}
        aria-label="Emissão até"
      />
      <select
        name="sort"
        defaultValue={values.sort || "desc"}
        aria-label="Ordenação"
      >
        <option value="desc">Mais recentes</option>
        <option value="asc">Mais antigas</option>
      </select>
      <button className="button secondary">Filtrar</button>
    </form>
  );
}
