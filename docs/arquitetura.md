# Decisões arquiteturais

1. **Monólito modular:** App Router serve interface e handlers; domínio fica em `src/lib`, adaptadores externos em `integrations/carriers`. Reduz complexidade operacional sem colocar credenciais no cliente. Worker reutiliza o mesmo domínio.
2. **Autenticação separada da autorização:** Supabase verifica identidade; `AdminUser` mantém papel e revogação. Não confiamos em um papel fornecido pelo cliente. Usuários são vinculados por UUID depois de criados no Supabase, sem uso de service_role na aplicação.
3. **Proteção da consulta:** número do pedido + documento completo válido, com HMAC no banco e quotas atômicas. Link aleatório pessoal também funciona. Não há leitura pública de tabelas; acesso é sempre mediado por handlers.
4. **Idempotência fiscal:** emitente+série+número, constraints únicas e transações. Identificadores são lidos como texto; número/série fiscais são canonicalizados para impedir duplicatas com zeros à esquerda. O modelo aceita chave NF-e única para evolução; a UI inicial usa os campos do Excel solicitado.
5. **Eventos independentes dos passos visuais:** timeline usa apenas registros datados. Não desenhamos etapas fictícias concluídas. Status desconhecido não é interpretado como entregue. Delivery exige confirmação de data.
6. **Sem raw payload persistido:** parsers validam dados brutos em memória, eventos normalizados são persistidos e a projeção pública elimina cliente/endereço/documento/valores. Logs guardam códigos, duração e sucesso. Isso reduz dados pessoais duplicados e separa os contratos sem criar uma cópia de cada resposta sensível.
7. **Sem chamadas de saúde fictícias:** healthCheck verifica configuração e declara que não testa a API real. A homologação precisa de uma remessa autorizada, não de um HTTP 200 ou de fixture.
8. **UI:** CSS/Tailwind e componentes próprios acessíveis, sem instalar bibliotecas de componentes não necessárias. Texto FIRST SPORTS, sem logotipo oficial inventado, sem fontes ou scripts externos em runtime.
9. **Scheduler externo:** worker de execução única e endpoint Bearer permitem cron em VPS ou scheduler de nuvem. Processos não são assumidos persistentes após publicação/snapshot.
10. **Segurança em profundidade:** React escapa conteúdo, Zod valida entrada, Origin protege mutações com cookie, cabeçalhos de segurança e no-store em dados privados, links sem referrer, fórmulas de planilha e injeção de CSV bloqueadas. TLS, IAM do banco, criptografia de disco/backup e registros de borda dependem da infraestrutura e precisam ser configurados.

Transportadoras são obtidas do cadastro no banco para formulários e filtros. Para adicionar uma integração: implemente CarrierTrackingAdapter, registre o adaptador no servidor e cadastre a transportadora; o frontend não precisa de alteração. A importação valida os códigos contra o cadastro existente.

Overrides de dependências: deepmerge-ts 8 e uuid 11 substituem versões transitivas com avisos de segurança. Instalação congelada, geração/migrations Prisma, parsing Excel e build são verificados com essas versões; não desativamos integridade ou TLS.

Eventos preservam a precisão temporal. Datas de faturamento informadas sem hora e eventos da API com apenas a data são exibidos com "horário não informado", sem apresentar um horário artificial ao cliente.
