#!/usr/bin/env bash
# Install a verified standalone bundle; never build on the 1 GB droplet.
set -euo pipefail
umask 077
stage=${1:?bundle directory required}
release_id=${2:?release identifier required}
[[ $release_id =~ ^[a-f0-9]{7,64}$ ]] || exit 2
[[ $(id -u) = 0 ]] || { echo 'Run the installer with sudo.' >&2; exit 2; }
[[ -n ${SMART_TODO_AI_KEY:-} ]] || { echo 'SMART_TODO_AI_KEY is missing; live service was not changed.' >&2; exit 2; }
ip -4 -o addr show | grep '138.68.64.163/' >/dev/null
test -f "$stage/app/server.js"
base=/var/www/smart-todolist-workspace
runtime=/opt/smart-todo-node-24.22.1
release=$base/releases/$release_id
state=/var/lib/smart-todolist
config=/etc/smart-todolist/ai.json
dropin=/etc/systemd/system/smart-todolist-web.service.d/90-workspace.conf
backup=/var/backups/smart-todolist/$(date -u +%Y%m%dT%H%M%SZ)-$release_id
mkdir -p "$base/releases" "$backup" "$(dirname "$dropin")" /etc/smart-todolist
chmod 700 "$backup"
chmod 755 "$base" "$base/releases"
old_current=$(readlink "$base/current" || true)
had_dropin=0
if test -f "$dropin"; then cp -p "$dropin" "$backup/override.conf"; had_dropin=1; fi
had_config=0
if test -f "$config"; then cp -p "$config" "$backup/ai.json"; had_config=1; fi
# Preserve the old shared data without assigning it to a new account.
if test -d /var/www/smart-todolist/shared; then cp -a /var/www/smart-todolist/shared "$backup/legacy-shared"; fi
if test -f /var/www/smart-todolist/current/agent/appsettings.Production.json; then
  cp -p /var/www/smart-todolist/current/agent/appsettings.Production.json "$backup/legacy-agent.json"
fi
if test -f "$state/workspace.sqlite"; then
  python3 - "$state/workspace.sqlite" "$backup/workspace.sqlite" <<'PY'
import sqlite3,sys
with sqlite3.connect(sys.argv[1]) as source, sqlite3.connect(sys.argv[2]) as target:
    source.backup(target)
PY
fi
if ! test -x "$runtime/bin/node"; then
  curl --fail --location --silent --show-error --max-time 120 \
    https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-x64.tar.xz -o "$stage/node.tar.xz"
  printf '%s  %s\n' '6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6' "$stage/node.tar.xz" | sha256sum --check --strict
  mkdir -p "$runtime"
  tar -xJf "$stage/node.tar.xz" --strip-components=1 -C "$runtime" --no-same-owner
  chmod -R a+rX "$runtime"
fi
"$runtime/bin/node" --version
test "$("$runtime/bin/node" -p 'process.versions.node.split(".")[0]')" = 24
if ! test -d "$release"; then
  mkdir "$release"
  cp -a "$stage/app/." "$release/"
  chmod -R a+rX "$release"
fi
install -d -o www-data -g www-data -m 0700 "$state"
chown root:www-data /etc/smart-todolist
chmod 750 /etc/smart-todolist
changed=0
rollback() {
  code=$?
  trap - EXIT
  if test "$code" != 0 && test "$changed" = 1; then
    echo 'Health check failed; restoring the previous web service.' >&2
    if test "$had_dropin" = 1; then cp -p "$backup/override.conf" "$dropin"; else rm -f "$dropin"; fi
    if test "$had_config" = 1; then cp -p "$backup/ai.json" "$config"; else rm -f "$config"; fi
    if test -n "$old_current"; then ln -sfn "$old_current" "$base/current"; else rm -f "$base/current"; fi
    systemctl daemon-reload
    systemctl restart smart-todolist-web || true
  fi
  exit "$code"
}
trap rollback EXIT
changed=1
python3 - "$config" <<'PY'
import json,os,sys,grp
key=os.environ['SMART_TODO_AI_KEY'].strip()
if not key or any(c.isspace() for c in key):
    raise SystemExit('Invalid AI key format; refusing deployment.')
path=sys.argv[1]+'.new'
with open(path,'w') as f:
    json.dump({'apiKey':key,'baseUrl':'https://api.openai.com/v1','model':'gpt-4.1-mini'},f)
os.chmod(path,0o640)
os.chown(path,0,grp.getgrnam('www-data').gr_gid)
os.replace(path,sys.argv[1])
PY
unset SMART_TODO_AI_KEY
ln -sfn "$release" "$base/current"
cat > "$dropin" <<UNIT
[Service]
User=www-data
Group=www-data
WorkingDirectory=$base/current
ExecStart=
ExecStart=$runtime/bin/node server.js
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
Environment=APP_URL=https://smart-todolist.giorgi.app
Environment=DATABASE_PATH=$state/workspace.sqlite
Environment=AI_CONFIG_FILE=$config
Environment=EMAIL_CONFIG_FILE=/etc/smart-todolist/email.json
Environment=NEXT_TELEMETRY_DISABLED=1
UMask=0077
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
UNIT
chmod 644 "$dropin"
systemctl daemon-reload
systemctl restart smart-todolist-web
healthy=0
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 3 http://127.0.0.1:3000/api/health -o "$stage/health.json" &&
    python3 - "$stage/health.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]));assert x['status']=='ok' and x['service']=='smart-todolist' and x['aiConfigured'] is True
PY
  then healthy=1; break; fi
  sleep 1
done
test "$healthy" = 1
test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/workspace)" = 401
curl -fsS --max-time 15 https://smart-todolist.giorgi.app/api/health -o /dev/null
for host in giorgi.app hls-player.giorgi.app; do
  curl -fsS --max-time 15 "https://$host/" -o /dev/null
done
systemctl is-active smart-todolist-web
echo "Workspace release $release_id is healthy. Private backup: $backup"
