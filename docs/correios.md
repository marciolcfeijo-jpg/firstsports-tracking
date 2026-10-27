# Integração Correios

Base: manual fornecido pelo usuário, “Manual de Integração”, revisão 04/2025 V2.4, seções de geração de token e API de rastreamento, páginas 21–22 e 46–50. A homologação autenticada continua pendente; os testes usam exclusivamente fixtures sintéticas.

## Acesso necessário

É necessário usuário CWS/Meu Correios, código de acesso aos componentes de API e cartão de postagem com permissão para rastreamento. O acesso ao site e a disponibilidade de rastreamento público não comprovam a permissão contratual da API. Conferir os componentes liberados em https://cws.correios.com.br/ (produção) ou https://cwshom.correios.com.br/ (homologação).

Na Vercel, cadastrar em Production, como Secret:

- `CORREIOS_USERNAME`: usuário de integração CWS.
- `CORREIOS_ACCESS_CODE`: código de acesso aos componentes/API, conforme o CWS; não presumir que seja a senha do site.
- `CORREIOS_POSTING_CARD`: número do cartão de postagem, preservando zeros iniciais.

`CORREIOS_ENVIRONMENT` aceita `production` (padrão) ou `homologacao`. Credenciais e objetos devem corresponder ao ambiente. Nenhuma URL arbitrária é aceita. Fazer um novo deploy após configurar. O seed cria CORREIOS desabilitado e preserva o estado existente nos deploys seguintes; habilitar no painel apenas após configurar o acesso.

## Contrato implementado

Autenticação: POST `/token/v1/autentica/cartaopostagem` com HTTP Basic (usuário:código de acesso) e JSON `{ "numero": "cartão de postagem" }`. O token recebido é usado somente no servidor para GET `/srorastro/v1/objetos/{codigoObjeto}?resultado=T`, com Bearer. Um token novo é gerado por consulta; não é necessário cadastrar nem renovar manualmente o token na Vercel. Não se registram token, Authorization ou payload bruto.

Hosts fixos: `https://api.correios.com.br` em produção, `https://apihom.correios.com.br` em homologação. O manual menciona `apphom.../rastro` no texto, mas seu exemplo cURL usa `apihom.../srorastro/v1/objetos`. O conector segue o cURL executável; confirmar o componente SRO disponível na conta durante a homologação.

Resposta: `objetos[].codObjeto`, `dtPrevista` e `eventos[]` com `codigo`, `tipo`, `dtHrCriado`, `descricao`, `detalhe`, `unidade.endereco.cidade/uf` e `unidadeDestino`. São solicitados todos os eventos (resultado=T), ordenados por data e deduplicados na persistência. A entrega exige um evento confirmado; BDE tipo 01 é o sucesso documentado, e tentativas frustradas não são confirmadas como entrega. Nenhum comprovante ou DANFE é inventado.

## Cadastro e teste

1. Cadastrar a NF e o destinatário normalmente e selecionar Correios.
2. Preencher `Código do objeto Correios`, com 13 caracteres no formato AA123456789BR. Usar um objeto real autorizado na homologação; este código é apenas ilustrativo.
3. Salvar e clicar em Atualizar rastreamento. Comparar todos os eventos e datas com os Correios.
4. Pesquisar pela NF + CPF/CNPJ no portal público. A validação local continua obrigatória; o servidor usa o objeto vinculado, nunca uma busca direta por documento nos Correios.
5. A atualização diária usa a mesma fila das demais transportadoras, com limite de tempo e preservação do último histórico em falhas. A consulta pública limita o custo a três chamadas HTTP (a consulta Correios envolve autenticação + rastreamento).

O código do objeto é separado do CT-e. Após uma sincronização, não pode ser substituído por outro objeto na mesma remessa, para evitar mistura de históricos. Na planilha, a coluna opcional `codigo_rastreio` foi acrescentada ao modelo; seu preenchimento é obrigatório para linhas CORREIOS. Planilhas anteriores de Braspress/Alfa continuam válidas.

Erros: CREDENTIALS_MISSING (configuração), TRACKING_CODE_REQUIRED (código ausente/inválido), AUTH_FAILED (credencial ou permissão rejeitada), NOT_FOUND (objeto não corresponde à consulta), TRACKING_UNAVAILABLE (sem eventos disponíveis). Uma configuração presente não equivale a uma consulta autenticada bem-sucedida.
