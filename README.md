# First Sports Tracking

Portal full-stack de rastreamento em português brasileiro. **Ainda requer homologação externa e revisão operacional antes de produção.** Não há clientes nem rastreamentos fictícios no banco de desenvolvimento; as transportadoras começam desabilitadas.

## Arquitetura

- Next.js 16 App Router, React 19, TypeScript strict e Tailwind 4. Componentes pequenos com HTML semântico e Lucide; não foi necessário instalar todo o catálogo shadcn/ui.
- PostgreSQL 16 + Prisma 6: clientes, pedidos, remessas, notas fiscais, eventos, importações, permissões, auditoria, links e locks.
- Supabase Auth por cookies HTTP, identidade validada com `getUser()` no servidor e autorização adicional por papel no PostgreSQL. Sem senha administrativa local nem bypass de demonstração.
- CPF/CNPJ do destinatário é validado e transformado em HMAC determinístico no servidor; não persistimos o documento original do destinatário. Dados de emitente/tomador necessários às transportadoras ficam apenas na área restrita.
- ExcelJS para XLSX/CSV; prévia persistida antes da confirmação, identidade fiscal emitente+série+número e constraint no banco.
- Adaptadores Braspress v3 e Alfa v1.2 exclusivamente no servidor. Worker com locks, deduplicação, backoff e logs sem respostas brutas de clientes.
- Datas persistidas em UTC e apresentadas em America/Sao_Paulo.

## Rodar localmente

Pré-requisitos: Node.js 22 ou 24, npm, Docker Compose ou PostgreSQL 16.

```sh
npm ci
cp .env.example .env
# Edite .env. Gere DOCUMENT_HMAC_KEY e CRON_SECRET separadamente:
openssl rand -hex 32
# Não reutilize uma chave entre ambientes.
# Defina POSTGRES_PASSWORD no shell e configure DATABASE_URL com o mesmo usuário/senha.
docker compose up -d db
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Os placeholders CHANGE_ME não são credenciais utilizáveis. O Compose exige senha e usa o usuário `firstsports`: ajuste as URLs de acordo. Não use `trust` nem usuário superuser em produção.

`db:seed` cadastra apenas as duas transportadoras desabilitadas, é repetível e não sobrescreve configurações existentes. Nunca rode fixtures de teste no banco de clientes.

## Preparação automática deste ambiente isolado

`npm run db:local` cria um PostgreSQL Docker local com senha aleatória e bancos de teste separados. Se `.env` não existir, cria chaves locais e URLs apenas de desenvolvimento, com permissão 0600. Não sobrescreve configurações existentes, não insere clientes fictícios e não acessa bancos externos. Depois execute `npm run db:migrate` e `npm run db:seed`. Não combine esse helper com o serviço Compose na mesma porta.

## Autenticação administrativa

1. Crie um projeto Supabase e habilite login por e-mail/senha; desabilite cadastro público se não for necessário. Configure e-mails e MFA conforme a política da organização.
2. Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. A chave publicável não é `service_role`.
3. Crie um usuário no Supabase Auth e verifique o e-mail.
4. Execute `npm run admin:bootstrap -- UUID_DO_USUARIO email@empresa.com.br` com acesso seguro ao banco.
5. Faça login em `/admin/login`. Os próximos usuários são vinculados por um ADMIN em `/admin/usuarios`.

A identidade é gerenciada no Supabase. O UUID deve corresponder ao usuário real. Remover o vínculo ou desativá-lo bloqueia o acesso imediatamente no servidor.

## Verificação

Crie bancos separados terminados em `_test` (os testes recusam outro sufixo):

```sh
# Com seu cliente PostgreSQL, crie firstsports_test e firstsports_e2e_test.
TEST_DATABASE_URL=postgresql://.../firstsports_test DATABASE_URL=postgresql://.../firstsports_test npm run db:migrate
npm run typecheck
npm run lint
TEST_DATABASE_URL=postgresql://.../firstsports_test npm test
E2E_DATABASE_URL=postgresql://.../firstsports_e2e_test npm run test:e2e
npm run build
npm start
```

Playwright usa `/usr/bin/chromium` neste ambiente. Para outra instalação, defina `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. A suíte E2E inicia uma **fixture HTTP de Supabase exclusiva dos testes**; ela não é carregada pela aplicação de produção nem substitui a validação real do seu projeto Supabase. Os bancos de teste são truncados. Não aponte esses comandos para dados reais.

## Acompanhamento de pedidos

1. No painel, abra **Pedidos → Importar pedidos** e baixe o modelo Excel ou CSV. Os campos básicos são `numero_pedido`, `cpf_cnpj_destinatario`, `nome_cliente`, `cidade_destino` e `uf_destino`. Informe `data_emissao_pedido` no formato AAAA-MM-DD e, se disponível, o e-mail do vendedor cadastrado em `email_vendedor`. Use células de texto para preservar zeros à esquerda.
2. Antes do faturamento, deixe as colunas fiscais e de transporte vazias. Se já houver NF, use uma linha por nota com número, série, CNPJ do remetente, transportadora e `data_emissao_nf`. O CNPJ do tomador, a chave da NF, o e-mail do cliente e o CT-e são opcionais. O código de rastreio é obrigatório para Correios. O lote é gravado de forma atômica e indica linhas com erro. Reimportar a mesma NF preserva o rastreamento e a etapa já registrados.
3. Abra o pedido para avançar de **Recebido** para **Em preparação** e **Pronto para faturar**. A partir do cadastro de uma remessa com o mesmo pedido e CPF/CNPJ, o acompanhamento incorpora os estados das transportadoras. Em pedidos com mais de uma remessa cadastrada, o status considera o conjunto.
4. No portal, acesse **Consultar por número do pedido** e informe também o CPF/CNPJ do destinatário. A consulta por pedido lê os dados já registrados no sistema. A sincronização segue o fluxo de rastreamento das remessas.

Para validar na Vercel Preview, aplique as migrações em um banco isolado de Preview antes de testar o fluxo. Em Production, o comando `build:vercel` usa a conexão de migração do ambiente conforme descrito no guia de deploy.

## Guias

- [Ativar consulta por NF e Braspress](docs/ativacao-braspress.md)
- [API interna](docs/api.md)
- [Importação Excel/CSV](docs/importacao.md)
- [Braspress](docs/braspress.md) e [Alfa](docs/alfa.md)
- [Icaro ESL Cloud](docs/icaro.md)
- [Vendedores e representantes nas remessas](docs/vendedores.md)
- [Operações administrativas](docs/operacoes.md)
- [Deploy, DNS, backup e rollback](docs/deploy.md)
- [Decisões arquiteturais](docs/arquitetura.md)
- [Checklist de homologação](docs/homologacao.md)

Não publique automaticamente, não altere o DNS do domínio principal e não habilite consultas reais antes de configurar credenciais e homologar uma remessa autorizada.
