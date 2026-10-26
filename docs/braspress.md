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
