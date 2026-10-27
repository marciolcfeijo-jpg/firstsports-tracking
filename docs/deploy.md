# Publicação de homologação e produção

O portal já foi conectado à Vercel pelo responsável. Este guia também permite preparar outros ambientes Node.js 22/24 com PostgreSQL e Supabase Auth. A classificação Production da Vercel refere-se à branch principal; a homologação comercial das transportadoras continua separada. O domínio institucional não é alterado por este procedimento.

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

## Inicialização automática na Vercel

`vercel.json` define instalação congelada com as ferramentas de build e `npm run build:vercel`. Em deploys com `VERCEL_ENV=production`, esse comando valida a presença/formato de DATABASE_URL e DOCUMENT_HMAC_KEY, gera o Prisma Client, aplica migrations pendentes, cadastra as transportadoras de forma idempotente e executa o build Next.js. Um erro de configuração ou conexão interrompe o deploy e aparece nos Build Logs; o código não imprime os valores secretos.

O comando utiliza o DATABASE_URL de Production configurado pelo responsável. As credenciais dessa conexão precisam permitir migrations durante esta preparação; para separar as credenciais de migration e runtime em produção definitiva, adote o procedimento de privilégio mínimo descrito acima e execute migrations no pipeline dedicado. Antes de futuras migrations em banco com dados reais, revise o SQL e os backups.

Migrations automáticas não são executadas nos deploys Preview/Development. Esses ambientes exigem banco isolado e preparação explícita. O seed cria apenas Braspress e Alfa, inicialmente desabilitadas, e preserva os estados já configurados; não cria clientes, encomendas ou administradores. Um deploy Ready confirma que os passos de inicialização terminaram, mas a autenticação real e a integração Braspress ainda precisam ser homologadas.

Se houver Build Command ou Install Command substituído manualmente nas configurações da Vercel, desative o Override para usar vercel.json, ou ajuste os comandos para `npm run build:vercel` e `npm ci --include=dev`.

## Agendamento automático na Vercel

`vercel.json` agenda GET `/api/internal/sync` diariamente às 09:00 UTC (06:00 em Brasília). A Vercel Hobby pode iniciar a execução em qualquer momento da hora agendada. O cron roda apenas em Production e exige `CRON_SECRET` com pelo menos 32 caracteres, cadastrado como Secret na Vercel antes de um novo deploy. A Vercel envia esse valor no cabeçalho Authorization Bearer; sem ele a rota recusa a execução. Não usar DOCUMENT_HMAC_KEY como segredo do cron.

Cada execução processa até 10 remessas elegíveis, preservando os limites e o backoff existentes. Considera somente transportadoras habilitadas e remessas ainda abertas; entregues, devolvidas e canceladas não são consultadas automaticamente. A consulta pública também pode atualizar uma remessa elegível, e a atualização manual permanece disponível. Cron não significa atualização instantânea do navegador.

Verificação após deploy: Settings → Cron Jobs, confirmar o job ativo e consultar os logs da execução. A configuração no código não comprova que o job rodou. Para frequências inferiores a um dia, confirmar um plano Vercel que suporte a frequência e ajustar o cron, ou configurar um scheduler externo autenticado via POST conforme descrito acima. Para mais de 10 remessas pendentes por dia, ampliar a estratégia de lotes e frequência antes de considerar o acompanhamento automático suficiente.
