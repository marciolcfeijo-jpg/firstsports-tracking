# Operação administrativa

Papéis: VIEWER consulta; OPERATOR cadastra, edita dados permitidos, importa, sincroniza e gerencia links; ADMIN também administra usuários e habilita transportadoras. Todos os controles são repetidos no servidor, inclusive quando a navegação oculta uma opção.

## Remessas

O pedido pertence a um destinatário identificado pelo HMAC do documento. Uma NF é única por emitente+série+número. Cadastre a primeira nota na remessa e vincule notas adicionais nos detalhes. Um pedido pode ter várias remessas e transportadoras. Não existem exclusões de remessas na interface/API.

A edição de CT-e/previsão exige a versão atual para evitar sobrescrita concorrente. O status e o histórico são atualizados apenas pela sincronização de dados reais. Uma previsão manual é responsabilidade da operação e deve ser confirmada antes de informar ao cliente. Cadastro de nota gera evento de faturamento baseado na emissão informada, claramente distinto de uma coleta registrada pela API.

## Compartilhamento

Gere o link nos detalhes, copie e envie apenas ao destinatário por canal aprovado. Token aleatório de 256 bits, armazenado somente como SHA-256, válido por 30 dias. Revogue um link comprometido e gere outro. O token completo é mostrado somente na emissão. Evite incluir URLs de rastreio em logs de acesso, analytics ou chamados públicos.

## Sincronização

Execute `npm run worker` a cada cinco minutos pelo scheduler externo, ou POST em `/api/internal/sync` com Bearer `CRON_SECRET`. Não execute pelo navegador público. Cada ciclo processa até 10 remessas sequencialmente; o lock por remessa evita duplicação entre workers. Remessas abertas retornam a cada duas horas; exceções continuam monitoradas. Entregues, devolvidas e canceladas não entram na seleção recorrente. Retentativas começam em cinco minutos e chegam a 24 horas. A última informação é preservada em falhas.

Transportadoras desativadas não são consultadas pelo worker; atualização manual informa INTEGRATION_DISABLED. Habilitar sem credencial causa CREDENTIALS_MISSING, com falha visível no painel. Compare a carga com os limites contratados. Há um lease distribuído por transportadora para serializar chamadas entre workers e atualizações manuais. Para escala alta, acrescente orçamento de chamadas por minuto conforme o contrato comercial.

## Retenção e LGPD

Execute manutenção mesmo sem integrações. Importe apenas dados necessários. Linhas válidas concluídas têm dados pessoais removidos da prévia; após sete dias, o worker redige conteúdo restante. Defina com o controlador os prazos legais para dados de transporte/auditoria e procedimentos de exclusão/anomização via tarefa administrativa revisada. Não apague histórico sem política e auditoria. A página de privacidade é um texto preliminar que exige validação jurídica e o contato real do encarregado antes de produção.

A chave DOCUMENT_HMAC_KEY é estável por ambiente: perdê-la impede novas consultas por documento e duplicará a identidade do cliente em novos cadastros. Faça backup seguro e planeje migração versionada antes de rotacionar; não é possível recalcular hashes antigos sem os documentos originais, que não são armazenados.
