#!/usr/bin/env bash
#
# Installs (or removes) the scheduled database backup in the current user's crontab.
#
# Idempotent: entries are fenced by marker comments, so re-running replaces the block
# rather than appending a second copy. Existing unrelated crontab entries are preserved.
#
#   ./scripts/install-cron.sh                 # install with defaults (daily 02:30)
#   ./scripts/install-cron.sh --schedule '0 */6 * * *'
#   ./scripts/install-cron.sh --dry-run       # print what would be installed
#   ./scripts/install-cron.sh --uninstall
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKER_BEGIN="# >>> bazi-master backup (managed by scripts/install-cron.sh) >>>"
MARKER_END="# <<< bazi-master backup <<<"

SCHEDULE="${BACKUP_CRON_SCHEDULE:-30 2 * * *}"
DRY_RUN=0
UNINSTALL=0

usage() {
    sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
    exit "${1:-0}"
}

while [ $# -gt 0 ]; do
    case "$1" in
        --schedule)
            [ $# -ge 2 ] || { echo "--schedule needs a cron expression" >&2; exit 2; }
            SCHEDULE="$2"; shift 2 ;;
        --dry-run) DRY_RUN=1; shift ;;
        --uninstall) UNINSTALL=1; shift ;;
        -h|--help) usage 0 ;;
        *) echo "Unknown argument: $1" >&2; usage 2 ;;
    esac
done

if ! command -v crontab >/dev/null 2>&1; then
    echo "crontab not found. On a systemd host prefer a timer unit; see docs/production-runbook.md" >&2
    exit 3
fi

# A malformed schedule silently breaks the whole crontab, so check the field count.
if [ "$UNINSTALL" -eq 0 ]; then
    field_count=$(printf '%s\n' "$SCHEDULE" | awk '{print NF}')
    if [ "$field_count" -ne 5 ]; then
        echo "Schedule must have 5 fields, got $field_count: '$SCHEDULE'" >&2
        exit 2
    fi
fi

current="$(crontab -l 2>/dev/null || true)"

# Strip any previously managed block. Everything else the user has is left untouched.
without_block="$(printf '%s\n' "$current" | awk -v b="$MARKER_BEGIN" -v e="$MARKER_END" '
    $0 == b { skip = 1; next }
    $0 == e { skip = 0; next }
    !skip
')"

if [ "$UNINSTALL" -eq 1 ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
        echo "Would install crontab:"
        printf '%s\n' "$without_block"
        exit 0
    fi
    printf '%s\n' "$without_block" | crontab -
    echo "Removed the bazi-master backup entry from crontab."
    exit 0
fi

block="$MARKER_BEGIN
# Runs scripts/cron-backup.sh, which handles PATH, locking, logging and failure alerts.
# Set BACKUP_DIR / RETENTION_DAYS / BACKUP_ALERT_WEBHOOK in .env.production.
$SCHEDULE $REPO_DIR/scripts/cron-backup.sh
$MARKER_END"

new_crontab="$(printf '%s\n%s\n' "$without_block" "$block" | awk 'NF || NR > 1')"

if [ "$DRY_RUN" -eq 1 ]; then
    echo "Would install crontab:"
    printf '%s\n' "$new_crontab"
    exit 0
fi

printf '%s\n' "$new_crontab" | crontab -

echo "Installed backup cron entry:"
echo "  schedule: $SCHEDULE"
echo "  command:  $REPO_DIR/scripts/cron-backup.sh"
echo
echo "Verify with: crontab -l"
echo "Test it now: $REPO_DIR/scripts/cron-backup.sh && tail -20 \${BACKUP_DIR:-$REPO_DIR/backups}/backup.log"
echo
echo "Note: backups land on this host by default, next to the database they protect."
echo "Point BACKUP_DIR at a separate volume and add offsite copies before relying on them."
