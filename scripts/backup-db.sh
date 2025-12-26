#!/usr/bin/env bash
set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
CONTAINER_NAME="${CONTAINER_NAME:-bazi_postgres}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-bazi_master}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"
CHECKSUM_FILE="$FILENAME.sha256"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

log_info "Starting backup of $DB_NAME from container $CONTAINER_NAME..."

# Pre-flight checks
log_info "Running pre-flight checks..."

# Check if container is running
if ! docker ps | grep -q "$CONTAINER_NAME"; then
  log_error "Container $CONTAINER_NAME is not running!"
  log_info "Available containers:"
  docker ps --format "table {{.Names}}\t{{.Status}}"
  exit 1
fi

# Check database connectivity
log_info "Checking database connectivity..."
if ! docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
  log_error "Cannot connect to database $DB_NAME"
  exit 1
fi

# Get database size for logging
DB_SIZE=$(docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));" 2>/dev/null | tr -d ' ')
log_info "Database size: ${DB_SIZE:-unknown}"

# Perform Backup with progress indication
log_info "Starting backup process..."
START_TIME=$(date +%s)

# Use pg_dump with custom format for better compression and features
if docker exec -t "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom --compress=9 --verbose | gzip > "$FILENAME" 2>/dev/null; then
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    BACKUP_SIZE=$(du -h "$FILENAME" | cut -f1)
    log_success "Backup completed successfully in ${DURATION}s"
    log_success "Backup saved to $FILENAME (size: $BACKUP_SIZE)"
else
    log_error "Backup failed!"
    exit 1
fi

# Generate checksum for integrity verification
log_info "Generating checksum..."
sha256sum "$FILENAME" | cut -d' ' -f1 > "$CHECKSUM_FILE"
log_success "Checksum saved to $CHECKSUM_FILE"

# Verify backup integrity
log_info "Verifying backup integrity..."
if gunzip -c "$FILENAME" | pg_restore --list >/dev/null 2>&1; then
    log_success "Backup integrity verified"
else
    log_error "Backup integrity check failed!"
    rm -f "$FILENAME" "$CHECKSUM_FILE"
    exit 1
fi

# Generate backup metadata
METADATA_FILE="$FILENAME.meta.json"
cat > "$METADATA_FILE" << EOF
{
  "database": "$DB_NAME",
  "container": "$CONTAINER_NAME",
  "timestamp": "$TIMESTAMP",
  "size": "$(stat -f%z "$FILENAME" 2>/dev/null || stat -c%s "$FILENAME")",
  "checksum": "$(cat "$CHECKSUM_FILE")",
  "format": "custom_compressed_gzip",
  "created_by": "$(whoami)@$(hostname)",
  "duration_seconds": $DURATION
}
EOF

# Cleanup old backups
log_info "Cleaning up old backups (keeping last $RETENTION_DAYS days)..."
DELETED_COUNT=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$RETENTION_DAYS" -print -delete | wc -l)
if [ "$DELETED_COUNT" -gt 0 ]; then
    log_info "Cleaned up $DELETED_COUNT old backup(s)"
fi

# Also cleanup old checksum and metadata files
find "$BACKUP_DIR" -name "${DB_NAME}_*.sha256" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "${DB_NAME}_*.meta.json" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true

# Generate backup report
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo "unknown")

log_success "Backup operation completed!"
echo
log_info "=== Backup Summary ==="
echo "  Database: $DB_NAME"
echo "  Container: $CONTAINER_NAME"
echo "  Backup file: $FILENAME"
echo "  Size: $BACKUP_SIZE"
echo "  Duration: ${DURATION}s"
echo "  Checksum: $(cat "$CHECKSUM_FILE")"
echo "  Total backups: $BACKUP_COUNT"
echo "  Backup directory size: $TOTAL_SIZE"
echo
log_info "=== Retention Policy ==="
echo "  Keep backups for: $RETENTION_DAYS days"
echo "  Next cleanup: $(date -d "+${RETENTION_DAYS} days" '+%Y-%m-%d' 2>/dev/null || echo 'manual cleanup required')"
echo
log_warn "Remember to:"
echo "  - Store backups in remote location (S3, etc.)"
echo "  - Test restore procedure regularly"
echo "  - Monitor backup directory disk usage"
