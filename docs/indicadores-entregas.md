# Indicadores do painel de entregas

Os indicadores usam o mesmo conjunto de remessas selecionado nos filtros do painel (vendedor, transportadora, busca, status, UF e emissão). Não fazem chamadas às transportadoras para calcular os totais.

## Resumo

- **Total:** todas as remessas filtradas.
- **Em aberto:** status diferente de DELIVERED, RETURNED e CANCELLED.
- **Entregues:** status DELIVERED, inclusive registros antigos que ainda não tenham data confirmada preenchida.
- Devolvidas/canceladas aparecem na explicação do total quando existem. Não são contadas como abertas ou entregues.

## Entregas concluídas

A comparação é por **dia civil em America/Sao_Paulo**, entre `deliveredAt` e a **última previsão registrada** em `estimatedDelivery`. O portal ainda não mantém um campo separado de previsão original contratual; portanto esses indicadores não constituem uma medição de SLA contra a promessa inicial.

- **Antes do prazo:** dia da entrega anterior ao dia da previsão.
- **No dia previsto:** ambos no mesmo dia, independentemente do horário.
- **Depois do prazo:** dia da entrega posterior ao dia da previsão.
- **Sem comparação:** falta data da entrega ou previsão, ou a data é inválida. Não presume atraso nem pontualidade.

**Dentro do prazo (%)** = (antes + no dia) / (antes + no dia + depois). Entregas sem comparação não entram no denominador; sem dados suficientes o painel mostra um traço, e não 0%. A barra de distribuição inclui as quatro categorias, com a parte sem comparação em cinza.

## Atenção operacional

- **Em atraso:** remessa ainda aberta, com dia da previsão anterior ao dia atual em São Paulo. A data de hoje não fica atrasada antes de terminar o dia.
- **Em ocorrência:** remessa aberta com status atual EXCEPTION. Não conta qualquer ocorrência histórica como um problema ainda ativo.
- **Sem previsão:** remessa aberta sem previsão utilizável.

Esses indicadores podem se sobrepor. Uma remessa em ocorrência pode também estar atrasada; não se somam os cartões como se fossem categorias exclusivas.

**Transportadoras com falha na última consulta** conta transportadoras distintas que têm remessas filtradas com `lastSyncError`. É um indicador técnico de atualização, separado de atrasos e ocorrências na entrega.

A interface é responsiva, usa rótulos além das cores e mantém os filtros no link para a lista de remessas. Não há mudança de schema ou migration.
