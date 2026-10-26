# Checklist de homologação

## Verificações automatizadas

- [ ] TypeScript strict, lint e build de produção.
- [ ] CPF/CNPJ, datas/UF/e-mail e identidade fiscal.
- [ ] XLSX e CSV reais, identificadores, fórmulas, duplicatas, limites e relatório.
- [ ] PostgreSQL: persistência, múltiplas notas/remessas, tokens, auditoria, quotas, deduplicação e locks.
- [ ] Conectores com fixtures sintéticas da estrutura documentada, erros, timeout, JSON/XML e destinos de comprovantes.
- [ ] E2E desktop/mobile: portal, validação, ajuda, bloqueio de admin, login via fixture HTTP externa, cadastro, edição, importação, consulta, geração/revogação de links e navegação.

## Exige configuração e teste externo autorizado

- [ ] Login com projeto Supabase **real**, recuperação de senha, expiração/renovação de sessão, papéis e usuário inativo.
- [ ] Credenciais Braspress e NF autorizada com tomador/série corretos; confirmar janela de 90 dias e vocabulário/datas reais.
- [ ] Chave Alfa, confirmar `tomCnpj` versus `cnpjTomador`, conferir retorno JSON/XML da conta e comprovante.
- [ ] Entrega parcial de pedido com várias remessas e NF não encontrada, status desconhecido, ocorrência e devolução.
- [ ] Ajustar concorrência/limites aos contratos de transportadoras e carga de produção.
- [ ] Scheduler real, tentativas com backoff, parada após entrega, falha persistente e manutenção após sete dias.
- [ ] Usuário DB de privilégio mínimo, Data API desativada ou RLS bloqueando leitura pública, TLS e backup/restauração.
- [ ] Revisar política LGPD, canal do encarregado, retenção e acesso a comprovantes.
- [ ] Validar infraestrutura HTTPS, WAF, logs sem tokens/PII e subdomínio sem alterar domínio principal.

Os testes de fixture não homologam serviços externos. Não marcar os itens externos como concluídos sem evidência do ambiente real. O arquivo `docs/validacao.md` registra os resultados executados nesta entrega.
