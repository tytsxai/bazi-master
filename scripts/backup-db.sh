#!/usr/bin/env bash
set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
CONTAINER_NAME="${CONTAINER_NAME:-bazi_postgres}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-bazi_master}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "[INFO] Starting backup of $DB_NAME from container $CONTAINER_NAME..."

# Check if container is running
if ! docker ps | grep -q "$CONTAINER_NAME"; then
  echo "[ERROR] Container $CONTAINER_NAME is not running!"
  exit 1
fi

# Perform Backup (pg_dump -> gzip)
docker exec -t "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip > "$FILENAME"

echo "[SUCCESS] Backup saved to $FILENAME"

# Cleanup old backups (keep last 7 days)
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +7 -delete
echo "[INFO] Old backups cleaned up."
