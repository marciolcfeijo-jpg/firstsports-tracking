import { PublicShell } from "@/components/public-shell";
export default function Help() {
  return (
    <PublicShell>
      <main className="container page prose">
        <div className="eyebrow">Central de ajuda</div>
        <h1>Vamos acompanhar sua entrega</h1>
        {[
          [
            "Onde encontro o número do pedido?",
            "Consulte a confirmação de compra enviada pela First Sports ou utilize o número da nota fiscal. Informe também o CPF/CNPJ do destinatário cadastrado no pedido.",
          ],
          [
            "Preciso escolher a transportadora?",
            "Não. A transportadora é identificada automaticamente no cadastro da remessa.",
          ],
          [
            "Minha consulta não foi validada",
            "Confira o pedido e o documento do destinatário. Caso os dados continuem sem validação, entre em contato com o atendimento pelos canais disponíveis no site institucional e solicite um link seguro.",
          ],
          [
            "O rastreamento ainda não foi atualizado",
            "As informações dependem dos registros da transportadora. O portal sempre mostra o horário da última atualização e não cria previsões ou movimentações.",
          ],
          [
            "Meu pedido tem mais de uma entrega",
            "Cada remessa tem seu próprio acompanhamento. Uma entrega concluída não significa que as demais foram entregues.",
          ],
          [
            "Meu link expirou",
            "Solicite um novo link à First Sports. Por segurança, os links podem expirar ou ser revogados.",
          ],
        ].map(([q, a]) => (
          <section key={q}>
            <h2>{q}</h2>
            <p>{a}</p>
          </section>
        ))}
        <a className="button" href="https://firstsports.com.br">
          Acessar site institucional
        </a>
      </main>
    </PublicShell>
  );
}
