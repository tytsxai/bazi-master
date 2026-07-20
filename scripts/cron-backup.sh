#!/usr/bin/env bash
#
# Cron entry point for scripts/backup-db.sh.
#
# Do not put backup-db.sh in a crontab directly. Cron runs with a nearly empty PATH, no
# TTY, and whatever working directory it feels like, and it swallows failures into local
# mail that nobody reads. This wrapper deals with all four:
#
#   - resolves an absolute repo path, so BACKUP_DIR is never relative to cron's cwd
#   - puts the usual docker install locations on PATH
#   - takes a lock so a slow backup cannot overlap the next run
#   - appends to a log file and, on failure, shouts somewhere a human will see
#
# Install it with scripts/install-cron.sh.
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Cron's default PATH is typically /usr/bin:/bin, which does not include the common
# Docker Desktop / Homebrew / custom install locations.
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:${PATH:-}"

# Load deployment config if present, so BACKUP_DIR / RETENTION_DAYS / DB_NAME and the
# alert webhook come from the same file the stack uses.
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.production}"
if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
fi

BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups}"
BACKUP_LOG="${BACKUP_LOG:-$REPO_DIR/backups/backup.log}"
LOCK_FILE="${BACKUP_LOCK_FILE:-/tmp/bazi-backup.lock}"
# Optional: POST here when a backup fails. A backup job that fails silently for weeks is
# indistinguishable from one that was never installed — until you need to restore.
ALERT_WEBHOOK="${BACKUP_ALERT_WEBHOOK:-}"

export BACKUP_DIR

mkdir -p "$BACKUP_DIR" "$(dirname "$BACKUP_LOG")"

log() {
    echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] $*" >>"$BACKUP_LOG"
}

alert() {
    local message="$1"
    log "ALERT: $message"
    # Always leave a trace on stderr too: if cron mail *is* configured, this is what
    # gets delivered.
    echo "bazi backup failed: $message" >&2
    if [ -n "$ALERT_WEBHOOK" ]; then
        curl -fsS -m 10 -X POST "$ALERT_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "$(printf '{"text":"bazi backup failed on %s: %s"}' "$(hostname)" "$message")" \
            >/dev/null 2>&1 || log "ALERT: webhook delivery failed"
    fi
}

run_backup() {
    log "starting backup (BACKUP_DIR=$BACKUP_DIR)"
    if "$REPO_DIR/scripts/backup-db.sh" >>"$BACKUP_LOG" 2>&1; then
        log "backup completed"
        return 0
    fi
    alert "backup-db.sh exited non-zero; see $BACKUP_LOG"
    return 1
}

# flock is the reliable option but is Linux-only; fall back to an mkdir lock elsewhere
# (macOS, where this is mostly run by hand anyway).
if command -v flock >/dev/null 2>&1; then
    exec 9>"$LOCK_FILE"
    if ! flock -n 9; then
        log "another backup is still running; skipping this run"
        exit 0
    fi
    run_backup
    exit $?
fi

LOCK_DIR="$LOCK_FILE.d"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    log "another backup is still running; skipping this run"
    exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
run_backup
