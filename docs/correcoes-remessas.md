# Correções cadastrais de remessas

Em Remessas → Visualizar → Editar dados cadastrais é possível corrigir pedido, CPF/CNPJ do destinatário, remetente, data de emissão, nome, e-mail, destino, tomador, transportadora, código do objeto, CT-e e previsão. As notas vinculadas podem ser corrigidas ou removidas, mantendo ao menos uma. Novas notas continuam sendo incluídas em Vincular outra nota fiscal.

O documento atual não pode ser recuperado do HMAC. Por isso o campo Corrigir CPF/CNPJ do destinatário começa vazio: em branco mantém o documento atual; preenchido exige CPF/CNPJ válido. A correção reassocia somente a remessa selecionada ao cliente/pedido correspondente e não altera o documento dos demais pedidos do cliente anterior. Se o documento já corresponder a um cliente cadastrado, seu perfil existente é utilizado; nome e e-mail só são alterados quando o operador os modifica explicitamente. Correções de nome/e-mail de um mesmo cliente atualizam seu perfil compartilhado.

Mudanças de documento do destinatário, NF/série, remetente, transportadora, código do objeto ou tomador arquivam os eventos atuais no AuditLog privado, revogam links anteriores e reiniciam a consulta como Pedido faturado, sem previsão/entrega antiga. É necessário atualizar o rastreamento e gerar um novo link. Não se preenchem status ou datas de transportadora por suposição. Uma alteração apenas descritiva preserva o histórico ativo.

Cada salvamento mantém uma cópia dos dados anteriores e eventos normalizados, acessível somente na área administrativa em Registros anteriores às alterações (últimos 20 salvamentos). A nova coluna AuditLog.snapshot herda as restrições de acesso/RLS da tabela. Não contém CPF/CNPJ do destinatário em texto, credenciais nem payload bruto de transportadora.

São mantidos os controles de versão e de sincronização em andamento. Notas já vinculadas a outra remessa, números repetidos e documentos inválidos são recusados; a transação não deixa alterações parciais. As APIs de escrita continuam exigindo ADMIN/OPERATOR e origem autorizada; VIEWER não pode salvar.
