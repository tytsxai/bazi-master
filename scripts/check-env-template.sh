#!/usr/bin/env bash
#
# Fails when backend code reads an environment variable that env.production.template
# does not document.
#
# The template had drifted well behind the code: variables the app genuinely reads were
# undocumented, so operators had no way to know they existed, and some could not even
# be set because docker-compose.prod.yml did not pass them through. This guard makes
# that failure loud at CI time instead of during an incident.
set -euo pipefail

cd "$(dirname "$0")/.."

TEMPLATE="env.production.template"

# Variables that are intentionally absent from the production template.
IGNORED='^(CI|NODE_ENV|USER|PGUSER|DATABASE_URL|REDIS_URL|PG_TEST_[A-Z_]+|BAZI_(CLI|HELPER|PG|WEB)_[A-Z_]+)$'

code_vars="$(
  grep -rhoE 'env\.[A-Z][A-Z_0-9]+' backend \
    --include='*.js' --include='*.mjs' \
    --exclude-dir=node_modules --exclude-dir=test \
    | sed 's/env\.//' \
    | grep -vE "$IGNORED" \
    | sort -u
)"

template_vars="$(
  grep -oE '^#?[[:space:]]*[A-Z][A-Z_0-9]+=' "$TEMPLATE" \
    | tr -d '# =' \
    | sort -u
)"

missing="$(comm -23 <(echo "$code_vars") <(echo "$template_vars") || true)"

if [ -n "$missing" ]; then
  echo "These environment variables are read by backend code but missing from $TEMPLATE:" >&2
  echo "$missing" | sed 's/^/  - /' >&2
  echo >&2
  echo "Document them in $TEMPLATE (and pass them through in docker-compose.prod.yml" >&2
  echo "if they need to reach the container), or add them to IGNORED in $0." >&2
  exit 1
fi

echo "env template covers all $(echo "$code_vars" | wc -l | tr -d ' ') backend variables."
