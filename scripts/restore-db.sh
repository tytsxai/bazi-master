#!/usr/bin/env bash
set -euo pipefail

# Configuration
CONTAINER_NAME="${CONTAINER_NAME:-bazi_postgres}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-bazi_master}"
SKIP_CONFIRMATION="${SKIP_CONFIRMATION:-false}"

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

show_usage() {
    echo "Usage: $0 <path_to_backup_file.sql.gz> [options]"
    echo
    echo "Options:"
    echo "  --skip-confirmation    Skip confirmation prompt"
    echo "  --dry-run             Show what would be done without executing"
    echo "  --help               Show this help"
    echo
    echo "Environment variables:"
    echo "  CONTAINER_NAME       Docker container name (default: bazi_postgres)"
    echo "  DB_USER             Database user (default: postgres)"
    echo "  DB_NAME             Database name (default: bazi_master)"
    echo "  SKIP_CONFIRMATION   Skip confirmation (default: false)"
}

# Parse arguments
DRY_RUN=false
BACKUP_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-confirmation)
            SKIP_CONFIRMATION=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        -*)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
        *)
            if [ -z "$BACKUP_FILE" ]; then
                BACKUP_FILE="$1"
            else
                log_error "Multiple backup files specified"
                show_usage
                exit 1
            fi
            shift
            ;;
    esac
done

if [ -z "$BACKUP_FILE" ]; then
    log_error "Backup file not specified"
    show_usage
    exit 1
fi

# Validate backup file
if [ ! -f "$BACKUP_FILE" ]; then
    log_error "Backup file '$BACKUP_FILE' not found"
    exit 1
fi

# Check if it's a compressed file
if [[ "$BACKUP_FILE" == *.gz ]]; then
    if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
        log_error "Backup file is corrupted (gzip test failed)"
        exit 1
    fi
fi

# Check checksum if available
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [ -f "$CHECKSUM_FILE" ]; then
    log_info "Verifying backup checksum..."
    if ! sha256sum -c "$CHECKSUM_FILE" >/dev/null 2>&1; then
        log_error "Backup checksum verification failed!"
        exit 1
    fi
    log_success "Backup checksum verified"
fi

# Show backup metadata if available
METADATA_FILE="${BACKUP_FILE}.meta.json"
if [ -f "$METADATA_FILE" ]; then
    log_info "Backup metadata:"
    cat "$METADATA_FILE" | jq . 2>/dev/null || cat "$METADATA_FILE"
    echo
fi

# Pre-flight checks
log_info "Running pre-flight checks..."

# Check if container is running
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    log_error "Container $CONTAINER_NAME is not running!"
    log_info "Available containers:"
    docker ps --format "table {{.Names}}\t{{.Status}}"
    exit 1
fi

# Get current database info
log_info "Current database information:"
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "
    SELECT current_database() as database,
           current_user as user,
           version() as version;
" 2>/dev/null || log_warn "Could not retrieve database info"

# Confirmation prompt
if [ "$SKIP_CONFIRMATION" != "true" ] && [ "$DRY_RUN" != "true" ]; then
    echo
    log_warn "⚠️  DANGER ZONE ⚠️"
    echo "This will COMPLETELY OVERWRITE database '$DB_NAME' in container '$CONTAINER_NAME'"
    echo "All existing data will be LOST!"
    echo
    echo "Backup file: $BACKUP_FILE"
    echo "Target database: $DB_NAME"
    echo "Target container: $CONTAINER_NAME"
    echo
    read -p "Are you absolutely sure? Type 'YES' to continue: " -r
    echo
    if [[ ! $REPLY =~ ^YES$ ]]; then
        log_info "Operation cancelled by user"
        exit 0
    fi
fi

if [ "$DRY_RUN" = "true" ]; then
    log_info "DRY RUN MODE - Would execute the following:"
    echo "  1. Terminate active connections to $DB_NAME"
    echo "  2. Drop and recreate database $DB_NAME"
    echo "  3. Restore from $BACKUP_FILE"
    echo "  4. Run post-restore validation"
    exit 0
fi

log_info "Starting database restore process..."
START_TIME=$(date +%s)

# Create pre-restore backup (safety measure)
PRE_RESTORE_BACKUP="/tmp/pre_restore_$(date +%s).sql"
log_info "Creating pre-restore safety backup..."
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom > "$PRE_RESTORE_BACKUP" 2>/dev/null || {
    log_warn "Failed to create pre-restore backup, but continuing..."
    PRE_RESTORE_BACKUP=""
}

# Terminate active connections to the database
log_info "Terminating active connections to $DB_NAME..."
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c "
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
" >/dev/null 2>&1 || log_warn "Could not terminate active connections"

# Drop and recreate database
log_info "Dropping and recreating database $DB_NAME..."
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c "
    DROP DATABASE IF EXISTS \"$DB_NAME\";
    CREATE DATABASE \"$DB_NAME\";
" >/dev/null

# Perform restore
log_info "Restoring database from backup..."
if [[ "$BACKUP_FILE" == *.gz ]]; then
    gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" pg_restore -U "$DB_USER" -d "$DB_NAME" --verbose --no-owner --no-privileges
else
    docker exec -i "$CONTAINER_NAME" pg_restore -U "$DB_USER" -d "$DB_NAME" --verbose --no-owner --no-privileges < "$BACKUP_FILE"
fi

# Post-restore validation
log_info "Running post-restore validation..."

# Check if database is accessible
if ! docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
    log_error "Post-restore validation failed: database not accessible"
    log_info "Pre-restore backup available at: $PRE_RESTORE_BACKUP"
    exit 1
fi

# Get basic statistics
TABLE_COUNT=$(docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null || echo "unknown")
DB_SIZE=$(docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));" 2>/dev/null | tr -d ' ' || echo "unknown")

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

log_success "Database restore completed successfully in ${DURATION}s"

# Cleanup pre-restore backup
if [ -n "$PRE_RESTORE_BACKUP" ] && [ -f "$PRE_RESTORE_BACKUP" ]; then
    rm -f "$PRE_RESTORE_BACKUP"
    log_info "Cleaned up temporary pre-restore backup"
fi

echo
log_info "=== Restore Summary ==="
echo "  Database: $DB_NAME"
echo "  Container: $CONTAINER_NAME"
echo "  Backup file: $BACKUP_FILE"
echo "  Duration: ${DURATION}s"
echo "  Tables restored: ${TABLE_COUNT:-unknown}"
echo "  Database size: ${DB_SIZE:-unknown}"
echo
log_success "✅ Database restore completed successfully!"
echo
log_warn "Next steps:"
echo "  - Verify application functionality"
echo "  - Check application logs for errors"
echo "  - Update any cached data if necessary"
echo "  - Notify users if applicable"
