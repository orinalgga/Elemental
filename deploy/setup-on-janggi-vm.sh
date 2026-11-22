#!/usr/bin/env bash
# 장기 앱이 이미 돌고 있는 Oracle VM에서 한 번만 실행한다: bash deploy/setup-on-janggi-vm.sh
# .env를 만들고 게임 서버를 띄우고 자동 업데이트를 켠다.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! docker network inspect janggigame_default >/dev/null 2>&1; then
  echo "장기 앱(janggigame_default 네트워크)이 떠 있지 않습니다. ~/janggigame 에서 docker compose up -d 를 먼저 하세요." >&2
  exit 1
fi

if [ ! -f .env ]; then
  cat > .env <<ENV
COMPOSE_FILE=docker-compose.yml:deploy/compose.janggi.yml
JAVA_TOOL_OPTIONS=-Xmx256m
ENV
  chmod 600 .env
fi

for i in $(seq 1 60); do docker compose pull && break; sleep 30; done
docker compose up -d --no-build
bash deploy/install-auto-update.sh

IP=$(curl -fsS https://ifconfig.me)
echo
echo "게임 서버를 띄웠습니다 (VM 안에서 127.0.0.1:8082). 이제 장기 앱 caddy에 주소를 더합니다(docs/deploy.md 3단계):"
echo "  ~/janggigame/.env 에  ELEMENTAL_HOST=game.$IP.sslip.io"
echo "  cd ~/janggigame && docker compose up -d caddy"
echo "그 다음 https://game.$IP.sslip.io 로 들어가면 됩니다."
