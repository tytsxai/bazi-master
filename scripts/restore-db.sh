#!/usr/bin/env bash
set -euo pipefail

# Configuration
CONTAINER_NAME="${CONTAINER_NAME:-bazi_postgres}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-bazi_master}"

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <path_to_backup_file.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[ERROR] File $BACKUP_FILE not found."
  exit 1
fi

echo "[WARNING] This will OVERWRITE database $DB_NAME in container $CONTAINER_NAME."
read -p "Are you sure? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

echo "[INFO] Restoring from $BACKUP_FILE..."

# Unzip and pipe to psql
gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME"

echo "[SUCCESS] Restore complete."
