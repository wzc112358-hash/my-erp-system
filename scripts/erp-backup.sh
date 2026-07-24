#!/bin/bash
# ============================================================================
# ERP 自动备份脚本（PocketBase 数据库 + 附件 → 阿里云 OSS）
# 用法：手动跑 /erp-backup/scripts/erp-backup.sh，或由 cron 每天 02:00 触发
# 备份内容：北京+兰州两个 PocketBase 的 data.db（在线安全备份）+ storage 附件
# 保留策略：OSS 端日备 7 天 + 周备 4 周（由 lifecycle 自动清理）
# ============================================================================
set -euo pipefail

# ---- 配置（敏感信息从单独的配置文件读，不硬编码在脚本里）----
CONFIG_FILE="/root/.ossutilconfig"
BUCKET="erp-backup-henghuacheng"
ENDPOINT="oss-cn-hangzhou.aliyuncs.com"   # ECS 在北京、OSS 在杭州，跨地域走外网
ERP_DIR="/root/my-erp-system"
BACKUP_DIR="/tmp/erp-backup-staging"       # 临时打包目录
LOG_FILE="/var/log/erp-backup.log"

TS=$(date +%Y%m%d_%H%M%S)
DATE_TAG=$(date +%Y%m%d)       # 用于 OSS 路径分组
WEEK_TAG=$(date +%Y_w%V)       # 周备路径

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG_FILE"; }

# ---- 0. 前置检查 ----
if [ ! -f "$CONFIG_FILE" ]; then
  echo "[FATAL] ossutil 配置文件 $CONFIG_FILE 不存在，无法备份" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
log "========== ERP 备份开始 (TS=$TS) =========="

# ---- 1. 在线安全备份 SQLite（用 .backup 命令，不会锁库）----
# 关键：PocketBase 正在运行，不能直接 cp data.db（可能拷到半写状态）。
# SQLite 的 .backup 命令会在一个事务里导出一致性快照，对在线库安全。
log "[1/4] 在线备份 SQLite 数据库..."
mkdir -p "$BACKUP_DIR/db"

for region in beijing lanzhou; do
  SRC="$ERP_DIR/backend/pb_data_${region}/data.db"
  DST="$BACKUP_DIR/db/${region}_data.db"
  if [ ! -f "$SRC" ]; then
    log "  ⚠️ $region 数据库不存在，跳过"
    continue
  fi
  # 用 sqlite3 .backup 命令（如果服务器没装 sqlite3，回退到 PocketBase 的内置备份）
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$SRC" ".backup '$DST'" 2>>"$LOG_FILE" && log "  ✅ $region DB 已备份 ($(du -h "$DST" | cut -f1))"
  else
    # 兜底：cp（短暂读取，WAL 模式下相对安全，但不如 .backup 严谨）
    cp "$SRC" "$DST" && log "  ⚠️ $region DB 用 cp 备份（建议装 sqlite3 用 .backup）"
  fi
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
ARCHIVE_SIZE=$(du -h "$ARCHIVE" | cut -f1)
log "  总包大小: $ARCHIVE_SIZE"

# 上传到 OSS（日备路径）
OSS_PATH="oss://${BUCKET}/daily/${DATE_TAG}/erp-backup-${TS}.tar.gz"
ossutil64 cp "$ARCHIVE" "$OSS_PATH" \
  -c "$CONFIG_FILE" \
  -e "$ENDPOINT" \
  --force 2>>"$LOG_FILE" \
  && log "  ✅ 已上传日备: $OSS_PATH"

# 如果是周日，额外存一份到 weekly 路径（周备，保留更久）
DOW=$(date +%u)  # 1=周一 ... 7=周日
if [ "$DOW" = "7" ]; then
  WEEK_PATH="oss://${BUCKET}/weekly/${WEEK_TAG}/erp-backup-${TS}.tar.gz"
  ossutil64 cp "$ARCHIVE" "$WEEK_PATH" \
    -c "$CONFIG_FILE" \
    -e "$ENDPOINT" \
    --force 2>>"$LOG_FILE" \
    && log "  ✅ 已上传周备（周日）: $WEEK_PATH"
fi

# ---- 5. 清理本地临时文件 ----
rm -rf "$BACKUP_DIR"
log "========== 备份完成 ✅ (耗时约 $SECONDS 秒) =========="
log ""
