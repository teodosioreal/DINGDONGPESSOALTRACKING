# DingDong — multi-empresa

Rastreamento de conversões do WhatsApp ligadas a cliques do Google Ads. Um login só (seu), mas gerencia **várias empresas/clientes**, cada uma com sua própria conexão Google Ads e WhatsApp.

## O que faz

1. Cada empresa instala o próprio script `t.js` (com o id da empresa) no site dela — ele captura o `gclid` do clique de anúncio e marca os links de WhatsApp da página com um código de rastreio.
2. Quando alguém clica em "falar no WhatsApp", a mensagem chega no número daquela empresa já com esse código.
3. O sistema liga a conversa ao clique original (gclid) automaticamente.
4. Uma regra de palavras-chave (configurável por empresa, sem IA) detecta quando a conversa virou venda e, se conseguir achar um valor em reais na mensagem, marca a conversa como venda provável.
5. As conversões confirmadas entram numa fila e são enviadas pro Google Ads automaticamente duas vezes por dia (08h e 20h, horário de Brasília) — ou na hora, se você clicar em "Enviar agora" no Painel.

Ao criar uma empresa, o fluxo já leva direto pra conexão do WhatsApp: um clique cria a sessão no D-API automaticamente (nome, webhook e eventos já configurados) e mostra o QR code — ou dá pra pular e configurar depois.

## Funcionalidades

- **Multi-empresa**: um login administrador só, várias empresas isoladas (cada uma com sua própria conexão Google Ads, sessão WhatsApp, regras de venda e bloqueio de IP).
- **Conexão automática do WhatsApp**: cria a sessão no D-API com um clique (sem precisar copiar Session ID/API Key manualmente); QR code fica disponível até conectar.
- **Fila de envio**: vendas confirmadas esperam numa fila e são enviadas ao Google Ads automaticamente às 08h/20h (horário de Brasília), com opção de enviar na hora ou cancelar; mostra o erro da última tentativa quando falha.
- **Checklist de setup**: o Painel de cada empresa mostra o que ainda falta configurar (Google Ads, WhatsApp, regras de venda, script de rastreio).
- **Contador de mensagens não lidas**: badge no menu lateral e indicador visual na lista de conversas.
- **Bloqueio de IP**: bloqueia cliques/visitas de IPs específicos pra não poluir as métricas.
- **Modo escuro**: alternável no canto superior direito, aplicado em todo o app.
- **Trocar senha**: em "Minha conta", sem precisar mexer no `.env` do servidor.

## Stack

- Backend: Node.js + Express (um processo só, sem SSR, sem framework pesado).
- Banco: SQLite (um arquivo, sem serviço externo).
- Frontend: React + Vite + Tailwind, servido como arquivos estáticos pelo próprio Express.
- Integrações: Google Ads API (app OAuth próprio, uma conexão por empresa) e D-API para WhatsApp (uma sessão por empresa, criada automaticamente).

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
