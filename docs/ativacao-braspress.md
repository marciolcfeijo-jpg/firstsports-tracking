# Ativar a consulta por NF e CPF/CNPJ

## Fluxo implementado

O cliente informa o número da NF e o documento completo do destinatário. O servidor valida esse vínculo no cadastro local e identifica a transportadora automaticamente. O documento do destinatário não é usado como tomador do frete nem enviado indiscriminadamente às APIs.

Para remessas autorizadas, abertas e com atualização vencida, o portal tenta uma atualização pela API antes de emitir o link. Ele respeita a janela de retentativa e os locks, limita a três atualizações por consulta pública e mantém o último histórico real em caso de falha. As demais remessas continuam na fila do worker. A consulta pública não revela se uma NF pertence a outro destinatário.

O pedido comercial continua disponível na administração. A consulta pública padrão usa a NF; links seguros já emitidos continuam válidos.

## Variáveis na Vercel

Mantenha todas no ambiente correto do deploy, normalmente Production:

| Nome                                 | Tipo   | Uso                                                                                                |
| ------------------------------------ | ------ | -------------------------------------------------------------------------------------------------- |
| NEXT_PUBLIC_SUPABASE_URL             | Config | URL do projeto para autenticação                                                                   |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Config | Chave publicável da autenticação                                                                   |
| APP_URL                              | Config | Endereço HTTPS fixo do portal                                                                      |
| DATABASE_URL                         | Secret | Conexão PostgreSQL; não é a URL https://...supabase.co nem uma API key                             |
| DOCUMENT_HMAC_KEY                    | Secret | Chave aleatória e estável, com pelo menos 32 caracteres, para proteger o documento do destinatário |
| BRASPRESS_USERNAME                   | Secret | Usuário da API de integração                                                                       |
| BRASPRESS_PASSWORD                   | Secret | Senha da API de integração                                                                         |
| CRON_SECRET                          | Secret | Chave aleatória independente para o scheduler externo                                              |

Não coloque valores secretos no GitHub, em chat ou em capturas de tela. Não use uma chave publicável como DOCUMENT_HMAC_KEY. Depois de importar clientes, não altere a chave HMAC sem um plano de migração.

## Banco e primeiro administrador

No Supabase, Connect → Connection String apresenta a conexão PostgreSQL. Para hospedagem que precisa de IPv4, escolha Session pooler e substitua o marcador de senha pela senha do banco (não a senha da conta Supabase). Copie os parâmetros exatos do projeto. Preserve TLS e as exigências do provedor. Cadastre a conexão como DATABASE_URL na Vercel.

Aplicar as migrations e cadastrar apenas as transportadoras não insere pedidos reais. Com as variáveis configuradas no servidor, execute `npm run db:migrate` e `npm run db:seed`, conforme docs/deploy.md. Caso a Vercel seja o único lugar com acesso seguro à conexão de homologação, o responsável pode configurar temporariamente o Build Command como `npm run db:migrate && npm run db:seed && npm run build` e realizar um novo deploy após revisar o banco de destino. Esse comando cria/atualiza as tabelas do portal; não deve ser apontado para um banco desconhecido.

Crie um usuário confirmado em Supabase → Authentication → Users. Vincule o UUID desse usuário como ADMIN seguindo README.md; a conta do painel Supabase não equivale a um usuário do portal.

## Teste real autorizado

1. Cadastre/importe uma remessa autorizada, com número e série da NF, CNPJ do emitente, CPF/CNPJ do destinatário e Braspress.
2. Informe o CNPJ do tomador do frete: a API Braspress v3 usa esse CNPJ na busca. Não presumir que seja o destinatário.
3. Habilite Braspress na administração, depois de revisar as credenciais da conta.
4. Consulte a NF e o documento na página inicial. A primeira consulta elegível tentará sincronizar; consulte os logs na remessa e compare o resultado com a transportadora.
5. Confirme a janela histórica de 90 dias e os limites de consulta contratados. Execute o scheduler para continuar atualizando independentemente de visitas ao portal.

Até executar esse teste com credenciais reais no ambiente de homologação, a integração permanece implementada e testada com fixtures, mas não homologada. Configurar somente as duas variáveis públicas do Supabase não prepara o banco nem habilita a Braspress.
