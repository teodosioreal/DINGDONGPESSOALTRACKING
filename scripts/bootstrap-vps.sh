#!/usr/bin/env bash
# Provisionamento inicial da VPS — rodar UMA VEZ, como root, no terminal da Hostinger.
# Uso: bash bootstrap-vps.sh SEUDOMINIO.COM.BR
set -euo pipefail

DOMAIN="${1:?Uso: bash bootstrap-vps.sh SEUDOMINIO.COM.BR}"
REPO_URL="https://github.com/teodosioreal/DINGDONGPESSOALTRACKING.git"
APP_DIR="/var/www/dingdong"

echo ">> Instalando dependências do sistema..."
apt-get update -y
apt-get install -y nginx git ufw curl certbot python3-certbot-nginx

if ! command -v node >/dev/null 2>&1; then
  echo ">> Instalando Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo ">> Configurando firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ">> Clonando o projeto..."
mkdir -p "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
npm install

if [ ! -f "$APP_DIR/.env" ]; then
  cp .env.example .env
  echo ">> Criei $APP_DIR/.env a partir do exemplo — edite com os valores reais (nano $APP_DIR/.env) antes de iniciar o serviço."
fi

npm run build || echo ">> Build falhou (provavelmente falta preencher o .env) — normal nesta etapa, ajuste o .env e rode 'npm run build' de novo depois."

echo ">> Criando o serviço systemd..."
cat > /etc/systemd/system/dingdong.service <<'EOF'
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
EOF

chown -R www-data:www-data "$APP_DIR"
systemctl daemon-reload
systemctl enable dingdong

echo ">> Configurando o Nginx..."
rm -f /etc/nginx/sites-enabled/default
cat > /etc/nginx/sites-available/dingdong <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $DOMAIN www.$DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
ln -sf /etc/nginx/sites-available/dingdong /etc/nginx/sites-enabled/dingdong
nginx -t && systemctl reload nginx

cat <<EOF

==========================================================
Provisionamento concluído. Falta:

1. Editar o .env com os valores reais:
   nano $APP_DIR/.env

2. Depois de salvar o .env:
   npm --prefix $APP_DIR run build
   systemctl start dingdong
   systemctl status dingdong

3. Confirme que o DNS de $DOMAIN já aponta pra este servidor, depois rode:
   certbot --nginx -d $DOMAIN -d www.$DOMAIN
==========================================================
EOF
