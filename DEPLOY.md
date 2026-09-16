# Deploy na Hostinger (VPS)

Guia passo a passo pra colocar o DingDong pessoal no ar. Precisa ser uma **VPS** (Ubuntu, acesso root) — hospedagem compartilhada não roda um processo Node.js persistente.

## Caminho rápido (recomendado): script + deploy automático

1. No terminal da Hostinger (root), rode uma vez: `bash <(curl -fsSL https://raw.githubusercontent.com/teodosioreal/DINGDONGPESSOALTRACKING/main/scripts/bootstrap-vps.sh) SEUDOMINIO.COM.BR`
2. Edite `/var/www/dingdong/.env` com os valores reais e rode `npm --prefix /var/www/dingdong run build && systemctl start dingdong`.
3. Rode o Certbot (o script mostra o comando exato no final).
4. No GitHub, em Settings → Secrets and variables → Actions, cadastre `VPS_HOST` (IP), `VPS_USER` (`root`) e `VPS_SSH_KEY` (a chave privada correspondente à pública que você autorizou em `~/.ssh/authorized_keys`).

Depois disso, todo `git push` na branch `main` atualiza a VPS sozinho (veja `.github/workflows/deploy.yml`) — nenhum acesso manual é necessário para futuras mudanças.

Os passos manuais abaixo (1 a 6) explicam o que o script faz, caso queira revisar ou ajustar algo por conta própria.

## 0. Antes de começar

Você vai precisar, fora do servidor:

1. **Domínio** apontando pro IP da VPS (registro A no DNS).
2. **App OAuth do Google Ads** — no [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Criar um projeto (ou usar um existente).
   - "Criar credenciais" → "ID do cliente OAuth" → tipo "Aplicativo da Web".
   - Em "URIs de redirecionamento autorizados", adicionar: `https://SEUDOMINIO/auth/callback/google-ads`.
   - Anotar o **Client ID** e o **Client Secret**.
   - Ativar a "Google Ads API" no projeto.
3. **Developer Token do Google Ads** — na sua conta Google Ads, em Ferramentas e Configurações → Central da API. Se ele só tiver acesso "Test accounts", conversões só funcionam em contas de teste até você solicitar o acesso Básico.
   - Não precisa anotar número de MCC — a tela Google Ads do painel lista as contas/MCCs acessíveis e deixa escolher, funciona com qualquer uma.
4. **Conta D-API** com um número de WhatsApp — anotar o **Session ID** e a **API Key** (esses dois NÃO vão pro `.env`, você preenche direto na tela WhatsApp do painel depois que o app estiver no ar).
5. No dashboard da D-API, configurar o webhook "Ao receber mensagem" para: `https://SEUDOMINIO/api/public/whatsapp/webhook?chave=SEGREDO_QUE_VOCE_ESCOLHER` (o mesmo valor vai no `WHATSAPP_WEBHOOK_SECRET` do `.env`).

## 1. Provisionar a VPS

Contrate uma VPS Hostinger com Ubuntu 22.04 ou 24.04. Aponte o DNS do domínio pro IP dela antes de continuar (a emissão do certificado HTTPS no passo 5 depende disso já estar propagado).

Acesse por SSH e instale as dependências:

```bash
apt update && apt upgrade -y
apt install -y nginx git ufw

# Node.js LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# Firewall básico
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

## 2. Clonar o projeto

```bash
mkdir -p /var/www/dingdong
git clone <URL_DO_SEU_REPOSITORIO_GITHUB> /var/www/dingdong
cd /var/www/dingdong
npm install
```

## 3. Configurar o `.env`

```bash
cp .env.example .env
nano .env
```

Preencha com os valores reais (do passo 0):

```env
PORT=3000
APP_PUBLIC_URL=https://SEUDOMINIO
SESSION_SECRET=<gere com: openssl rand -hex 32>
ADMIN_USER=<seu usuário>
ADMIN_PASSWORD_HASH=<gere no passo abaixo>

GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_ADS_DEVELOPER_TOKEN=...

DAPI_BASE_URL=https://api.d-api.cloud
WHATSAPP_WEBHOOK_SECRET=<o mesmo que você colocou na URL do webhook da D-API>
```

O Session ID e a API Key da D-API **não vão aqui** — você preenche na tela WhatsApp do painel depois que o app estiver rodando (passo 6).

Gerar o hash da senha de login:

```bash
npm run setup:admin -- "sua-senha-forte"
```

Copie a linha `ADMIN_PASSWORD_HASH=...` que aparecer pro `.env`.

## 4. Build e serviço systemd

```bash
npm run build
```

Crie `/etc/systemd/system/dingdong.service`:

```ini
[Unit]
Description=DingDong (uso pessoal)
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/dingdong
EnvironmentFile=/var/www/dingdong/.env
ExecStart=/usr/bin/node /var/www/dingdong/server/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
chown -R www-data:www-data /var/www/dingdong
systemctl daemon-reload
systemctl enable --now dingdong
systemctl status dingdong
curl -I http://127.0.0.1:3000/
```

Se der erro, veja o log com `journalctl -u dingdong -n 100 --no-pager`.

## 5. Nginx + HTTPS

Crie `/etc/nginx/sites-available/dingdong`:

```nginx
server {
    listen 80;
    server_name SEUDOMINIO www.SEUDOMINIO;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/dingdong /etc/nginx/sites-enabled/dingdong
nginx -t && systemctl reload nginx

# HTTPS com Let's Encrypt
apt install -y certbot python3-certbot-nginx
certbot --nginx -d SEUDOMINIO -d www.SEUDOMINIO
```

O Certbot já ajusta o Nginx pra redirecionar HTTP → HTTPS e agenda a renovação automática do certificado.

## 6. Testar de ponta a ponta

1. Abra `https://SEUDOMINIO/login` e entre com o usuário/senha configurados.
2. Vá em **Google Ads** → Conectar conta → autorize com sua conta Google → escolha a conta de anúncios (se aparecer marcada como "MCC", clique pra ver as contas de dentro dela e escolha a conta de anúncio de verdade).
3. Vá em **WhatsApp** → cole o Session ID e a API Key da D-API → Salvar → gere o QR Code → escaneie com o celular.
   - Se o status/QR Code não carregar, os caminhos exatos da API da D-API podem ser diferentes dos que usei em `server/whatsapp.js` (marcado em comentário no arquivo) — confira a documentação da D-API e ajusta ali.
4. Vá em **Instalar Rastreio** → copie o script → cole no `<head>` do seu site.
5. Clique num link de WhatsApp do seu site com `?gclid=teste123` na URL, mande a mensagem — ela deve aparecer em **Conversas** já com origem "Google Ads".
6. Marque uma venda de teste e confira a resposta do envio da conversão.

## Atualizar depois de uma mudança de código

```bash
cd /var/www/dingdong
git pull
npm install
npm run build
systemctl restart dingdong
```

## Backup

O banco inteiro é um arquivo só: `/var/www/dingdong/data/dingdong.sqlite`. Faça uma cópia periódica dele (cron + `rsync`/`scp` pra outro lugar, ou um script simples de backup) — é tudo que existe pra restaurar em caso de problema na VPS.
