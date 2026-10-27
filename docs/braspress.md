# Integração Braspress

Fonte oficial consultada em 24/10/2026: https://api.braspress.com/home

Contrato implementado: `GET https://api.braspress.com/v3/tracking/byNf/{cnpjTomador}/{notaFiscal}/json`, autenticação HTTP Basic no servidor com `BRASPRESS_USERNAME` e `BRASPRESS_PASSWORD`. O CNPJ é o **tomador do frete**, não necessariamente o emitente. Sem `cnpj_tomador`, a consulta falha explicitamente em vez de presumir CIF.

A documentação limita as buscas aos últimos **90 dias da emissão do conhecimento**. O portal preserva a última informação local quando a transportadora não encontra mais o conhecimento. Não tenta burlar limites históricos.

Resposta validada: `conhecimentos[]` com `numero`, `notasFiscais[].numero/serie`, `status`, `previsaoEntrega`, `dataEntrega`, `timeline[].descricao/data` e `ocorrencias[].descricao/data`. Filtramos pela NF/série; múltiplos conhecimentos compatíveis retornam AMBIGUOUS_TRACKING para tratamento operacional, sem selecionar um arbitrariamente. Mapeamento conservador mantém estados novos como UNKNOWN e não confirma entrega sem data.

`normalizeEvents`, `validateConfiguration`, `trackShipment` e `healthCheck` seguem a interface compartilhada. O healthCheck é diagnóstico de configuração, não uma consulta autenticada de homologação. Não há endpoint de health independente documentado; não se inventa um.

## Homologação pendente

1. Solicitar credenciais de homologação/produção à filial Braspress, conforme contrato comercial.
2. Configurar secrets no servidor e habilitar Braspress no painel.
3. Usar uma remessa **autorizada** com tomador, NF e série corretos e menos de 90 dias.
4. Executar atualização manual, verificar logs sanitizados e comparar datas, timeline, ocorrência e entrega com o portal da transportadora.
5. Confirmar os formatos efetivos de data e o vocabulário de status da conta. Campos diferentes geram erro explícito, preservando dados anteriores.
6. Confirmar o limite comercial de chamadas e ajustar lotes/intervalos antes de aumentar volume.

Fixtures são sintéticas e usam os nomes de campos documentados. Não houve consulta real com credenciais nesta entrega; não declarar integração homologada apenas por testes de fixture.

## Diagnóstico de integração desabilitada

`INTEGRATION_DISABLED` é gerado pelo portal antes de qualquer chamada HTTP à Braspress. A página da remessa mantém essa falha como histórico; habilitar a transportadora não transforma uma tentativa anterior em sucesso. O resumo mostra o estado atual da transportadora e a data da última tentativa. A atualização manual recarrega o resumo também quando a tentativa falha, para não manter um código anterior na tela.

Ao habilitar uma transportadora, remessas abertas cujo último erro foi INTEGRATION_DISABLED são reagendadas para uma nova tentativa. Erros anteriores de autenticação/rede mantêm suas janelas de retentativa. O painel não apaga o histórico de falhas nem consulta a API com credenciais no navegador.

## Conferência de histórico recebido

Após uma atualização manual, o painel informa as contagens de etapas `timeline`, ocorrências, registros sem data e eventos normalizados. O diagnóstico é retornado apenas pela ação autenticada e não inclui credenciais, documentos ou o corpo bruto da resposta. A confirmação da entrega pode gerar um evento a partir de `dataEntrega` quando ele não consta na timeline; por isso a contagem de eventos normalizados pode ser maior que as listas recebidas. Datas sem horário preservam essa precisão.

Essas contagens se referem à última chamada, enquanto o histórico local preserva os eventos já recebidos. Se o portal Braspress mostrar etapas, mas a API retornar zero etapas e ocorrências, solicitar à Braspress a conferência do retorno v3 para a NF autorizada. Não preencher datas usando capturas de tela nem supor que o portal e a API retornem os mesmos dados.

## Histórico no nível principal da resposta

O parser aceita `timeline` e `ocorrencias` no nível principal ou dentro do conhecimento. O histórico principal só é associado automaticamente se houver exatamente um conhecimento na resposta; caso contrário, um histórico sem vínculo é recusado com AMBIGUOUS_TRACKING_HISTORY. Não se misturam eventos de conhecimentos ou notas diferentes. Eventos idênticos repetidos nos dois níveis são deduplicados. Ocorrências com descrição operacional conhecida recebem o status correspondente; descrições desconhecidas permanecem ocorrências, sem presumir entrega. Um evento explícito de entrega com data e horário pode preencher a confirmação e preservar a precisão quando o resumo só traz a data.

O diagnóstico anterior contava apenas as listas aninhadas e, portanto, não comprovava que a resposta completa estivesse vazia. Agora a origem é indicada como raiz, conhecimento, ambos ou ausente. O painel oferece Copiar diagnóstico: inclui somente contagens e nomes de campos/arrays limitados em tamanho, nunca valores da resposta, dados do destinatário, credenciais ou Authorization. Não há armazenamento do payload bruto. A estrutura de arrays desconhecidos também pode ser identificada sem enviar seu conteúdo pelo chat.

A leitura das duas estruturas foi validada com fixtures sintéticas. Isso não comprova qual estrutura veio na consulta de uma NF real; após o deploy, executar atualização manual e conferir origem/contagens. Se continuar sem eventos, usar o diagnóstico de estrutura para conferir os campos efetivamente retornados ou solicitar à Braspress a liberação/conferência da API v3. O portal comercial e a API podem ter conteúdos ou permissões distintos.
