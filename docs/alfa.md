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
