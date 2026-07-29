#!/usr/bin/env bash
#
# Fails when build/test artifacts or oversized binaries get committed.
#
# The repository history had grown to 735MB: ~1600 full-page PNG screenshots written by
# the end-to-end verification suite (3-6MB each) plus a PostgreSQL WAL segment and SQLite
# write-ahead logs from the e2e fixtures. The source tree itself is under 5MB. Cloning
# cost 735MB for 5MB of code. .gitignore covers those paths now, but a `git add -f` or a
# renamed output directory would put us right back there, so this makes it a CI failure
# instead of something nobody notices until the next clone.
set -euo pipefail

cd "$(dirname "$0")/.."

# Anything above this is almost certainly not source. The largest legitimate file today is
# backend/package-lock.json at ~1.5MB.
MAX_BYTES="${MAX_BYTES:-1048576}"

# Paths that must never be tracked, whatever their size: test evidence, Playwright output,
# database state, and dependency/build trees.
FORBIDDEN='(^|/)(verification|test-results|playwright-report|\.lighthouseci|node_modules|dist|build)/|(^|/)\.pgdata|\.(db|db-wal|db-shm|db-journal)$'

fail=0

forbidden_hits="$(git ls-files | grep -E "$FORBIDDEN" || true)"
if [ -n "$forbidden_hits" ]; then
  echo "These tracked paths are generated artifacts and must not be committed:" >&2
  echo "$forbidden_hits" | sed 's/^/  - /' >&2
  echo >&2
  echo "Remove them with 'git rm --cached <path>' and confirm .gitignore covers them." >&2
  fail=1
fi

# `ls-tree -l` reports each blob's real size, so this works on a bare CI checkout without
# stat-ing the working tree. Format: "<mode> blob <sha> <size>\t<path>".
oversized="$(
  git ls-tree -r -l HEAD \
    | awk -F'\t' -v max="$MAX_BYTES" '{ split($1, meta, /[[:space:]]+/); if (meta[4] + 0 > max) printf "%s (%s bytes)\n", $2, meta[4] }'
)"

if [ -n "$oversized" ]; then
  echo "These tracked files exceed ${MAX_BYTES} bytes:" >&2
  echo "$oversized" | sed 's/^/  - /' >&2
  echo >&2
  echo "Large binaries belong outside git. Raise MAX_BYTES only if the file is genuinely source." >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  exit 1
fi

echo "no artifacts tracked; all $(git ls-files | wc -l | tr -d ' ') files are under ${MAX_BYTES} bytes."
