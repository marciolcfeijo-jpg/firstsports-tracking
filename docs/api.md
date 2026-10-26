# API interna

JSON UTF-8, erros `{ "error": "mensagem" }`, status HTTP 400 (validação), 401 (sem sessão), 403 (permissão/origem), 404, 409 (conflito), 429 (limite), 500/503 (indisponibilidade). Não registrar tokens, documentos, senhas ou payloads completos em ferramentas de observabilidade.

Mutações de navegador exigem `Origin` igual à origem de `APP_URL`, além do cookie Supabase para a área administrativa. Os handlers conferem identidade e papel no servidor. GETs são apenas leitura. CLI do scheduler usa Bearer e não cookies.

| Método e caminho                         | Entrada / retorno                                                                                            | Permissão                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| POST `/api/tracking/lookup`              | `{number,document}`; `{links:[{url}]}` após validar NF e CPF/CNPJ completo                                   | Pública, quotas globais e por documento |
| GET `/api/tracking/link/:token`          | Remessa com NF, transportadora, datas e eventos; sem cliente, documento/endereço/valores                     | Token válido, não expirado nem revogado |
| POST `/api/admin/session`                | `{email,password}`; cookies de sessão                                                                        | Login Supabase + vínculo ativo          |
| DELETE `/api/admin/session`              | Encerra sessão                                                                                               | Origem válida                           |
| GET `/api/admin/shipments`               | filtros q, carrier, status, state, from, to, sort, page; `{items,total,page}`                                | VIEWER+                                 |
| POST `/api/admin/shipments`              | Campos da planilha; `{id,duplicate}`                                                                         | OPERATOR+                               |
| GET `/api/admin/shipments/:id`           | Detalhes restritos, eventos, consultas e links sem token                                                     | VIEWER+                                 |
| PATCH `/api/admin/shipments/:id`         | `{version,cte?,estimatedDelivery?,name?,email?,city?,state?,payerDocument?,carrierCode?}`; controle otimista | OPERATOR+                               |
| POST `/api/admin/shipments/:id/invoices` | `{cnpj_remetente,serie_nf,numero_nf}`                                                                        | OPERATOR+                               |
| POST `/api/admin/shipments/:id/sync`     | Consulta o adaptador; `{ok,code?}`                                                                           | OPERATOR+                               |
| POST `/api/admin/shipments/:id/links`    | `{url}`; token mostrado apenas uma vez                                                                       | OPERATOR+                               |
| DELETE `/api/admin/shipments/:id/links`  | `{linkId}` revoga o link da remessa                                                                          | OPERATOR+                               |
| GET `/api/admin/shipments/export`        | CSV, mesmos filtros; limite 10 mil, sem documentos                                                           | VIEWER+                                 |
| POST `/api/admin/imports`                | multipart `file`; lote e prévia por linha                                                                    | OPERATOR+                               |
| GET `/api/admin/imports`                 | Últimos lotes                                                                                                | VIEWER+                                 |
| GET `/api/admin/imports/:id`             | Prévia/relatório do lote                                                                                     | VIEWER+                                 |
| POST `/api/admin/imports/:id`            | Confirma até 100 linhas por chamada; `{ok,completed,pending}`                                                | OPERATOR+                               |
| GET `/api/admin/imports/template`        | XLSX com exemplo explicitamente fictício                                                                     | VIEWER+                                 |
| GET `/api/admin/carriers`                | Cadastro, sem secrets                                                                                        | VIEWER+                                 |
| PATCH `/api/admin/carriers`              | `{id,enabled}`                                                                                               | ADMIN                                   |
| GET `/api/admin/users`                   | Usuários e papéis                                                                                            | ADMIN                                   |
| POST `/api/admin/users`                  | `{id,email,role,active}`; vínculo ao UUID Supabase                                                           | ADMIN                                   |
| POST `/api/internal/sync`                | `Authorization: Bearer CRON_SECRET`; lote elegível                                                           | Credencial de scheduler                 |

Exemplo de cadastro (dados fictícios exclusivamente para testes):

```json
{
  "numero_pedido": "EXEMPLO-001",
  "numero_nf": "123",
  "serie_nf": "1",
  "cnpj_remetente": "11222333000181",
  "cnpj_tomador": "11222333000181",
  "cpf_cnpj_destinatario": "52998224725",
  "nome_cliente": "Cliente fictício",
  "email_cliente": "exemplo@example.com",
  "transportadora": "BRASPRESS",
  "data_emissao": "2026-10-24",
  "numero_cte": "",
  "cidade_destino": "São Paulo",
  "uf_destino": "SP"
}
```

Os links representam uma remessa. Uma consulta de pedido retorna links separados para todas as suas remessas autorizadas; não há agregação que marque todo o pedido entregue prematuramente.

A consulta pública usa exclusivamente o número da NF (campo `number`, texto numérico de até 12 dígitos), preservando o contrato JSON. Após validar o destinatário, tenta até três atualizações elegíveis; erros da transportadora mantêm o histórico disponível. Resposta: `{links:[{url,carrier,invoiceNumber}]}`.
