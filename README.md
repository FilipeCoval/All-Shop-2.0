# All-Shop 2.0

Loja online All-Shop, desenvolvida com React, Vite, Firebase e APIs serverless na Vercel.

## Requisitos

- Node.js 18 ou superior
- npm
- Projeto Firebase configurado
- Conta e projeto Vercel ligados ao repositório GitHub

## Instalação local

```powershell
npm install
```

Cria um ficheiro `.env.local` com base no `.env.example` e preenche apenas as variáveis do teu ambiente. Nunca envies o `.env.local` para o GitHub.

Para iniciar em desenvolvimento:

```powershell
npm run dev
```

## Validação antes de publicar

Executa este comando antes de cada envio para o GitHub:

```powershell
npm run check
```

O comando verifica TypeScript e cria o build de produção. Só deves publicar quando terminar sem erros.

## Publicar uma alteração

```powershell
git status
git add .
git commit -m "Descrição da alteração"
git push
```

A Vercel inicia o deploy automaticamente quando a branch está ligada ao projeto. Confirma sempre o deployment e testa a funcionalidade alterada no endereço de Preview antes de promover para produção.

## Firebase

As regras devem ser publicadas apenas quando os ficheiros `firestore.rules` ou `storage.rules` forem realmente alterados:

```powershell
firebase deploy --only firestore:rules
firebase deploy --only storage
```

Para publicar ambos:

```powershell
firebase deploy --only firestore:rules,storage
```

## Comandos úteis

```powershell
npm run dev       # servidor local
npm run lint      # validação TypeScript
npm run build     # build de produção
npm run check     # TypeScript + build
npm run preview   # pré-visualizar o build local
```

## Cuidados importantes

- Não executar `npm audit fix --force` sem testar numa branch separada.
- Não apagar `.env.local` ao substituir uma pasta do projeto.
- Não publicar chaves privadas, contas de serviço ou credenciais Firebase Admin.
- Não alterar checkout, reservas ou stock diretamente em produção sem validar num Preview Deployment.
