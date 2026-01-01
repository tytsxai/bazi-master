#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

printf "\nBaZi Master Init & Status Check\n"

# Safety guard: this script is for local/dev only.
if [ "${NODE_ENV:-}" = "production" ]; then
  echo "ERROR: init.sh is for development only. Use migrations (prisma migrate deploy) in production."
  exit 1
fi

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Please install Node.js 20+."
  exit 1
fi

# Check psql/redis (optional warning, not failure)
if ! command -v psql >/dev/null 2>&1; then echo "Optional: PostgreSQL client (psql) not found."; fi
if ! command -v redis-cli >/dev/null 2>&1; then echo "Optional: Redis client (redis-cli) not found."; fi

# Install/Update Dependencies
if [ -d "$ROOT_DIR/backend" ]; then
  echo "Checking backend dependencies..."
  (cd "$ROOT_DIR/backend" && npm install)
  
  echo "Ensuring Postgres/Redis are running (docker-compose)..."
  if command -v docker >/dev/null 2>&1; then
    (cd "$ROOT_DIR" && docker compose up -d postgres redis)
  else
    echo "ERROR: docker is required for local setup (PostgreSQL/Redis)."
    exit 1
  fi

  # Ensure Prisma migrations are applied
  echo "Applying Prisma migrations..."
  if [ -z "${DATABASE_URL:-}" ]; then
    export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bazi_master?schema=public"
  fi
  (cd "$ROOT_DIR/backend" && node scripts/prisma.mjs migrate deploy --schema=../prisma/schema.prisma)
fi

if [ -d "$ROOT_DIR/frontend" ]; then
  echo "Checking frontend dependencies..."
  (cd "$ROOT_DIR/frontend" && npm install)
fi

echo "\n-----------------------------------------------------------"
echo "Setup Complete."
echo "-----------------------------------------------------------"
echo "To clean start services:"
echo "1. Backend: cd backend && npm run dev (Runs on :4000)"
echo "2. Frontend: cd frontend && npm run dev (Runs on :3000, proxies to :4000)"
echo "-----------------------------------------------------------"
