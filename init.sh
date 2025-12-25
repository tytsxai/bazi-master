#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

printf "\nBaZi Master Init & Status Check\n"

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Please install Node.js 18+."
  exit 1
fi

# Check psql/redis (optional warning, not failure)
if ! command -v psql >/dev/null 2>&1; then echo "Optional: PostgreSQL client (psql) not found."; fi
if ! command -v redis-cli >/dev/null 2>&1; then echo "Optional: Redis client (redis-cli) not found."; fi

# Install/Update Dependencies
if [ -d "$ROOT_DIR/backend" ]; then
  echo "Checking backend dependencies..."
  (cd "$ROOT_DIR/backend" && npm install)
  
  # Ensure Prisma DB is ready
  echo "Ensuring Database is synced..."
  (cd "$ROOT_DIR/backend" && npx prisma db push --schema=../prisma/schema.prisma)
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
