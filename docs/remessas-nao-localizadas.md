# Remessas não localizadas

O painel administrativo mostra a identificação “Não localizada na transportadora” quando a última consulta da remessa resultou em NOT_FOUND. Ela aparece na lista, nas últimas atualizações e no detalhe, junto do último status operacional conhecido. O filtro “Situação da consulta” permite selecionar esses registros; também se aplica ao resumo, à paginação e à exportação CSV pelos filtros compartilhados.

A identificação não confirma transportadora incorreta nem ausência de coleta. Orienta conferir transportadora, CNPJ do tomador, NF/série, registro/coleta e janela histórica da API. Na Braspress, NOT_FOUND também pode indicar que nenhum conhecimento retornado corresponde à NF e série cadastradas.

Os dados de entrega e o histórico não são alterados. Uma consulta bem-sucedida limpa lastSyncError no fluxo existente e remove a identificação. Uma falha diferente substitui a identificação pelo diagnóstico mais recente. Não exige migração e já identifica registros existentes com NOT_FOUND. A identificação é administrativa, sem expor diagnóstico técnico no rastreio público.
