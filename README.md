# DingDong — versão pessoal

Rastreamento de conversões do WhatsApp ligadas a cliques do Google Ads, para uso próprio (um usuário só, sem cobrança, sem multi-empresa).

## O que faz

1. Você instala o script `t.js` no seu site — ele captura o `gclid` do clique de anúncio e marca os links de WhatsApp da página com um código de rastreio.
2. Quando alguém clica em "falar no WhatsApp", a mensagem chega no seu número já com esse código.
3. O sistema liga a conversa ao clique original (gclid) automaticamente.
4. Quando você marca a venda no painel, o valor é enviado como conversão offline pra sua conta do Google Ads.

## Stack

- Backend: Node.js + Express (um processo só, sem SSR, sem framework pesado).
- Banco: SQLite (um arquivo, sem serviço externo).
- Frontend: React + Vite + Tailwind, servido como arquivos estáticos pelo próprio Express.
- Integrações: Google Ads API (OAuth próprio) e Z-API para WhatsApp.

## Rodando localmente

```bash
npm install
cp .env.example .env
npm run setup:admin -- "sua-senha"   # copia o ADMIN_PASSWORD_HASH gerado pro .env
# preencha o resto do .env (veja DEPLOY.md para o que cada variável faz)
npm run build                         # builda o frontend (web/dist)
npm start                             # sobe tudo em http://localhost:3000
```

Para desenvolver o frontend com hot-reload, em outro terminal: `npm run dev --workspace web` (a Vite já tem proxy configurado pra `/api` apontar pro Express em `:3000`).

## Deploy em produção

Veja [`DEPLOY.md`](./DEPLOY.md) — passo a passo pra VPS da Hostinger (Ubuntu + Nginx + systemd).

## Estrutura

```
server/       # Express: rotas, auth, integrações (Google Ads, WhatsApp)
public/t.js   # script de rastreio (pixel) servido em /t.js
web/          # frontend React (Vite)
data/         # banco SQLite (criado automaticamente, não versionado)
```
