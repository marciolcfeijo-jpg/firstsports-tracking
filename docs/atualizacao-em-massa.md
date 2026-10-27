# Atualização de rastreamento em massa

Na lista Remessas, ADMIN e OPERATOR podem clicar em Atualizar pendentes em massa. A ação abrange todas as remessas elegíveis, independentemente dos filtros/página da lista. VIEWER não tem acesso ao botão nem à API de escrita.

Elegibilidade: transportadora habilitada, status diferente de DELIVERED/RETURNED/CANCELLED e nextSyncAt vencido no início do lote. A seleção respeita os intervalos de retentativa já existentes. Registros com consulta ativa são aguardados, sem penalizar a remessa por concorrência. Novas pendências posteriores à data de corte ficam para uma próxima execução.

Cada requisição processa até três remessas, sequencialmente, com intervalo de um segundo entre consultas. O navegador envia o próximo lote após concluir o anterior. Mantenha a página aberta; Parar após este lote não aborta uma chamada externa em andamento. Fechar/navegar interrompe o encadeamento no navegador, e o progresso é persistido para retomar. Não é um worker de fundo nem substitui o cron diário.

A tabela privada BulkSync mantém a execução compartilhada e um lease de 180 segundos, superior ao limite de 120 segundos da rota. Dois operadores não processam lotes em paralelo. Há também os bloqueios existentes por remessa e transportadora, inclusive contra cron e atualização individual. A fila revalida elegibilidade ao reivindicar a remessa, para não repetir uma consulta recém-concluída por outro processo.

A atualização usa syncShipment e os adaptadores existentes, preservando normalização, deduplicação e último histórico em falhas. CARRIER_BUSY não aumenta falhas nem altera o backoff da remessa, tanto na fila quanto na consulta individual. A consulta individual devolve HTTP 409 com orientação para aguardar. Falhas de autenticação, limite de chamadas, rede/timeout ou contrato de resposta suspendem as demais consultas à transportadora afetada neste lote, enquanto outras transportadoras podem continuar. Motivos são exibidos sem credenciais ou payload bruto. Não se desabilita permanentemente a transportadora nem se muda seu contrato de API. Antes de iniciar outro lote, conferir o motivo e corrigir a configuração ou aguardar o limite comercial.

O resumo mostra tentativas, sucessos, falhas e remessas ainda pendentes. “Atualização encerrada” pode incluir consultas suspensas; as contagens e os motivos explicam o resultado. Uma remessa concluída por outro processo ou alterada durante o lote pode deixar de ser elegível sem contar como tentativa desta execução. Os registros BULK_SYNC_START/CHUNK/PAUSE são auditados.

API administrativa: GET/POST `/api/admin/shipments/sync-pending`, sem cache, sessão Supabase verificada; POST exige origem autorizada e ADMIN/OPERATOR. Inícios de lote têm limite adicional de três por minuto por operador. BulkSync usa RLS e revoga acesso de PUBLIC/anon/authenticated; ambientes com papel PostgreSQL dedicado devem aplicar a política/grant de scripts/grant-runtime.sql à nova tabela.
