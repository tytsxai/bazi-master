# Production Runbook

> 版本: v0.1.3-dev | 更新: 2025-12-30

This document provides operational procedures for maintaining the **BaZi Master** backend in production.

## 1. Health Checks

The application provides deep health checks that probe dependencies (Database, Redis). Redis backs sessions, Bazi cache, OAuth state, and password reset tokens in multi-instance setups.

- **Endpoints**: `/live`, `/health`, `/api/health`, `/api/ready`
- **Method**: `GET`
- **Success Response**: `200 OK`
  ```json
  {
    "service": "bazi-master-backend",
    "status": "ok",
    "checks": {
      "db": { "ok": true },
      "redis": { "ok": true }
    },
    "timestamp": "...",
    "uptime": 123.45
  }
  ```
- **Failure Response**: `503 Service Unavailable`

### Verification Command

```bash
curl -i http://localhost:4000/live
curl -i http://localhost:4000/health
curl -i http://localhost:4000/api/health
curl -i http://localhost:4000/api/ready
```

## 2. Structured Logging

Logs are output in JSON format using Pino. This format allows for easy parsing by log aggregators (e.g., Datadog, ELK, CloudWatch).

### Log Levels

- **INFO**: Standard operational events (startup, shutdown, successful connections).
- **WARN**: Non-critical issues (e.g., configuration warnings, degraded health).
- **ERROR**: Runtime exceptions, failed requests (5xx).
- **FATAL**: Critical failures requiring immediate exit (e.g., DB connection failure at startup).

### Reading Logs Locally

To formatted logs for human readability during development or debugging:

```bash
npm -C backend run dev | npx pino-pretty
```

## 3. Database Operations

### Backup

推荐使用项目内置脚本（默认容器名 `bazi_postgres`）。

```bash
BACKUP_DIR=./backups ./scripts/backup-db.sh
```

### Scheduled Backups (cron example)

```bash
# Every day at 02:30, keep 30 days of backups
30 2 * * * BACKUP_DIR=/var/backups/bazi RETENTION_DAYS=30 /path/to/repo/scripts/backup-db.sh >> /var/log/bazi-backup.log 2>&1
```

### Restore

**WARNING**: This will overwrite existing data.

```bash
./scripts/restore-db.sh ./backups/<file>.sql.gz
```

如需手动执行：

```bash
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres bazi_master > backup_$(date +%F).sql
cat backup.sql | docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d bazi_master
```

## 4. Rollback Procedure

If a deployment fails, follow these steps to roll back:

1.  **Identify the stable version**: Check your container registry or git tags for the previous stable release.
2.  **Revert Code**:
    ```bash
    git revert HEAD
    git push origin main
    ```
3.  **Redeploy**: Trigger the CI/CD pipeline to deploy the reverted version.
4.  **Database Rollback** (if migrations were applied):
    - Ideally, write non-destructive migrations.
    - If necessary, use Prisma Migrate to roll back:
      ```bash
      npx prisma migrate resolve --rolled-back <migration_name>
      ```
    - _Note_: Down-migrations are not natively supported by Prisma in a simple way; restoring from backup is often safer for major data incidents.

## 4.1 Migration Strategy (Multi-Instance)

For multi-instance deployments, run migrations once in the deployment pipeline and set:

```
RUN_MIGRATIONS_ON_START=false
```

This avoids concurrent migration attempts during rolling restarts.

## 5. Troubleshooting Common Issues

- **Redis Connection Failed**: Check if `REDIS_URL` is correct and the Redis container is running.
- **Database Timeout**: Ensure the database is accessible from the backend container. Check security groups/firewalls.
- **CORS Errors**: Verify `CORS_ALLOWED_ORIGINS` includes the frontend URL.
- **Password reset email failed**: Verify SMTP env vars (`SMTP_HOST`, `SMTP_FROM`, auth). Check provider logs for rejected connections.
