# Validação executada — 24/10/2026

Aplicação criada do zero no checkout existente. Nenhum deploy, push ou alteração de DNS foi realizado.

| Verificação                                                  | Resultado                                                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Instalação congelada `npm ci`                                | Passou; lockfile reutilizado e verificações de integridade/TLS preservadas              |
| Prisma generate / schema validate                            | Passou com Prisma 6.19.3                                                                |
| PostgreSQL e migrations                                      | 4 migrations aplicadas; reaplicação sem mudanças pendentes                              |
| Seed de transportadoras                                      | Repetível; somente metadados, sem clientes/remessas de demonstração                     |
| TypeScript strict                                            | Passou                                                                                  |
| ESLint                                                       | Passou sem erros                                                                        |
| Vitest                                                       | **41 testes passaram em 6 arquivos**                                                    |
| Playwright                                                   | **6 testes passaram**, em Chromium desktop e viewport mobile                            |
| `npm run build`                                              | Passou; Next.js 16.4.3, compilação e geração das rotas concluídas                       |
| Processo `npm start`                                         | Iniciou e serviu a aplicação em modo de produção                                        |
| Página inicial em produção                                   | HTTP 200 com formulário de rastreamento                                                 |
| Consulta pública com identificadores sintéticos inexistentes | HTTP 404 genérico, consultando PostgreSQL real                                          |
| Administração sem identidade configurada                     | Acesso negado (503 explícito de configuração); não há bypass                            |
| Mutação com Origin externo                                   | HTTP 403                                                                                |
| Scheduler sem Bearer / com Bearer local válido               | 401 / 200; zero remessas elegíveis no banco de desenvolvimento                          |
| RLS e privilégios PostgreSQL                                 | Papel sem privilégios não lê remessas; papel runtime com policy explícita executa DML   |
| Navegador com build de produção                              | Desktop/mobile renderizam sem erros de JavaScript ou overflow horizontal                |
| Auditoria de dependências npm                                | Zero vulnerabilidades reportadas na árvore final, após overrides de deepmerge-ts e uuid |

## O que as suítes exercitam

- CPF/CNPJ com dígitos verificadores, datas e UF; identidade fiscal contextual.
- Leitura de XLSX/CSV, zeros à esquerda, fórmulas rejeitadas, duplicatas e limites de arquivo.
- Persistência, cadastro/edição, concorrência otimista, múltiplas NFs e remessas, auditoria.
- Links aleatórios armazenados como hash, emissão, consulta, revogação e dados públicos reduzidos.
- Quotas atômicas, autorização por papel e usuário inativo.
- Importação confirmada com relatório, redigindo dados pessoais; retomada após lease expirado.
- Normalização Braspress/Alfa com fixtures sintéticas dos campos documentados, erros de negócio, timeouts, JSON/XML, precisão temporal e status desconhecidos.
- Worker: idempotência de eventos, locks, backoff, preservação do histórico em falhas, seleção de remessas e manutenção de retenção.
- E2E: navegação pública/admin, login por fixture HTTP externa, cadastro, edição, vínculo de NF, upload/importação/reimportação, busca protegida e emissão/revogação de links.

## Limites da evidência

**Não houve login em um projeto Supabase real nem consulta autenticada às transportadoras.** A suíte E2E usa um servidor de autenticação fictício isolado nos testes, com a biblioteca Supabase e os controles de autorização reais da aplicação. Os testes de transportadoras usam respostas sintéticas; não são homologação das contas externas.

Para concluir a homologação: configurar projeto Supabase e usuário administrativo verificado, credenciais comerciais Braspress/Alfa e remessa de teste autorizada; confirmar a divergência `tomCnpj`/`cnpjTomador` da documentação Alfa e os formatos efetivamente retornados pela conta. O scheduler externo, os controles da hospedagem, a política de retenção/LGPD e o subdomínio ainda precisam ser configurados e validados conforme os guias.

O ambiente local permanece sem remessas de clientes; fixtures existem apenas nos bancos separados de teste. O servidor local de produção foi iniciado para validação interna, sem publicação ou preview público.

## Configuração reutilizável do ambiente

Foram salvos `install_script`, `start_skill`, requisitos dos dois parâmetros públicos do Supabase e os destinos de rede `api.braspress.com`, `api.alfatransportes.com.br` e `binaries.prisma.sh`. A gravação do rascunho foi confirmada. Ela não equivale à publicação do ambiente nem ao deploy do portal. Revise e salve as configurações do ambiente e publique pelo produto quando apropriado.

## Atualização — 26/10/2026: consulta por NF

A consulta pública passou a usar exclusivamente NF + CPF/CNPJ do destinatário. Ela valida o vínculo local antes de qualquer chamada à transportadora, respeita agendamento/backoff e tenta até três atualizações elegíveis. Remessas com várias notas usam a NF solicitada no conector; conflitos de série são recusados explicitamente. As respostas mostram a transportadora e preservam o histórico em falhas.

Verificações: TypeScript e lint passaram; 54 testes unitários/de integração passaram; 6 testes E2E desktop/mobile passaram no fluxo por NF; build de produção passou. As APIs externas continuam sem homologação real. Durante a validação, a restrição de rede do sandbox bloqueou o PostgreSQL local; a suíte foi reexecutada com o acesso local autorizado e passou. Nenhuma assertion foi removida.

A configuração do banco na Vercel, DOCUMENT_HMAC_KEY e as credenciais Braspress ainda precisam ser cadastradas pelo responsável. Apenas as variáveis públicas do Supabase não suprem esses requisitos. O guia docs/ativacao-braspress.md contém os passos, sem credenciais reais.

## Atualização — inicialização do banco pelo deploy

Adicionado `build:vercel` e configuração versionada da Vercel. Verificado com um PostgreSQL local isolado e inicialmente vazio: quatro migrations aplicadas, duas transportadoras desabilitadas cadastradas, zero remessas e zero administradores criados; build Next.js concluído. A reaplicação das migrations terminou sem pendências. TypeScript, lint e revisão de whitespace passaram.

Esse teste não utilizou o Supabase do responsável. A conexão e as migrations nesse banco serão verificadas pelos Build Logs do próximo deploy de Production. O script não imprime os valores de DATABASE_URL ou DOCUMENT_HMAC_KEY.
