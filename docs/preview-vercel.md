# Ver o portal pela Vercel

O código está no GitHub, repositório `marciolcfeijo-jpg/firstsports-tracking`, branch `main`.

1. Acesse https://vercel.com/new e entre com sua conta do GitHub.
2. Autorize a Vercel a acessar esse repositório, caso seja solicitado.
3. Em Import Git Repository, escolha `firstsports-tracking` e clique em Import.
4. Mantenha o framework Next.js e a pasta raiz do repositório. Não adicione domínio personalizado nesta etapa.
5. Clique em Deploy. Após o build, abra Visit para obter a URL `.vercel.app` real.

A página inicial e os textos de ajuda podem ser vistos sem credenciais externas. O primeiro deploy não substitui a configuração do banco: consultas e administração só funcionam após configurar as variáveis, aplicar migrations e criar o administrador. A aplicação não cria dados de demonstração nem contorna o login.

Para configurar os serviços, veja README.md e docs/deploy.md. No Supabase, use Connect para obter a URL PostgreSQL apropriada ao ambiente da Vercel e a chave publicável para autenticação. Configure os valores diretamente em Settings → Environment Variables da Vercel, nunca em chat, GitHub ou arquivos públicos. DATABASE_URL não pode apontar para o PostgreSQL local deste ambiente.

Depois de conhecer a URL real do deploy, defina APP_URL com essa origem exata HTTPS, sem caminho, e faça um novo deploy. O aplicativo confere essa origem nas requisições dos formulários. Não invente nem use a URL de exemplo de outro projeto.

Este procedimento usa o endereço da Vercel e não exige alterações no DNS da First Sports. O plano e o acesso público do deploy são definidos na sua conta Vercel; não contrate serviços pagos nem desative proteções da conta sem revisão.
