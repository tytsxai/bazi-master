#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

printf "\nBaZi Master init\n"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Please install Node.js 18+ before continuing."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Please install npm before continuing."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "PostgreSQL client not found (psql). Please install PostgreSQL."
fi

if ! command -v redis-cli >/dev/null 2>&1; then
  echo "Redis client not found (redis-cli). Please install Redis."
fi

if [ -d "$ROOT_DIR/frontend" ]; then
  echo "Installing frontend dependencies..."
  (cd "$ROOT_DIR/frontend" && npm install)
fi

if [ -d "$ROOT_DIR/backend" ]; then
  echo "Installing backend dependencies..."
  (cd "$ROOT_DIR/backend" && npm install)
fi

echo "\nStarting services (if configured)..."

if [ -d "$ROOT_DIR/backend" ]; then
  echo "Backend: npm run dev (expected to run on http://localhost:4000)"
fi

if [ -d "$ROOT_DIR/frontend" ]; then
  echo "Frontend: npm run dev (expected to run on http://localhost:3000)"
fi

echo "\nNext steps:"
if [ -d "$ROOT_DIR/backend" ]; then
  echo "1) In one terminal: cd backend && npm run dev"
fi
if [ -d "$ROOT_DIR/frontend" ]; then
  echo "2) In another terminal: cd frontend && npm run dev"
fi

echo "\nAccess the app at: http://localhost:3000"
