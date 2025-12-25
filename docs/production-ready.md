# Production Readiness Notes (BaZi Master)

## Required Environment
- NODE_ENV=production
- DATABASE_URL: PostgreSQL connection string (recommended). If you must use SQLite, set ALLOW_SQLITE_PROD=true.
- FRONTEND_URL: Public web origin (non-localhost).
- BACKEND_BASE_URL: Public API base URL (non-localhost).
- ADMIN_EMAILS: Comma-separated admin emails (leave empty to disable admin access).

## Optional Environment
- REDIS_URL: Enable shared session/cache storage across instances.
- OPENAI_API_KEY / ANTHROPIC_API_KEY and provider model settings.
- CORS_ALLOWED_ORIGINS: Additional allowed origins (comma-separated).
- SEED_DEFAULT_USER: Set to true in non-production to seed test@example.com.
- PASSWORD_RESET_DEBUG_LOG: Set to true in non-production to print reset tokens to logs.

## Migrations & Schema
- Use Prisma migrations for production (`prisma migrate deploy`).
- Avoid `prisma db push` in production.
- Current Prisma schema is SQLite by default; confirm PostgreSQL target and generate migrations before go-live.

## Health Checks
- Liveness: GET /health
- Readiness: GET /ready (checks database + Redis)

## Backups & Recovery (Guidance)
- PostgreSQL: schedule `pg_dump` backups and verify restores regularly.
- SQLite: snapshot the DB file with filesystem-level backups when the process is stopped.

## Rollback
- Keep the previous container/image release available.
- Use forward-only migrations or provide down migrations for critical changes.

## Observability (Minimum)
- Ship stdout logs to your log system (e.g., Loki/ELK/CloudWatch).
- Add alerting on 5xx rates and /ready failures.
