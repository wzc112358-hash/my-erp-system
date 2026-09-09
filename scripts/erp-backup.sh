#!/bin/bash
# ============================================================================
# ERP 自动备份脚本（PocketBase 数据库 + 附件 → 阿里云 OSS）
# 用法：手动跑 /root/my-erp-system/scripts/erp-backup.sh，或由 cron 每天 02:00 触发
# 备份内容：北京+兰州两个 PocketBase 的 data.db、auxiliary.db（在线安全备份）+ storage 附件
# 保留策略：OSS 端日备 7 天 + 周备 4 周（由 lifecycle 自动清理）
# ============================================================================
set -euo pipefail

MODE="${1:-}"
if [ "$MODE" != "" ] && [ "$MODE" != "--local-only" ]; then
  echo "用法: $0 [--local-only]" >&2
  exit 2
fi

# ---- 配置（敏感信息从单独的配置文件读，不硬编码在脚本里）----
CONFIG_FILE="${ERP_BACKUP_OSS_CONFIG:-/root/.ossutilconfig}"
BUCKET="erp-backup-henghuacheng"
ENDPOINT="oss-cn-hangzhou.aliyuncs.com"   # ECS 在北京、OSS 在杭州，跨地域走外网
ERP_DIR="${ERP_BACKUP_SOURCE_DIR:-/root/my-erp-system}"
BACKUP_ROOT="${ERP_BACKUP_STAGING_DIR:-/tmp/erp-backup-staging}"
LOCAL_FALLBACK_DIR="${ERP_BACKUP_LOCAL_DIR:-$ERP_DIR/backups/daily-local}"
LOCAL_FALLBACK_KEEP=7
LOG_FILE="${ERP_BACKUP_LOG_FILE:-/var/log/erp-backup.log}"
OSSUTIL_BIN="${ERP_BACKUP_OSSUTIL_BIN:-/usr/local/bin/ossutil64}"

TS=$(date +%Y%m%d_%H%M%S)
DATE_TAG=$(date +%Y%m%d)       # 用于 OSS 路径分组
WEEK_TAG=$(date +%Y_w%V)       # 周备路径
BACKUP_DIR="${BACKUP_ROOT}/${TS}"

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG_FILE"; }

preserve_local_fallback() {
  mkdir -p "$LOCAL_FALLBACK_DIR"
  local fallback_archive="$LOCAL_FALLBACK_DIR/$(basename "$ARCHIVE")"
  local fallback_checksum="$LOCAL_FALLBACK_DIR/$(basename "$SHA256_FILE")"
  mv "$ARCHIVE" "$fallback_archive"
  mv "$SHA256_FILE" "$fallback_checksum"
  rm -rf "$BACKUP_DIR"

  mapfile -t local_archives < <(
    find "$LOCAL_FALLBACK_DIR" -maxdepth 1 -type f -name 'erp-backup-*.tar.gz' \
      -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-
  )
  for ((i = LOCAL_FALLBACK_KEEP; i < ${#local_archives[@]}; i++)); do
    rm -f -- "${local_archives[$i]}"
    rm -f -- "${local_archives[$i]}.sha256"
  done

  log "  本地兜底备份已保留: $fallback_archive"
  log "  本地兜底策略: 最近 $LOCAL_FALLBACK_KEEP 份"
}

# ---- 0. 前置检查 ----
# 云端不可用不能阻止本地备份，先完成快照，再转存到持久目录。
OSS_AVAILABLE=1
if [ ! -f "$CONFIG_FILE" ]; then
  OSS_AVAILABLE=0
  log "  OSS 配置文件不存在，将只保留本地备份: $CONFIG_FILE"
fi
if [ ! -x "$OSSUTIL_BIN" ]; then
  OSS_AVAILABLE=0
  log "  ossutil 不可执行，将只保留本地备份: $OSSUTIL_BIN"
fi

mkdir -p "$BACKUP_DIR"
log "========== ERP 备份开始 (TS=$TS) =========="

# ---- 1. 在线安全备份 SQLite（用 .backup 命令，不会锁库）----
# 关键：PocketBase 正在运行，不能直接 cp data.db（可能拷到半写状态）。
# SQLite 的 .backup 命令会在一个事务里导出一致性快照，对在线库安全。
log "[1/4] 在线备份 SQLite 数据库..."
mkdir -p "$BACKUP_DIR/db"

if ! command -v sqlite3 >/dev/null 2>&1; then
  log "  ❌ sqlite3 不存在，拒绝使用 cp 复制在线数据库"
  exit 1
fi

for region in beijing lanzhou; do
  for database in data auxiliary; do
    SRC="$ERP_DIR/backend/pb_data_${region}/${database}.db"
    DST="$BACKUP_DIR/db/${region}_${database}.db"
    if [ ! -f "$SRC" ]; then
      log "  ⚠️ $region ${database}.db 不存在，跳过"
      continue
    fi
    sqlite3 "$SRC" ".backup '$DST'" 2>>"$LOG_FILE"
    if [ "$(sqlite3 "$DST" 'PRAGMA quick_check;' 2>>"$LOG_FILE")" != "ok" ]; then
      log "  ❌ $region ${database}.db 完整性校验失败"
      exit 1
    fi
    log "  ✅ $region ${database}.db 已备份并校验 ($(du -h "$DST" | cut -f1))"
  done
done

# ---- 2. 备份附件（storage 目录，直接打包 tar.gz）----
log "[2/4] 打包附件..."
mkdir -p "$BACKUP_DIR/storage"
for region in beijing lanzhou; do
  SRC="$ERP_DIR/backend/pb_data_${region}/storage"
  DST="$BACKUP_DIR/storage/${region}_storage.tar.gz"
  if [ -d "$SRC" ]; then
    tar czf "$DST" -C "$ERP_DIR/backend/pb_data_${region}" storage 2>>"$LOG_FILE" \
      && log "  ✅ $region 附件已打包 ($(du -h "$DST" | cut -f1))"
  else
    log "  ⚠️ $region storage 不存在，跳过"
  fi
done

# ---- 3. 备份迁移文件和 docker-compose（配置类，小但重要）----
log "[3/4] 打包配置文件..."
tar czf "$BACKUP_DIR/config.tar.gz" \
  -C "$ERP_DIR/backend" pb_migrations \
  -C "$ERP_DIR" docker-compose.yml 2>>"$LOG_FILE" \
  && log "  ✅ 配置文件已打包"

# ---- 4. 打总包 + 上传 OSS ----
log "[4/4] 打总包并上传 OSS..."
ARCHIVE="$BACKUP_DIR/erp-backup-${TS}.tar.gz"
tar czf "$ARCHIVE" -C "$BACKUP_DIR" db storage config.tar.gz 2>>"$LOG_FILE"
gzip -t "$ARCHIVE"
tar tzf "$ARCHIVE" >/dev/null
SHA256_FILE="${ARCHIVE}.sha256"
(
  cd "$BACKUP_DIR"
  sha256sum "$(basename "$ARCHIVE")" >"$(basename "$SHA256_FILE")"
)
ARCHIVE_SIZE=$(du -h "$ARCHIVE" | cut -f1)
log "  总包大小: $ARCHIVE_SIZE（压缩包与 SHA-256 已校验）"

if [ "$MODE" = "--local-only" ]; then
  preserve_local_fallback
  log "========== 本地备份完成 (耗时约 $SECONDS 秒) =========="
  exit 0
fi

upload_and_verify() {
  local source_file="$1"
  local oss_path="$2"
  "$OSSUTIL_BIN" cp "$source_file" "$oss_path" \
    -c "$CONFIG_FILE" \
    -e "$ENDPOINT" \
    --force 2>>"$LOG_FILE"
  "$OSSUTIL_BIN" stat "$oss_path" \
    -c "$CONFIG_FILE" \
    -e "$ENDPOINT" >/dev/null 2>>"$LOG_FILE"
}

# 上传到 OSS（日备路径）
OSS_PATH="oss://${BUCKET}/daily/${DATE_TAG}/erp-backup-${TS}.tar.gz"
if [ "$OSS_AVAILABLE" -ne 1 ]; then
  preserve_local_fallback
  log "========== 本地备份完成，OSS 未尝试 (耗时约 $SECONDS 秒) =========="
  exit 1
fi
if ! upload_and_verify "$ARCHIVE" "$OSS_PATH" \
  || ! upload_and_verify "$SHA256_FILE" "${OSS_PATH}.sha256"; then
  log "  OSS 日备上传失败，启用本地兜底"
  preserve_local_fallback
  log "========== 本地备份完成，OSS 上传失败 (耗时约 $SECONDS 秒) =========="
  exit 1
fi
log "  ✅ 已上传并确认日备及 SHA-256: $OSS_PATH"

# 如果是周日，额外存一份到 weekly 路径（周备，保留更久）
DOW=$(date +%u)  # 1=周一 ... 7=周日
if [ "$DOW" = "7" ]; then
  WEEK_PATH="oss://${BUCKET}/weekly/${WEEK_TAG}/erp-backup-${TS}.tar.gz"
  if ! upload_and_verify "$ARCHIVE" "$WEEK_PATH" \
    || ! upload_and_verify "$SHA256_FILE" "${WEEK_PATH}.sha256"; then
    log "  ❌ OSS 周备上传或校验失败；日备已成功"
    rm -rf "$BACKUP_DIR"
    exit 1
  fi
  log "  ✅ 已上传并确认周备及 SHA-256（周日）: $WEEK_PATH"
fi

# ---- 5. 清理本地临时文件 ----
rm -rf "$BACKUP_DIR"
log "========== 备份完成 ✅ (耗时约 $SECONDS 秒) =========="
log ""
