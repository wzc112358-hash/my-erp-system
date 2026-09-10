#!/usr/bin/env bash
set -Eeuo pipefail

ERP_DIR="/root/my-erp-system"
RELEASES_DIR="$ERP_DIR/releases"
DEPLOY_BACKUPS_DIR="$ERP_DIR/deploy-backups"
RELEASE_DIR="${1:-}"
REVISION="${2:-}"

if [[ ! "$RELEASE_DIR" =~ ^/root/my-erp-system/releases/[0-9a-f]{40}$ ]] \
  || [[ ! "$REVISION" =~ ^[0-9a-f]{40}$ ]] \
  || [ "$RELEASE_DIR" != "$RELEASES_DIR/$REVISION" ]; then
  echo "用法: $0 /root/my-erp-system/releases/<40位提交号> <40位提交号>" >&2
  exit 2
fi

for command_name in docker curl gzip sha256sum tar flock; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "缺少部署命令: $command_name" >&2
    exit 1
  }
done

exec 9>"/var/lock/my-erp-system-deploy.lock"
if ! flock -n 9; then
  echo "已有 ERP 发布任务在运行" >&2
  exit 1
fi

cd "$RELEASE_DIR"
sha256sum -c images.tar.gz.sha256 deploy-config.tar.gz.sha256
mkdir -p config
tar xzf deploy-config.tar.gz -C config

if [ ! -f "$ERP_DIR/.env" ]; then
  echo "生产环境文件不存在: $ERP_DIR/.env" >&2
  exit 1
fi

timestamp=$(date +%Y%m%d_%H%M%S)
config_backup="$DEPLOY_BACKUPS_DIR/$timestamp"
mkdir -p "$config_backup/traefik" "$config_backup/scripts"
cp "$ERP_DIR/docker-compose.yml" "$config_backup/docker-compose.yml"
cp "$ERP_DIR/traefik/traefik.yml" "$config_backup/traefik/traefik.yml"
cp "$ERP_DIR/traefik/dynamic.toml" "$config_backup/traefik/dynamic.toml"
cp "$ERP_DIR/scripts/erp-backup.sh" "$config_backup/scripts/erp-backup.sh"

compose=(
  docker compose
  --project-directory "$ERP_DIR"
  --env-file "$ERP_DIR/.env"
  -f "$ERP_DIR/docker-compose.yml"
)

declare -a image_targets=(
  "erp-frontend:my-erp-system-frontend"
  "erp-pocketbase-beijing:my-erp-system-pocketbase-beijing"
  "erp-pocketbase-lanzhou:my-erp-system-pocketbase-lanzhou"
  "erp-opportunity-agent:my-erp-system-opportunity-agent"
)

for target in "${image_targets[@]}"; do
  container_name="${target%%:*}"
  repository="${target#*:}"
  image_id=$(docker inspect --format '{{.Image}}' "$container_name")
  if docker image inspect "$image_id" >/dev/null 2>&1; then
    docker tag "$image_id" "$repository:rollback-$timestamp"
  else
    # Docker's containerd image store may drop the old manifest metadata after
    # retagging :latest even while a container still runs from that snapshot.
    # Committing the running container preserves the exact application layer;
    # business data is mounted separately and is therefore not captured here.
    docker commit "$container_name" "$repository:rollback-$timestamp" >/dev/null
  fi
done

rollback_needed=0
probe_name=""
rollback() {
  echo "发布失败，正在恢复上一版本..." >&2
  cp "$config_backup/docker-compose.yml" "$ERP_DIR/docker-compose.yml"
  cp "$config_backup/traefik/traefik.yml" "$ERP_DIR/traefik/traefik.yml"
  cp "$config_backup/traefik/dynamic.toml" "$ERP_DIR/traefik/dynamic.toml"
  cp "$config_backup/scripts/erp-backup.sh" "$ERP_DIR/scripts/erp-backup.sh"

  for target in "${image_targets[@]}"; do
    repository="${target#*:}"
    docker tag "$repository:rollback-$timestamp" "$repository:latest"
  done

  "${compose[@]}" up -d --no-build
}

on_error() {
  status=$?
  trap - ERR
  if [ -n "$probe_name" ]; then
    docker rm -f "$probe_name" >/dev/null 2>&1 || true
  fi
  if [ "$rollback_needed" -eq 1 ]; then
    rollback || echo "自动回滚失败，需要人工处理" >&2
  fi
  exit "$status"
}
trap on_error ERR

# 发布前使用新脚本生成可验证的本地快照；不会依赖 OSS 权限。
bash "$RELEASE_DIR/config/scripts/erp-backup.sh" --local-only

rollback_needed=1
gzip -dc images.tar.gz | docker load

docker compose \
  --project-directory "$ERP_DIR" \
  --env-file "$ERP_DIR/.env" \
  -f "$RELEASE_DIR/config/docker-compose.yml" \
  config --quiet

probe_name="erp-traefik-config-check-$timestamp"
cp "$ERP_DIR/traefik/acme.json" "$RELEASE_DIR/config/traefik/acme-check.json"
chmod 600 "$RELEASE_DIR/config/traefik/acme-check.json"
docker run --name "$probe_name" -d \
  -v "$RELEASE_DIR/config/traefik/traefik.yml:/etc/traefik/traefik.yml:ro" \
  -v "$RELEASE_DIR/config/traefik/dynamic.toml:/etc/traefik/dynamic.toml:ro" \
  -v "$RELEASE_DIR/config/traefik/acme-check.json:/etc/traefik/acme.json" \
  traefik:v3.7.13 \
  --configFile=/etc/traefik/traefik.yml
sleep 5
probe_status=$(docker inspect --format '{{.State.Status}}' "$probe_name")
docker logs "$probe_name"
docker stop "$probe_name" >/dev/null
docker rm "$probe_name" >/dev/null
probe_name=""
if [ "$probe_status" != "running" ]; then
  echo "Traefik 新配置无法持续运行" >&2
  false
fi

install -m 0644 "$RELEASE_DIR/config/docker-compose.yml" "$ERP_DIR/docker-compose.yml"
install -m 0644 "$RELEASE_DIR/config/traefik/traefik.yml" "$ERP_DIR/traefik/traefik.yml"
install -m 0644 "$RELEASE_DIR/config/traefik/dynamic.toml" "$ERP_DIR/traefik/dynamic.toml"
install -m 0755 "$RELEASE_DIR/config/scripts/erp-backup.sh" "$ERP_DIR/scripts/erp-backup.sh"
install -m 0755 "$RELEASE_DIR/config/scripts/deploy-release.sh" "$ERP_DIR/scripts/deploy-release.sh"

"${compose[@]}" config --quiet
"${compose[@]}" up -d --no-build

services_healthy() {
  local container_name
  for container_name in \
    erp-frontend \
    erp-pocketbase-beijing \
    erp-pocketbase-lanzhou \
    erp-opportunity-agent \
    erp-traefik; do
    [ "$(docker inspect --format '{{.State.Status}}' "$container_name" 2>/dev/null)" = "running" ] || return 1
  done

  curl -fsS --max-time 15 https://erp.henghuacheng.cn/ >/dev/null \
    && curl -fsS --max-time 15 https://api-beijing.henghuacheng.cn/api/health >/dev/null \
    && curl -fsS --max-time 15 https://api-lanzhou.henghuacheng.cn/api/health >/dev/null
}

healthy=0
for _attempt in $(seq 1 12); do
  if services_healthy; then
    healthy=1
    break
  fi
  sleep 5
done

if [ "$healthy" -ne 1 ]; then
  echo "发布后健康检查未通过" >&2
  false
fi

printf '%s\n' "$REVISION" >"$ERP_DIR/REVISION"
rollback_needed=0
trap - ERR

rm -f "$RELEASE_DIR/images.tar.gz"
docker image prune -f >/dev/null

echo "ERP 发布完成: $REVISION"
"${compose[@]}" ps
