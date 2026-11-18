# All-Shop Admin — publicação separada

A administração usa o mesmo código e as mesmas regras de negócio da loja, mas
tem uma compilação PWA independente. Assim não existe duplicação das rotinas de
stock, encomendas ou cashback.

## Projeto Vercel

- Nome: `all-shop-admin`
- Repositório: `FilipeCoval/All-Shop-2.0`
- Production Branch: `teste-correcao-telegram` enquanto a nova administração
  estiver em validação
- Framework Preset: `Vite`
- Root Directory: `./`
- Build Command: `npm run build:admin`
- Output Directory: `dist-admin`
- Install Command: `npm install`

Copiar para o novo projeto as variáveis administrativas do Firebase usadas no
projeto `all-shop-2-0`: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e
`FIREBASE_PRIVATE_KEY`. As variáveis opcionais `ADMIN_EMAILS` e `ADMIN_UIDS`
devem ser copiadas caso existam no projeto original.

O Deployment Protection da Vercel deve ficar desligado neste projeto. O acesso
aos dados é protegido pelo login Firebase, pela lista de contas autorizadas,
pelas regras Firestore e pela validação do token em cada operação da API.

## Comandos locais

Publicar a loja (`all-shop-2-0`) **não publica** a PWA separada
(`all-shop-admin`). Em 18/11/2026 este segundo projeto não tinha integração Git:
é necessário publicar ambos e verificar que ambos ficam `Ready`.
O service worker do admin tem permissão de scope `/` no servidor para suportar
o domínio dedicado; no domínio da loja o cliente continua a registá-lo apenas
em `/admin`.

As pré-reservas novas são guardadas antes de abrir WhatsApp/Telegram, aparecem
na secção `Pré-reservas` e na Área de Cliente e só marcam a mensagem como
confirmada após ação explícita. Testes transacionais isolados: `npm run test:preorder`.
Teste de navegador local (requer Playwright e Chrome):
`node tests/preorderBrowser.test.mjs`. Pode definir `PLAYWRIGHT_MODULE` com o
caminho do módulo Playwright e `PLAYWRIGHT_CHANNEL` com o canal instalado.

- Desenvolvimento: `npm run dev:admin`
- Validação: `npm run check`
- Compilação: `npm run build:admin`
- Pré-visualização: `npm run preview:admin`

