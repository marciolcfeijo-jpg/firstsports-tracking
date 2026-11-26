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

## Sincronização automática a homologar

A documentação cobre o envio do pedido de expedição, a atribuição da NF ao pedido, a consulta de eventos e a confirmação de mercadoria na doca. A confirmação de doca sinaliza disponibilidade para expedição. A confirmação de entrega precisa vir de um evento de entrega reconhecido ou da integração da transportadora.

O endpoint `Expedicao/GetAll` oferece paginação e o filtro `DataAtualizacaoRegistro`. Antes de agendar a sincronização, confirme em homologação se o vínculo de uma NF atualiza esse campo e qual é a ordenação estável para percorrer as páginas. Enquanto isso, o painel permite importar manualmente por pedido ou página.

## Importar pedidos, notas e status

No painel administrativo, abra **Pedidos → Prévia ZenLOG**, consulte um pedido ou uma página e clique em **Importar pedido** ou **Importar esta página**. A importação usa o número e o destinatário para reaproveitar pedidos e a chave ou a identificação fiscal para conferir o vínculo das notas. Repetir a página atualiza os status da expedição.

A ficha interna exibe os códigos de situação da expedição, do documento e da integração e os eventos com suas datas. Valores, produtos e observações livres ficam fora do portal. O vendedor ou representante permanece vinculado ao cadastro existente. Quando o ZenLOG informa o e-mail em um atributo explícito de vendedor ou representante, o portal pode preencher o vínculo vazio com uma conta de vendas ativa.

No painel, administradores podem cadastrar o CNPJ informado pelo ZenLOG em **Transportadoras → Salvar CNPJ**. A importação procura primeiro pelo cadastro do portal. Como alternativa, a variável opcional `ZENLOG_CARRIER_CODES` permite associá-lo ao código já cadastrado no portal. Use pares no formato `CNPJ_SEM_PONTUACAO=CODIGO`, separados por vírgula. Se a transportadora não for identificada, a NF ainda é vinculada. O rastreio fica pendente até o backoffice corrigir a transportadora da remessa.

Ao reimportar a mesma NF, o portal completa dados ausentes de cliente, destino e remessa e preserva vínculos e informações já preenchidos. Os campos de e-mail do destinatário, CNPJ do tomador, CT-e e previsão de entrega são aceitos como atributos do documento com rótulos explícitos, por exemplo `E-mail do cliente`, `CNPJ do tomador`, `Número do CT-e` e `Previsão de entrega`. Cidade e UF vêm de `enderecoCustomizado` ou dos atributos de destino. O código de objeto é usado nas remessas Correios. Quando o ZenLOG não traz esses dados, a previsão e o CT-e podem ser completados pela transportadora, conforme o conector. O CPF/CNPJ do destinatário é armazenado como hash e o campo de correção da ficha fica vazio.
