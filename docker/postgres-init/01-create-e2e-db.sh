#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
SELECT 'CREATE DATABASE bazi_master_e2e'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = 'bazi_master_e2e'
)\gexec
EOSQL
