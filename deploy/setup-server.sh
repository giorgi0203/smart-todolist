#!/bin/bash
# =============================================================
# Smart TodoList - Server Setup Script
# Run this ONCE on a fresh Ubuntu droplet to prepare for deploys
# Usage: ssh root@your-droplet 'bash -s' < deploy/setup-server.sh
# =============================================================

set -euo pipefail

APP_NAME="smart-todolist"
DOMAIN="smart-todolist.giorgi.app"  # <-- Change this to your actual domain

echo "=== Setting up server for ${APP_NAME} ==="

# Update system
echo "Updating system packages..."
apt-get update && apt-get upgrade -y

# Install Node.js 20
echo "Installing Node.js 20..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo "Node.js version: $(node --version)"

# Install .NET 10 runtime
echo "Installing .NET 10 runtime..."
if ! command -v dotnet &> /dev/null; then
    apt-get install -y dotnet-runtime-10.0 || {
        # Fallback: use Microsoft package feed
        wget https://dot.net/v1/dotnet-install.sh -O dotnet-install.sh
        chmod +x dotnet-install.sh
        ./dotnet-install.sh --runtime aspnetcore --channel 10.0 --install-dir /usr/share/dotnet
        ln -sf /usr/share/dotnet/dotnet /usr/bin/dotnet
        rm dotnet-install.sh
    }
fi
echo ".NET version: $(dotnet --info | head -3)"

# Install nginx
echo "Installing nginx..."
apt-get install -y nginx
systemctl enable nginx

# Install certbot for SSL
echo "Installing certbot..."
apt-get install -y certbot python3-certbot-nginx

# Create application directory
echo "Creating app directory..."
mkdir -p /var/www/${APP_NAME}/current/nextjs
mkdir -p /var/www/${APP_NAME}/current/agent
chown -R www-data:www-data /var/www/${APP_NAME}

# Copy nginx config
echo "Setting up nginx configuration..."
cat > /etc/nginx/sites-available/${APP_NAME} << 'NGINXCONF'
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
NGINXCONF

# Replace domain placeholder
sed -i "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" /etc/nginx/sites-available/${APP_NAME}

# Enable site
ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Setup systemd services
echo "Setting up systemd services..."

cat > /etc/systemd/system/${APP_NAME}-web.service << 'EOF'
[Unit]
Description=Smart TodoList - Next.js Web App
After=network.target smart-todolist-agent.service
Wants=smart-todolist-agent.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/smart-todolist/current/nextjs
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
StandardOutput=journal
StandardError=journal
SyslogIdentifier=smart-todolist-web

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/${APP_NAME}-agent.service << 'EOF'
[Unit]
Description=Smart TodoList - .NET Agent Backend
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/smart-todolist/current/agent
ExecStart=/var/www/smart-todolist/current/agent/ProverbsAgent
Restart=on-failure
RestartSec=5
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://127.0.0.1:8000
StandardOutput=journal
StandardError=journal
SyslogIdentifier=smart-todolist-agent

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${APP_NAME}-web
systemctl enable ${APP_NAME}-agent

# Setup SSL with certbot (interactive - will prompt for email)
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Point your DNS: ${DOMAIN} -> $(curl -s ifconfig.me)"
echo "2. Run: certbot --nginx -d ${DOMAIN}"
echo "3. Set these GitHub repo secrets:"
echo "   - DROPLET_HOST          (your droplet IP)"
echo "   - DROPLET_USERNAME      (deploy user, e.g. root)"
echo "   - DROPLET_SSH_KEY       (private SSH key)"
echo "   - DROPLET_SSH_PASSPHRASE (if key has passphrase)"
echo "   - AGENT_GITHUB_TOKEN    (GitHub token for the .NET agent AI model)"
echo "4. Push to main branch to trigger deployment!"
echo ""
