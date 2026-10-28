export const notFoundLabel = "Não localizada na transportadora";
export const notFoundGuidance =
  "Confira a transportadora selecionada, o CNPJ do tomador e a NF/série. A remessa pode ainda não ter sido registrada ou coletada, ou estar fora da janela de consulta da API. O retorno não confirma a causa.";

export function TrackingAvailability({ error }: { error?: string | null }) {
  if (error !== "NOT_FOUND") return null;
  return (
    <span className="badge tracking-not-found" title={notFoundGuidance}>
      {notFoundLabel}
    </span>
  );
}
