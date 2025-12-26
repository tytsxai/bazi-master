# Production Readiness Notes (BaZi Master)

## Required Environment
- NODE_ENV=production
- DATABASE_URL: PostgreSQL URL (schema uses provider = "postgresql").
- FRONTEND_URL: Public web origin (non-localhost).
- BACKEND_BASE_URL: Public API base URL (non-localhost).
- ADMIN_EMAILS: Comma-separated admin emails (leave empty to disable admin access).
- SESSION_TOKEN_SECRET: Secret used to sign session tokens (>=32 chars).
- ALLOW_LOCALHOST_PROD=true (optional) to allow localhost URLs for production-mode smoke tests only.

## Recommended Environment
- REDIS_URL: Required if running more than one backend instance (shared sessions/cache).
- CORS_ALLOWED_ORIGINS: Additional allowed origins (comma-separated).
- TRUST_PROXY: Proxy hop count (usually 1) when behind a load balancer.

## Optional Environment
- OPENAI_API_KEY / ANTHROPIC_API_KEY and provider model settings.
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI for Google OAuth.
- WECHAT_APP_ID / WECHAT_APP_SECRET / WECHAT_REDIRECT_URI for WeChat OAuth.

## Migrations & Schema
- Prisma schema is PostgreSQL (see `prisma/schema.prisma`).
- Production start command runs `prisma migrate deploy`.
- Avoid `prisma db push` in production.

## Known Constraints
- Rate limiting is in-memory; for multi-instance deployments, rely on an external gateway/WAF or add a shared limiter.

## Health Checks
- Liveness: GET /health (app) or /api/health (API router).
- Readiness: GET /ready (checks database + Redis).

## Backups & Recovery (Guidance)
- PostgreSQL: schedule `pg_dump` backups and verify restores regularly.
- Use `scripts/backup-db.sh` and `scripts/restore-db.sh` for docker compose setups.
- Validate restore procedures before go-live.

## Rollback
- Keep the previous container/image release available.
- Take a DB backup before deployment.
- Prefer forward-only migrations to minimize rollback risk.

## Observability (Minimum)
- Ship stdout JSON logs to your log system (e.g., Loki/ELK/CloudWatch).
- Alert on 5xx rate spikes and /ready returning 503.
