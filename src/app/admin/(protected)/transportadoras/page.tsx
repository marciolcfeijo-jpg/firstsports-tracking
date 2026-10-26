import { requirePageAdmin } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { CarrierToggle } from "@/components/carrier-toggle";
import { BraspressAdapter } from "../../../../../integrations/carriers/braspress";
import { AlfaAdapter } from "../../../../../integrations/carriers/alfa";
export default async function Carriers() {
  const user = await requirePageAdmin();
  const carriers = await db.carrier.findMany();
  const config: Record<string, { valid: boolean; reason?: string }> = {
    BRASPRESS: new BraspressAdapter().validateConfiguration(),
    ALFA: new AlfaAdapter().validateConfiguration(),
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Transportadoras</h1>
          <p>Configuração e diagnóstico das integrações logísticas.</p>
        </div>
      </div>
      <div className="notice">
        Conectores baseados na documentação oficial: Braspress v3 e Alfa v1.2.
        As consultas reais dependem das credenciais e de homologação autorizada.
        Credenciais são configuradas exclusivamente no servidor.
      </div>
      <div className="grid-2">
        {carriers.map((c) => (
          <div className="card" key={c.id}>
            <h2>{c.name}</h2>
            <span className="badge">
              {c.enabled ? "Consultas habilitadas" : "Consultas desabilitadas"}
            </span>
            <p className="small spaced">
              Diagnóstico:{" "}
              {config[c.code]?.valid
                ? "Credenciais presentes no servidor. A autenticação será verificada ao atualizar uma remessa."
                : config[c.code]?.reason === "CREDENTIALS_MISSING"
                  ? "Credenciais de integração não configuradas neste ambiente."
                  : config[c.code]?.reason ||
                    "Não há conector disponível para esta transportadora."}
            </p>
            {user.role === "ADMIN" && (
              <CarrierToggle id={c.id} enabled={c.enabled} />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
