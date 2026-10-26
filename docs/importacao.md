# Importação de planilhas

1. Entre como ADMIN ou OPERATOR em `/admin/importacoes`.
2. Baixe o modelo XLSX; a aba Instruções explica o formato. **Remova a linha fictícia**.
3. Use os cabeçalhos `numero_pedido`, `numero_nf`, `serie_nf`, `cnpj_remetente`, `cnpj_tomador`, `cpf_cnpj_destinatario`, `nome_cliente`, `email_cliente`, `transportadora`, `data_emissao`, `numero_cte`, `cidade_destino`, `uf_destino`.
4. Transportadoras iniciais: `BRASPRESS`, `ALFA`. Datas: `AAAA-MM-DD`. UF: sigla oficial. Tomador, e-mail e CT-e podem estar vazios; o tomador é necessário para consultar a Braspress.
5. Mantenha os identificadores em células de texto; zeros perdidos pelo Excel antes do upload não podem ser recuperados. A chave fiscal compara números/séries canônicos, incluindo o emitente. Número de pedido mantém o texto original.
6. Limites: 5 MB compactados, 20 MB declarados no ZIP XLSX, 200 entradas ZIP, 2.000 linhas e 30 colunas. Fórmulas e células objeto são rejeitadas. CSV UTF-8 com vírgula ou ponto e vírgula, incluindo campos entre aspas.
7. Veja a prévia e os erros; somente linhas válidas serão importadas na confirmação. Repetições no mesmo arquivo são sinalizadas. A constraint do banco impede duplicatas entre arquivos e cadastros manuais.
8. O relatório distingue IMPORTED, DUPLICATE, INVALID e ERROR. Erros de persistência não invalidam linhas já concluídas.

A importação agenda a primeira consulta (`nextSyncAt`) mas não chama transportadoras no navegador. O worker só consulta transportadoras habilitadas.

Documentos e dados da prévia têm acesso administrativo. Linhas concluídas são redigidas imediatamente; o worker remove conteúdo restante após sete dias. Configure o worker também quando as integrações estiverem desativadas, para executar a manutenção. Não persista arquivos originais em logs ou em diretórios públicos.

A confirmação avança em blocos de até 100 linhas por requisição. O navegador continua até concluir; em caso de desconexão, use Abrir lote no histórico e retome. Um lote em processamento fica protegido por lease de cinco minutos; após falha do processo, pode ser retomado quando o lease expirar. Linhas já concluídas não são executadas novamente.
