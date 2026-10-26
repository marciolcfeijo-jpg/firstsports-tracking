# Publicação de homologação e produção

A aplicação não foi publicada e nenhum DNS foi alterado. Escolha uma hospedagem Node.js 22/24 (container/VPS ou Vercel), PostgreSQL gerenciado e Supabase Auth. Publique primeiro em homologação com banco/usuários/secrets próprios.

## Preparação

1. Faça `npm ci`, `npm run db:generate` e configure as variáveis da `.env.example` no gerenciador seguro da hospedagem. `APP_URL` deve ser a origem exata HTTPS, sem caminho. Gere DOCUMENT_HMAC_KEY e CRON_SECRET com 32 bytes aleatórios, distintos por ambiente.
2. Provisionar PostgreSQL com TLS verificado e credenciais mínimas. A URL pode incluir opções TLS exigidas pelo provedor; não desabilite validação de certificado. Um usuário de migração recebe DDL; a aplicação recebe apenas SELECT/INSERT/UPDATE/DELETE nas tabelas necessárias. Revogue privilégios de `PUBLIC`. Não exponha PostgreSQL na Internet.
3. Se o banco estiver no Supabase, **desabilite a Data API/exposição do schema da aplicação ou habilite RLS sem policies públicas** para todas as tabelas. Prisma usa conexão privilegiada do servidor; nunca forneça essa URL ao frontend. Separar o banco da aplicação do banco Auth também é suportado.
4. Configure Supabase Auth URL/key publicável e primeiro administrador pelo procedimento do README. Desabilite signup público, configure política de senha/MFA e recuperação de acesso no projeto.
5. Execute `npm run db:migrate` e `npm run db:seed`. Faça backup antes de migrations em banco existente. O seed não cria pessoas nem rastreamentos.
6. Execute typecheck, lint, testes com bancos separados e build. Não execute os testes destrutivos contra produção.
7. Build: `npm run build`. Processo web: `npm start` com `PORT` fornecida pelo ambiente. Health/readiness: faça requisição à página inicial e uma consulta autorizada no banco, não apenas teste de porta.
8. Configure credenciais das transportadoras no servidor e homologue os contratos com uma remessa autorizada antes de habilitar sincronização. Não injete credenciais Basic como um placeholder de proxy se o código precisa codificar usuário/senha: use secrets reais do runtime do provedor. `ALFA_API_KEY` também é enviado no corpo conforme contrato.

## Rede, domínio e TLS

Egress: `registry.npmjs.org`, `binaries.prisma.sh` na instalação; host PostgreSQL e projeto Supabase; `api.braspress.com` e `api.alfatransportes.com.br` em runtime. O navegador pode abrir comprovante autorizado em `areadocliente.alfatransportes.com.br`.

No provedor de hospedagem, adicione **somente** `rastreio.firstsports.com.br`. Copie os registros DNS exatos apresentados pelo provedor e peça ao administrador do DNS para criar os registros desse subdomínio. **Não invente IP/CNAME, não substitua registros existentes e não altere o domínio raiz ou o site institucional.** Aguarde validação, ative certificado gerenciado e redirecionamento obrigatório HTTP→HTTPS na borda. HSTS é enviado no modo de produção. Garanta `APP_URL=https://rastreio.firstsports.com.br`.

Na borda, limite uploads a 6 MB, timeout compatível e WAF/rate limiting por IP confiável. Os quotas da aplicação são globais/por documento porque cabeçalhos de IP sem uma borda confiável podem ser forjados. Configure logs para redigir caminhos `/rastreio/*`, tokens, cookies, senhas e documentos. Desabilite analytics nas páginas de rastreamento.

## Scheduler

Em VPS, configure cron a cada cinco minutos com diretório e secrets via gerenciador de runtime, por exemplo `/caminho/app && npm run worker` em um serviço/cron apropriado. Não coloque secrets no crontab público ou no repositório. Em nuvem/serverless, configure scheduler externo para POST `/api/internal/sync` com Authorization Bearer e um limite máximo de execução de 300 segundos; o lote de 10 chamadas de até 15 s pode exceder limites menores. Ajuste o tamanho do lote ou use o worker em execução própria para essa infraestrutura. A manutenção de retenção também depende dessa execução.

## Backup e rollback

Habilite backups cifrados diários, retenção e recuperação pontual conforme política aprovada. Inclua cópia segura de DOCUMENT_HMAC_KEY e dos demais secrets no cofre do provedor. Faça teste de restauração em banco isolado e verifique uma consulta, os vínculos fiscais, o histórico e permissões.

Antes de deploy, registre versão/artefato e faça backup. Em falha, interrompa o scheduler, retorne ao artefato anterior compatível com o schema e valide leitura/autenticação antes de reativar. Migrations não têm rollback destrutivo automático: mudanças incompatíveis exigem plano revisado ou restauração coordenada para evitar perda de entregas/importações recentes.

Após homologação, confirme política de privacidade e canal do encarregado, retenção, acesso a comprovantes, observabilidade e carga contratada por transportadora. A publicação é uma ação explícita do responsável, nunca automática nesta tarefa.

## RLS e usuário de runtime

A migration `private_tables` habilita RLS sem políticas públicas e revoga privilégios de PUBLIC, anon e authenticated quando esses papéis existem. O proprietário de migrations continua acessando as tabelas pelo servidor. Para usar uma conexão de runtime sem ownership, crie um papel LOGIN dedicado pelo gerenciador seguro do PostgreSQL e execute `scripts/grant-runtime.sql` como proprietário, informando `-v runtime_role=nome_do_papel`. O script concede somente DML e uma policy específica para esse papel. Não use anon/authenticated como papel de runtime. A URL privilegiada de migrations é usada apenas no deploy; a aplicação recebe a URL do papel restrito. Não execute novamente a criação de policies já existentes sem revisão.
