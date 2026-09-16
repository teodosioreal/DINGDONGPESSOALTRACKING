# DingDong — multi-empresa

Rastreamento de conversões do WhatsApp ligadas a cliques do Google Ads. Um login só (seu), mas gerencia **várias empresas/clientes**, cada uma com sua própria conexão Google Ads e WhatsApp.

## O que faz

1. Cada empresa instala o próprio script `t.js` (com o id da empresa) no site dela — ele captura o `gclid` do clique de anúncio e marca os links de WhatsApp da página com um código de rastreio.
2. Quando alguém clica em "falar no WhatsApp", a mensagem chega no número daquela empresa já com esse código.
3. O sistema liga a conversa ao clique original (gclid) automaticamente.
4. Uma regra de palavras-chave (configurável por empresa, sem IA) detecta quando a conversa virou venda e, se conseguir achar um valor em reais na mensagem, pode enviar a conversão pro Google Ads da empresa automaticamente — ou só sugerir, esperando sua confirmação, dependendo da configuração de cada empresa.

## Stack

- Backend: Node.js + Express (um processo só, sem SSR, sem framework pesado).
- Banco: SQLite (um arquivo, sem serviço externo).
- Frontend: React + Vite + Tailwind, servido como arquivos estáticos pelo próprio Express.
- Integrações: Google Ads API (app OAuth próprio, uma conexão por empresa) e D-API para WhatsApp (uma sessão por empresa).

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
server/       # Express: rotas, auth, integrações (Google Ads, WhatsApp), detecção de venda
public/t.js   # script de rastreio (pixel) servido em /t.js, identifica a empresa via data-empresa
web/          # frontend React (Vite) — Empresas, Dashboard, Conversas, Google Ads, WhatsApp, Regras de Venda
data/         # banco SQLite (criado automaticamente, não versionado)
```
