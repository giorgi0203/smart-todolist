#!/usr/bin/env bash
set -euo pipefail
release_id=${1:?source SHA required}
[[ $release_id =~ ^[a-f0-9]{40}$ ]]
ip -4 -o addr show | grep '138.68.64.163/' >/dev/null
release=/var/www/smart-todolist-workspace/releases/$release_id
[[ -f "$release/server.js" ]]
install -d -m 755 /var/www/giorgi-identity /var/www/auth-acme
previous=$(readlink /var/www/giorgi-identity/current || true)
ln -sfn "$release" /var/www/giorgi-identity/current
cat > /etc/systemd/system/giorgi-identity.service <<'UNIT'
[Unit]
Description=Shared Giorgi account and private analytics
After=network.target
[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/giorgi-identity/current
ExecStart=/opt/smart-todo-node-24.22.1/bin/node server.js
Environment=NODE_ENV=production
Environment=APP_ROLE=identity
Environment=PORT=3100
Environment=HOSTNAME=127.0.0.1
Environment=APP_URL=https://auth.giorgi.app
Environment=AUTH_PUBLIC_URL=https://auth.giorgi.app
Environment=DATABASE_PATH=/var/lib/smart-todolist/workspace.sqlite
Environment=EMAIL_CONFIG_FILE=/etc/smart-todolist/email.json
Environment=NEXT_TELEMETRY_DISABLED=1
UMask=0077
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now giorgi-identity
systemctl restart giorgi-identity
ready=0
for attempt in {1..20};do
 if curl -fsS --max-time 3 http://127.0.0.1:3100/api/health -o /tmp/giorgi-identity-health.json && python3 -c 'import json;x=json.load(open("/tmp/giorgi-identity-health.json"));assert x["service"]=="giorgi-identity" and x["status"]=="ok"';then ready=1;break;fi
 sleep 1
done
if [[ "$ready" != 1 ]];then
 if [[ -n "$previous" ]];then ln -sfn "$previous" /var/www/giorgi-identity/current;systemctl restart giorgi-identity;fi
 exit 1
fi
site=/etc/nginx/sites-available/giorgi-identity
if [[ ! -f /etc/letsencrypt/live/auth.giorgi.app/fullchain.pem ]];then
 cat > "$site" <<'NGINX'
server {
 listen 80;
 server_name auth.giorgi.app;
 location /.well-known/acme-challenge/ { root /var/www/auth-acme; }
 location / { return 301 https://auth.giorgi.app$request_uri; }
}
NGINX
 ln -sfn "$site" /etc/nginx/sites-enabled/giorgi-identity
 nginx -t
 systemctl reload nginx
 certbot certonly --webroot -w /var/www/auth-acme -d auth.giorgi.app --non-interactive --agree-tos
fi
cat > "$site" <<'NGINX'
server {
 listen 80;
 server_name auth.giorgi.app;
 location /.well-known/acme-challenge/ { root /var/www/auth-acme; }
 location / { return 301 https://auth.giorgi.app$request_uri; }
}
server {
 listen 443 ssl;
 server_name auth.giorgi.app;
 ssl_certificate /etc/letsencrypt/live/auth.giorgi.app/fullchain.pem;
 ssl_certificate_key /etc/letsencrypt/live/auth.giorgi.app/privkey.pem;
 client_max_body_size 128k;
 location / {
  proxy_pass http://127.0.0.1:3100;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_buffering off;
 }
}
NGINX
ln -sfn "$site" /etc/nginx/sites-enabled/giorgi-identity
nginx -t
systemctl reload nginx
curl -fsS --max-time 15 https://auth.giorgi.app/api/health >/dev/null
[[ $(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' https://auth.giorgi.app/api/projects) == 404 ]]
echo 'Shared identity service and HTTPS are ready'
