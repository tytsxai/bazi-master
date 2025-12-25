# Production & Deployment Guide

## Overview
This project is containerized using Docker, allowing for a consistent production environment with separated Backend, Frontend, Postgres, and Redis services.

## Prerequisites
- Docker & Docker Compose (v2+)
- A valid `.env.production` or environment variables set in your CI/CD system.

## Quick Start (Production)
To run the full stack in production mode locally:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```
This will spin up:
- **Frontend** (Nginx) on port `3000` (Access http://localhost:3000)
- **Backend** (Node.js) on port `4000` (Internal, but exposed for debugging if needed)
- **Postgres** (Database)
- **Redis** (Cache/Rate Limiting)

## Configuration
The `docker-compose.prod.yml` uses default values. For a real server, ensure you set the following environment variables (e.g., in a `.env` file loaded by compose, or exported in shell):

| Variable | Description | Default (Dev) |
|----------|-------------|---------------|
| `POSTGRES_USER` | DB User | `postgres` |
| `POSTGRES_PASSWORD` | DB Password | `postgres` |
| `POSTGRES_DB` | DB Name | `bazi_master` |
| `ADMIN_EMAILS` | Admin Email List | `admin@example.com` |

## Health Checks & Observability
- **Health Check**: `GET /health` on the backend returns status `200` and DB connectivity state.
- **Logging**: Production logs are output in JSON format for easy ingestion by tools like Datadog, ELK, or CloudWatch.
- **Metrics**: The `/health` endpoint also provides basic uptime.

## Database Migrations
The backend container is configured to automatically run `prisma migrate deploy` on startup. This ensures the database schema is always in sync with the application code.

## Architecture Notes
- **Frontend**: Served via Nginx. API requests to `/api/*` are proxied to the backend container.
- **Backend**: Runs as a lightweight Node.js container.
- **Scaling**: The backend is stateless (using Redis for sessions) and can be scaled horizontally if needed (though `docker-compose.prod.yml` defines one replica).
