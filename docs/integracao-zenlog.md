# Integração First Sports e ZenLOG

O ZenLOG é a fonte central da operação. No portal interno, o backoffice acompanha todos os pedidos da criação à entrega. Vendedores e representantes usam o perfil **Vendedor / representante · própria carteira** e acompanham apenas os pedidos e as remessas atribuídos a eles. No portal externo, clientes e parceiros consultam a NF com CPF/CNPJ do destinatário ou um link de rastreio autorizado. O histórico interno do pedido fica no painel autenticado.

## Consulta de expedição disponível para homologação

Na ficha de um pedido, administradores e operadores podem consultar eventos de processamento do ZenLOG pelo número do pedido. A plataforma autentica via `POST /api/TokenAuth/AuthenticatePAT` e consulta `GET /api/services/app/Expedicao/GetEventosExpedicao`. No PDF, a autenticação está na página 4 e os eventos de expedição começam na página 45. Os códigos A, E e S representam alerta, erro e sucesso de processamento no operador logístico.

Configure as variáveis abaixo exclusivamente no servidor de **Preview** do Vercel, com dados e uma instalação de homologação.

| Variável | Valor |
| --- | --- |
| `ZENLOG_API_ORIGIN` | Origem HTTPS sem caminho, confirmada pelo operador |
| `ZENLOG_TENANCY_NAME` | Instalação (subdomínio) do operador no ZenLOG |
| `ZENLOG_PAT` | Chave de acesso pessoal de homologação, cadastrada como segredo |
| `ZENLOG_OPERATOR_DOCUMENT` | CPF/CNPJ do operador logístico |
| `ZENLOG_DEPOSITOR_DOCUMENT` | CPF/CNPJ do depositante |

A operação consulta um pedido conhecido e exibe eventos da expedição. Nenhuma consulta altera o ZenLOG ou registra entrega automaticamente. Homologue o formato de resposta e o vínculo entre o número do pedido da First Sports e o número da expedição antes de habilitar em produção. Se houver pedidos com número repetido por destinatário, é necessário confirmar com o operador uma identidade de consulta mais específica, como o código da expedição.

## Sincronização automática a homologar

A documentação cobre o envio do pedido de expedição, a atribuição da NF ao pedido, a consulta de eventos e a confirmação de mercadoria na doca. A confirmação de doca sinaliza disponibilidade para expedição. A confirmação de entrega precisa vir de um evento de entrega reconhecido ou da integração da transportadora.

Para alimentar pedidos e NFs novos automaticamente no portal, solicite ao ZenLOG o endpoint que lista registros novos e alterados com paginação e cursor, ou um webhook autenticado para criação, atualização, faturamento e cancelamento. A documentação recebida descreve consultas por referência conhecida, e o envio ou a atribuição de uma NF é uma operação de escrita no ZenLOG.

O contrato do feed deve incluir um identificador estável do pedido, sua data e etapa, destinatário e vendedor, além de CNPJ emitente, série, número e data da NF depois da emissão. Confirme como a transportadora é identificada e obtenha respostas de homologação para pedido sem NF, faturamento, reprocessamento, cancelamento, expedição e entrega. A importação manual continua sendo a entrada de dados disponível enquanto esse feed é homologado.
