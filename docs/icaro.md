# Icaro — ocorrências de cliente ESL Cloud

Integração baseada nos trechos da documentação fornecidos para `GET /api/customer/invoice_occurrences`, atualizados em 03/04/2025. O tenant informado é `icaro.eslcloud.com.br`; autenticação e dados reais ainda precisam de homologação autorizada.

## Ativar

1. Configure `ICARO_API_TOKEN` **somente no servidor**, com um token de **cliente** ESL Cloud autorizado pela Icaro. Na Vercel, selecione os ambientes apropriados e faça um novo deploy para carregar a variável. Não use `NEXT_PUBLIC_`, não cole tokens em chats e não versione credenciais.
2. Execute `npm run db:seed` no banco correto. O seed cadastra `ICARO` desabilitada e preserva as opções das transportadoras já cadastradas. O build de produção via `build:vercel` já executa o seed. Não há mudança de schema/migration nesta integração.
3. Cadastre ou importe a remessa com `transportadora=ICARO`. O **número do pedido precisa corresponder ao registrado no TMS da Icaro**, além do CNPJ emitente, série, número da NF e data de emissão corretos.
4. Em Transportadoras, confira o diagnóstico de credenciais e habilite a Icaro apenas quando estiver autorizado a fazer a homologação. Em uma remessa autorizada, use **Atualizar rastreamento** e compare o histórico com o portal da transportadora. Presença da variável não comprova autenticação.

## Consulta e integridade

- Destino HTTPS fixo `https://icaro.eslcloud.com.br/api/customer/invoice_occurrences`, com `Authorization: Bearer …`. Redirecionamentos são recusados; o token não sai para destinos escolhidos pelo usuário.
- Usa `invoice_key` se `ShipmentInvoice.accessKey` já estiver preenchida no banco; caso contrário, `order_number`. A interface atual usa o pedido e não exige cadastrar uma chave de NF.
- Confere CNPJ emitente, série e número extraídos da chave de NF devolvida pela API, além dos campos número/série quando presentes. Ignora outras NFs do pedido. Declarações e retornos sem chave fiscal são ignorados porque não permitem validar o emitente; pedidos sem correspondência retornam `NOT_FOUND`, sem alterar o histórico anterior. Múltiplos fretes para a mesma NF retornam `AMBIGUOUS_INVOICE`.
- Envia `since` a partir do início do dia de emissão em São Paulo, evitando a janela implícita de um mês. Esse filtro é de **criação do registro**. As páginas mantêm os filtros e usam `paging.next_id` em `start` até `null`.
- Limita uma consulta a 10 páginas, 2.000 linhas correspondentes e um orçamento de 30 segundos antes de iniciar outra página. Uma requisição já iniciada pode usar seu timeout de 15 segundos. Limite atingido ou cursor repetido falha explicitamente, sem persistir histórico parcial. Históricos maiores exigem uma futura implementação de sincronização por lotes.
- O ID da ocorrência identifica o evento; eventos repetidos na resposta são deduplicados e ordenados por `occurrence_at`. O fluxo existente persiste o histórico com fingerprints. `delivery_prediction_at` fornece a previsão e `cte_number` fornece o CT-e. Não armazena recebedor, documento, comentários nem resposta bruta.
- Ações como `trigger=finish` e códigos numéricos **não são tratados isoladamente como entrega**. O status é mapeado pela descrição; a descrição documentada `ENTREGA REALIZADA NORMALMENTE` confirma entrega na data do evento. Entrega parcial vira exceção, descrições desconhecidas ficam `UNKNOWN`. A tabela oficial de códigos da Icaro ainda precisa ser confirmada para ampliar esse mapeamento.

## Limite de chamadas e falhas

O fluxo de sincronização mantém o lock compartilhado de transportadora e grava o cooldown em `RateLimit`, aguardando pelo menos 2 segundos **após o término** de cada chamada, inclusive após falha. Isso coordena as instâncias do portal que compartilham o banco, incluindo paginação e remessas consecutivas. Uma reserva de 17 segundos cobre uma queda do processo durante o timeout HTTP. Outros aplicativos usando a mesma saída/IP também precisam coordenar esse limite; o portal não controla suas chamadas.

HTTP 401/403 indica falha de autenticação; 429 indica limite; timeout, rede e erros 5xx mantêm o backoff existente. Erros não expõem tokens ou respostas brutas. Consulta pública continua exigindo NF e documento do destinatário validados localmente, permite uma única atualização Icaro por requisição e entrega o último histórico salvo quando a API falha. Alterar o pedido de uma remessa Icaro invalida o histórico/link anterior e exige nova consulta.

Testes sintéticos: `npm test -- tests/icaro.test.ts tests/icaro-request.test.ts`. Homologação real não foi executada: o token cadastrado na Vercel não está disponível automaticamente no Codex.
