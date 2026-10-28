# Atualização de rastreamento em massa

Na lista Remessas, ADMIN e OPERATOR podem clicar em Atualizar pendentes em massa. A ação abrange todas as remessas elegíveis, independentemente dos filtros/página da lista. VIEWER não tem acesso ao botão nem à API de escrita.

Ordem: **data de emissão da NF mais antiga primeiro**, com desempate pela data de cadastro e ID da remessa. A mesma prioridade é usada pelo worker agendado. O número da NF não é usado como data, pois pode repetir entre emitentes/séries.

Elegibilidade: transportadora habilitada, status diferente de DELIVERED/RETURNED/CANCELLED e nextSyncAt vencido no início do lote. A seleção respeita os intervalos de retentativa já existentes. Registros com consulta ativa são aguardados, sem penalizar a remessa por concorrência. Novas pendências posteriores à data de corte ficam para uma próxima execução.

Cada requisição processa até três remessas, sequencialmente, com intervalo de um segundo entre consultas (e os intervalos adicionais do conector, como Icaro). Depois de 60 segundos a rodada não inicia outra consulta, reservando tempo para encerrar a chamada já iniciada e gravar o progresso antes do limite da rota. A fila continua na próxima requisição. O navegador envia o próximo lote após concluir o anterior. Mantenha a página aberta; Parar após este lote não aborta uma chamada externa em andamento. Fechar/navegar interrompe o encadeamento no navegador, e o progresso é persistido para retomar. Não é um worker de fundo nem substitui o cron diário.

A tabela privada BulkSync mantém a execução compartilhada e um lease de 180 segundos, superior ao limite de 120 segundos da rota. Dois operadores não processam lotes em paralelo. Há também os bloqueios existentes por remessa e transportadora, inclusive contra cron e atualização individual. A fila revalida elegibilidade ao reivindicar a remessa, para não repetir uma consulta recém-concluída por outro processo.

A atualização usa syncShipment e os adaptadores existentes, preservando normalização, deduplicação e último histórico em falhas. CARRIER_BUSY não aumenta falhas nem altera o backoff da remessa, tanto na fila quanto na consulta individual. A consulta individual devolve HTTP 409 com orientação para aguardar. Falhas de autenticação, limite de chamadas, rede/timeout ou contrato de resposta suspendem as demais consultas à transportadora afetada neste lote, enquanto outras transportadoras podem continuar. Motivos são exibidos sem credenciais ou payload bruto. Não se desabilita permanentemente a transportadora nem se muda seu contrato de API. Antes de iniciar outro lote, conferir o motivo e corrigir a configuração ou aguardar o limite comercial.

O resumo separa consultas realizadas, atualizadas com sucesso, consultas com erro e remessas ainda na fila. Havendo remessas suspensas, o lote fica **pausado**, em vez de ser apresentado como totalmente encerrado. A quantidade inicial é histórica e pode diferir de tentativas + fila atual quando outros processos já atualizaram remessas. Uma remessa concluída por outro processo ou alterada durante o lote pode deixar de ser elegível sem contar como tentativa desta execução. Os registros BULK_SYNC_START/CHUNK/PAUSE são auditados.

API administrativa: GET/POST `/api/admin/shipments/sync-pending`, sem cache, sessão Supabase verificada; POST exige origem autorizada e ADMIN/OPERATOR. Inícios de lote têm limite adicional de três por minuto por operador. BulkSync usa RLS e revoga acesso de PUBLIC/anon/authenticated; ambientes com papel PostgreSQL dedicado devem aplicar a política/grant de scripts/grant-runtime.sql à nova tabela.

## Retomar transportadoras suspensas

Após corrigir credenciais, configuração ou contrato de resposta, use **Retestar transportadoras suspensas**. A ação é explícita, autorizada a ADMIN/OPERATOR, protegida por origem e limitada a três por minuto. Ela remove somente as suspensões deste lote e continua a mesma execução; preserva totais, sucessos, falhas já registradas, locks e `nextSyncAt` de cada remessa. Não antecipa retentativas nem reabre entregas concluídas.

Se a integração voltar a falhar, a transportadora é suspensa novamente pelas regras existentes. Remessas de outras transportadoras continuam elegíveis. Não há retry infinito automático de uma API com problema. Lotes antigos marcados como encerrados, mas com pendências suspensas, também podem ser retestados sem apagar o histórico. A ação gera auditoria `BULK_SYNC_RETRY_CARRIERS`.

A prioridade por emissão não corrige dados inválidos ou incompatibilidades de API. A Braspress documenta uma janela de consulta de 90 dias da emissão do conhecimento; ordenar NFs antigas não amplia esse limite. Não excluímos automaticamente uma remessa com base apenas na data da NF, porque ela não é necessariamente a data do conhecimento.
