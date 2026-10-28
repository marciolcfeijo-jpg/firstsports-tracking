# Vendedor / representante da remessa

A associação comercial usa os usuários já cadastrados no painel (Supabase Auth + vínculo em `AdminUser`), identificados pelo e-mail. Não cria contas ou papéis novos e não altera a visibilidade das remessas: continuam valendo as permissões existentes de ADMIN, OPERATOR e VIEWER.

- Em **Nova remessa**, ADMIN e OPERATOR podem selecionar um usuário ativo no campo opcional **Vendedor / representante**.
- Em uma remessa existente, a seleção pode ser atribuída, alterada ou removida em **Editar dados cadastrais**. O histórico de rastreamento e os links são preservados quando só o vendedor muda; a alteração fica auditada.
- Em **Remessas**, o filtro permite escolher todos, um usuário específico (inclusive inativo) ou **Sem vendedor**. Ele combina com busca, transportadora, status e datas, e é mantido na paginação e na exportação CSV.
- Remessas anteriores à atualização começam sem vendedor. A reimportação de uma NF existente continua idempotente e não muda o responsável; use a edição da remessa para reassociar.
- Um usuário desativado permanece nas associações antigas e no filtro, mas não pode ser escolhido para novas associações. Não é necessário que o vendedor tenha papel de ADMIN ou OPERATOR; atribuí-lo não concede permissões novas.
- A informação aparece apenas na administração e no CSV administrativo, não no resumo público de rastreamento.

## Publicação

A migration `202610280001_shipment_sellers` adiciona `Shipment.sellerId`, índice e vínculo opcional para `AdminUser`. Não remove dados; excluir um usuário deixa as remessas correspondentes sem vendedor. O build Production da Vercel configurado em `scripts/vercel-build.mjs` executa `db:migrate` antes de compilar a aplicação. Não publique apenas o código sem a migration. Previews que compartilham um banco ainda sem essa migration precisam de um banco isolado migrado para testar essas telas.

Validação local: `npm test -- tests/sellers.test.ts tests/seller-ui.test.ts`. Esses testes usam mocks para o acesso ao Prisma; a migration também foi exercitada em PostgreSQL isolado, verificando preservação de registros, vínculo, filtragem e exclusão do usuário. A geração do cliente Prisma/build completo deve ser confirmada no pipeline, pois o download dos binários no ambiente Codex estava bloqueado.
