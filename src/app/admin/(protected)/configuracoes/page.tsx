import { requirePageAdmin } from "@/lib/page-auth";
export default async function Settings() {
  await requirePageAdmin(["ADMIN"]);
  const requirements = [
    "DATABASE_URL",
    "DOCUMENT_HMAC_KEY",
    "CRON_SECRET",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "BRASPRESS_USERNAME",
    "BRASPRESS_PASSWORD",
    "ALFA_API_KEY",
    "CORREIOS_USERNAME",
    "CORREIOS_ACCESS_CODE",
    "CORREIOS_POSTING_CARD",
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Configurações do ambiente</h1>
          <p>
            Diagnóstico de presença das variáveis. Nenhum valor secreto é
            exibido.
          </p>
        </div>
      </div>
      <div className="card">
        <h3>Configuração do servidor</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Variável</th>
                <th>Presença</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((name) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{process.env[name] ? "Configurada" : "Pendente"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="notice">
          Altere os valores no gerenciador seguro de configuração da hospedagem
          e reinicie a aplicação. Fuso de apresentação: America/Sao_Paulo. Links
          públicos: 30 dias. Agendamento Vercel: diário, a partir das 6h de
          Brasília, em lotes de até 10 remessas elegíveis.
        </div>
      </div>
    </>
  );
}
