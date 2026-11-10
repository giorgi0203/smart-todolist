#!/usr/bin/env bash
set -euo pipefail
stage=${1:?stage required}
source_id=${2:?source SHA required}
[[ $source_id =~ ^[a-f0-9]{40}$ ]]
[[ $stage =~ ^/(var/)?tmp/smart-workspace-[a-f0-9]{40}$ ]]
base=/var/www/smart-todolist-workspace
previous=$(readlink "$base/current")
identity_previous=$(readlink /var/www/giorgi-identity/current || true)
cp -p /etc/systemd/system/smart-todolist-web.service.d/90-workspace.conf "$stage/previous-workspace.conf"
restore_suite(){
 code=$?;trap - EXIT
 if [[ $code != 0 ]];then
  echo 'Shared service deployment failed; restoring the previous workspace service' >&2
  ln -sfn "$previous" "$base/current"
  cp -p "$stage/previous-workspace.conf" /etc/systemd/system/smart-todolist-web.service.d/90-workspace.conf
  if [[ -n "$identity_previous" ]];then ln -sfn "$identity_previous" /var/www/giorgi-identity/current;fi
  systemctl daemon-reload;systemctl restart smart-todolist-web || true
  systemctl restart giorgi-identity || true
  if [[ -f /etc/systemd/system/giorgi-learning.service ]];then systemctl restart giorgi-learning || true;fi
 fi
 rm -rf -- "$stage/app" "$stage/bundle.tar.gz" "$stage/node.tar.xz"
 exit "$code"
}
trap restore_suite EXIT
bash "$stage/deploy/install-workspace.sh" "$stage" "$source_id"
bash "$stage/deploy/install-identity.sh" "$source_id"
if [[ -f /etc/systemd/system/giorgi-learning.service ]]; then systemctl restart giorgi-learning; fi
python3 "$stage/deploy/verify-shared-auth.py"
python3 "$stage/deploy/verify-workspace.py"
