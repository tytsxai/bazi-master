# Production & Deployment Guide

## Overview
This project is containerized using Docker, allowing for a consistent production environment with separated Backend, Frontend, Postgres, and Redis services.

## Prerequisites
- Docker & Docker Compose (v2+)
- A valid `.env.production` or environment variables set in your CI/CD system (see `.env.production.example` and `docs/production-ready.md`).

## Quick Start (Production)
To run the full stack in production mode locally:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```
Before running, set required environment variables (see `.env.production.example`). You can also rename `.env.production` to `.env` to use docker compose's default env loading. For local production-mode smoke tests, you may set:
```
ALLOW_LOCALHOST_PROD=true
FRONTEND_URL=http://localhost:3000
BACKEND_BASE_URL=http://localhost:4000
```
This will spin up:
- **Frontend** (Nginx) on port `3000` (Access http://localhost:3000)
- **Backend** (Node.js) on port `4000` (Internal, but exposed for debugging if needed)
- **Postgres** (Database)
- **Redis** (Cache/Rate Limiting)

## Configuration
The `docker-compose.prod.yml` expects production values to be supplied via environment variables. For a real server, ensure you set at least the following (e.g., in a `.env.production` file loaded by compose, or exported in shell):

| Variable | Description | Default (Dev) |
|----------|-------------|---------------|
| `POSTGRES_USER` | DB User | `postgres` |
| `POSTGRES_PASSWORD` | DB Password | `postgres` |
| `POSTGRES_DB` | DB Name | `bazi_master` |
| `DATABASE_URL` | PostgreSQL connection URL | *(required in prod)* |
| `REDIS_URL` | Redis URL for shared sessions/cache | `redis://redis:6379` |
| `FRONTEND_URL` | Public web origin | *(required in prod)* |
| `BACKEND_BASE_URL` | Public API base URL | *(required in prod)* |
| `ADMIN_EMAILS` | Admin email list | *(required for admin access)* |
| `SESSION_TOKEN_SECRET` | Secret to sign session tokens | *(required in prod)* |
| `ALLOW_LOCALHOST_PROD` | Allow localhost URLs in production-mode smoke tests | `false` |
| `CORS_ALLOWED_ORIGINS` | Extra allowed origins | *(optional)* |
| `TRUST_PROXY` | Proxy hop count | `1` in production |

## Health Checks & Observability
- **Health Check**: `GET /health` on the backend returns liveness status `200` (also `GET /api/health` for API router).
- **Readiness Check**: `GET /ready` checks DB/Redis connectivity and returns `200` or `503`.
- **Logging**: Production logs are output in JSON format for easy ingestion by tools like Datadog, ELK, or CloudWatch.
- **Metrics**: The `/health` endpoint provides basic uptime only.

## Database Migrations
The backend container is configured to automatically run `prisma migrate deploy` on startup. This ensures the database schema is always in sync with the application code.

## Architecture Notes
- **Frontend**: Served via Nginx. API requests to `/api/*` and WebSocket `/ws/*` are proxied to the backend container.
- **Backend**: Runs as a lightweight Node.js container.
- **Scaling**: The backend is stateless (using Redis for sessions) and can be scaled horizontally if needed (though `docker-compose.prod.yml` defines one replica).

## Data Backup & Restore
Scripts are provided in the `scripts/` directory for managing database backups.

### Backup
Run this on the host machine (via cron or manually):
```bash
./scripts/backup-db.sh
```
Backups are saved to `./backups/` as gzipped SQL files.

### Restore
**WARNING**: This overwrites the current database.
```bash
./scripts/restore-db.sh ./backups/bazi_master_YYYYMMDD_HHMMSS.sql.gz
```

## CI/CD Pipeline
A GitHub Actions workflow exists at `.github/workflows/ci.yml` which installs dependencies, runs lint (if present), and executes backend/frontend tests. Ensure CI passes before deploying.
