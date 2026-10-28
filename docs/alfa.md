# Integração Alfa Transportes

Fonte oficial consultada em 24/10/2026: https://api.alfatransportes.com.br/rastreamento/v1.2/docs/

Contrato: `POST https://api.alfatransportes.com.br/rastreamento/v1.2/`, JSON `{idr,merNF,tomCnpj?,modoJson:1}`. `idr` vem de `ALFA_API_KEY`, exclusivamente no servidor. NF é numérica de até oito dígitos conforme a documentação. Nunca registrar o corpo da requisição.

**Divergência da própria documentação:** a tabela define `tomCnpj`, mas o exemplo JavaScript usa `cnpjTomador`. O conector segue a tabela (`tomCnpj`). A homologação deve confirmar esse campo com a Alfa; não enviar os dois silenciosamente. A amostra JSON publicada também omite uma vírgula antes de `ocorrenciasExtras`; fixtures corrigem apenas a sintaxe e nunca relaxam o parser para aceitar JSON inválido.

A resposta de sucesso exige `status: 2` e `dadosCte`; esse código significa **rastreamento concluído**, não entrega concluída. A entrega exige `dadosEntrega.dataEntrega` real. Leitura da previsão usa `dataPrivista` (grafia da amostra oficial) ou `dataPrevista`. Embarques podem ser objeto ou lista. Eventos de saída/chegada vêm das datas retornadas; ocorrências novas ficam UNKNOWN até classificação segura.

O parser trata JSON e XML quando o Content-Type declara o formato efetivamente retornado. XML segue `wsRastreamento/rst`, `rstStatus@stsCd`, `NF`, `embarque/embNF`, `entrega/entS` e `entrega/entNF`. DTDs/entidades externas são rejeitadas. XML/JSON malformado e HTTP 200 com erro de negócio não são sucesso.

Códigos documentados: 1 incompleto; 2 sucesso; 3 banco indisponível; 4 identificação ausente; 5 falha de identificação; 6 identificação não encontrada; 7 dados de NF indisponíveis; 8 NF ausente; 9 NF não encontrada. Erros são registrados por código sem mensagem bruta contendo PII.

O comprovante só é aceito em HTTPS no host `areadocliente.alfatransportes.com.br`. O cliente só o recebe após acesso autorizado por link. Avalie a política de compartilhamento de comprovantes, que podem conter assinatura e dados pessoais, na homologação LGPD.

## Pendências externas

Solicitar chave individual ao comercial Alfa, configurar `ALFA_API_KEY`, validar os parâmetros divergentes e comparar uma NF autorizada no ambiente da conta. Confirmar limites de requisição e formatos de data/retorno. Nenhuma chamada real autenticada foi feita; testes são apenas fixtures sintéticas isoladas.

## Campos opcionais e diagnóstico de incompatibilidade

Seções e campos opcionais aceitam `null` como ausência, sem inventar datas ou confirmar entrega. NF e CT-e continuam validados pelo contrato, e o número da NF deve corresponder ao solicitado. Erros de negócio JSON são classificados pelo status antes de validar os dados de uma resposta de sucesso, pois esses erros podem vir com seções incompletas.

Se persistir `INVALID_ALFA_RESPONSE`, ao executar **Atualizar rastreamento** o painel administrativo mostra **Diagnóstico do formato da resposta Alfa**, com botão para copiar. Esse diagnóstico contém somente caminhos de campos conhecidos do schema, códigos de validação e nomes de tipos. Não inclui valores, mensagens brutas, chaves desconhecidas da resposta nem credenciais; também não grava a resposta bruta no banco.

A compatibilidade com `null` foi validada com respostas sintéticas, não com a resposta da NF real. A confirmação depende de nova consulta após o deploy. Os campos de uma resposta nova devem ser confirmados antes de adicionar aliases ou trocar de API.

### Diagnóstico persistente e falhas inesperadas

Depois de uma nova consulta com falha, consulte **Diagnósticos técnicos das consultas** nos detalhes administrativos da remessa (ADMIN/OPERATOR). O painel mantém os 20 registros mais recentes com data, referência, etapa, código e eventuais campos/tipos incompatíveis. **Copiar diagnóstico** funciona mesmo após recarregar a página. Tentativas antigas não ganham detalhes retroativamente.

Os registros usam a tabela de auditoria existente (`SYNC_DIAGNOSTIC`); não há nova migration. O erro original de resposta da transportadora é registrado antes de salvar a tentativa malsucedida. Exceções inesperadas da rota também recebem referência, incluindo códigos Prisma como `P2022`, sem mensagens, consultas SQL, URLs de banco ou stack traces.

Se o próprio banco não permitir gravar o diagnóstico, a função publica a mesma referência nos logs da Vercel com o prefixo `SHIPMENT_SYNC_DIAGNOSTIC` e avisa `SHIPMENT_SYNC_DIAGNOSTIC_NOT_PERSISTED`. Falhas inesperadas na autenticação são registradas somente nos logs da função, sem associar uma remessa antes da autorização. Erros esperados de autenticação/autorização não criam diagnósticos de remessa.

Esses registros identificam a camada que falhou; sua implementação não confirma, por si só, que o formato real da resposta da Alfa foi corrigido.

### Seção de entrega vazia em formato texto

`dadosEntrega` aceita também string vazia (inclusive somente espaços) como ausência de dados de entrega. Isso preserva as movimentações de uma remessa ainda em transporte e não fabrica confirmação ou data de entrega. Strings não vazias continuam sendo incompatíveis; não são interpretadas como data, JSON embutido ou entrega confirmada sem contrato conhecido. Quando um erro envolve uma string, o diagnóstico informa `stringKind: empty|nonempty`, sem mostrar o texto. A indicação anterior `receivedType: string` sozinha não permite confirmar se o conteúdo era vazio.
