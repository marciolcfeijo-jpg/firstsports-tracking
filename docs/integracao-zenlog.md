# Integração First Sports e ZenLOG

O ZenLOG é a fonte central da operação. No portal interno, o backoffice acompanha todos os pedidos da criação à entrega. Vendedores e representantes usam o perfil **Vendedor / representante · própria carteira** e acompanham apenas os pedidos e as remessas atribuídos a eles. No portal externo, clientes e parceiros consultam a NF com CPF/CNPJ do destinatário ou um link de rastreio autorizado. O histórico interno do pedido fica no painel autenticado.

## Consulta de expedição

Na ficha de um pedido, administradores e operadores podem consultar eventos de processamento do ZenLOG pelo número do pedido. A plataforma autentica via `POST /api/TokenAuth/AuthenticatePAT` e consulta `GET /api/services/app/Expedicao/GetEventosExpedicao`. No PDF, a autenticação está na página 4 e os eventos de expedição começam na página 45. Os códigos A, E e S representam alerta, erro e sucesso de processamento no operador logístico.

Configure as variáveis no ambiente da Vercel correspondente à instalação e ao PAT do ZenLOG.

| Variável                    | Valor                                              |
| --------------------------- | -------------------------------------------------- |
| `ZENLOG_API_ORIGIN`         | Origem HTTPS sem caminho, confirmada pelo operador |
| `ZENLOG_TENANCY_NAME`       | Instalação (subdomínio) do operador no ZenLOG      |
| `ZENLOG_PAT`                | Chave de acesso pessoal cadastrada como segredo    |
| `ZENLOG_OPERATOR_DOCUMENT`  | CPF/CNPJ do operador logístico                     |
| `ZENLOG_DEPOSITOR_DOCUMENT` | CPF/CNPJ do depositante                            |

A operação consulta um pedido conhecido e exibe eventos da expedição. Nenhuma consulta altera o ZenLOG ou registra entrega automaticamente. Homologue o formato de resposta e o vínculo entre o número do pedido da First Sports e o número da expedição antes de habilitar em produção. Se houver pedidos com número repetido por destinatário, é necessário confirmar com o operador uma identidade de consulta mais específica, como o código da expedição.

## Sincronização diária

A Vercel chama `/api/internal/zenlog-sync` diariamente às 08:00 UTC (05:00 em Brasília), usando o mesmo `CRON_SECRET` do agendamento das transportadoras. No plano Hobby, a execução pode começar em qualquer momento da hora agendada.

A rotina consulta o `Expedicao/GetAll` em páginas de 10, percorre os registros em ordem crescente de ID e reaproveita a mesma sessão ZenLOG. Quando a execução termina por limite de tempo ou por erro, a próxima chamada retoma a última página ainda pendente. Ao concluir a varredura, a próxima execução diária recomeça pela primeira página. Os logs da Vercel mostram se o processamento terminou ou ficou parcial e os totais de cada execução.

A rotina faz uma varredura paginada. Antes de trocar para consultas incrementais, confirme em homologação se o vínculo de uma NF atualiza o filtro `DataAtualizacaoRegistro`. A importação manual continua disponível no painel.

## Importar pedidos, notas e status

No painel administrativo, abra **Pedidos → Prévia ZenLOG**, consulte um pedido ou uma página e clique em **Importar pedido** ou **Importar esta página**. A importação usa o número e o destinatário para reaproveitar pedidos e a chave ou a identificação fiscal para conferir o vínculo das notas. Repetir a página atualiza os status da expedição.

A ficha interna exibe os códigos de situação da expedição, do documento e da integração e os eventos com suas datas. Valores, produtos e observações livres ficam fora do portal. O vendedor ou representante permanece vinculado ao cadastro existente. Quando o ZenLOG informa o e-mail em um atributo explícito de vendedor ou representante, o portal pode preencher o vínculo vazio com uma conta de vendas ativa.

Quando o ZenLOG envia a transportadora por CNPJ, a variável opcional `ZENLOG_CARRIER_CODES` permite associá-lo ao código já cadastrado no portal. Use pares no formato `CNPJ_SEM_PONTUACAO=CODIGO`, separados por vírgula. Se a transportadora não for identificada, a NF ainda é vinculada. O rastreio fica pendente até o backoffice corrigir a transportadora da remessa.
