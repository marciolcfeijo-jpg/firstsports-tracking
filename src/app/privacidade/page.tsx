import { PublicShell } from "@/components/public-shell";
export default function Privacy() {
  return (
    <PublicShell>
      <main className="container page prose">
        <div className="eyebrow">Seus dados, com cuidado</div>
        <h1>Privacidade no rastreamento</h1>
        <div className="notice">
          Texto operacional preliminar. Antes da publicação, o controlador deve
          validar bases legais, prazos de retenção e informar o canal oficial do
          encarregado.
        </div>
        <h2>Finalidade e dados tratados</h2>
        <p>
          O portal utiliza dados de pedidos, notas fiscais e movimentações
          logísticas para informar o andamento das entregas. O CPF/CNPJ digitado
          na consulta é usado para validar o destinatário e não é exibido no
          resultado público. A consulta não exige uma conta de cliente.
        </p>
        <h2>Acesso e compartilhamento</h2>
        <p>
          As consultas às transportadoras são executadas no servidor. A área
          administrativa é restrita a usuários autorizados. O resultado público
          apresenta apenas os dados necessários ao acompanhamento, sem
          documento, endereço completo ou valores financeiros.
        </p>
        <h2>Links e cookies</h2>
        <p>
          Links de acompanhamento são pessoais, têm prazo de validade e podem
          ser revogados. Não os compartilhe publicamente. Cookies de
          autenticação são utilizados apenas na área administrativa. Não
          utilizamos cookies de publicidade nesta implementação.
        </p>
        <h2>Retenção e direitos</h2>
        <p>
          Dados de pré-validação de planilhas são apagados pelo processo de
          manutenção após sete dias. Os prazos de retenção dos registros
          logísticos e de auditoria devem ser definidos pelo controlador
          conforme obrigações legais. Para solicitar acesso, correção ou exercer
          seus direitos, entre em contato com a First Sports pelos canais
          oficiais do site institucional.
        </p>
        <a href="https://firstsports.com.br" className="button secondary">
          Canais oficiais First Sports ↗
        </a>
      </main>
    </PublicShell>
  );
}
