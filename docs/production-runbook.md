# Production Runbook

This document provides operational procedures for maintaining the **BaZi Master** backend in production.

## 1. Health Checks

The application provides a deep health check endpoint that probes dependencies (Database, Redis).

-   **Endpoint**: `/health`
-   **Method**: `GET`
-   **Success Response**: `200 OK`
    ```json
    {
      "status": "ok",
      "checks": {
        "db": { "ok": true },
        "redis": { "ok": true }
      },
      "timestamp": "...",
      "uptime": 123.45
    }
    ```
-   **Failure Response**: `503 Service Unavailable`

### Verification Command
```bash
curl -i http://localhost:4000/health
curl -i http://localhost:4000/api/ready
```

## 2. Structured Logging

Logs are output in JSON format using Pino. This format allows for easy parsing by log aggregators (e.g., Datadog, ELK, CloudWatch).

### Log Levels
-   **INFO**: Standard operational events (startup, shutdown, successful connections).
-   **WARN**: Non-critical issues (e.g., configuration warnings, degraded health).
-   **ERROR**: Runtime exceptions, failed requests (5xx).
-   **FATAL**: Critical failures requiring immediate exit (e.g., DB connection failure at startup).

### Reading Logs Locally
To formatted logs for human readability during development or debugging:
```bash
npm run dev | npx pino-pretty
```

## 3. Database Operations

### Backup
Uses `pg_dump` to create a backup of the PostgreSQL database.
```bash
docker exec bazi-master-postgres-1 pg_dump -U postgres bazi_master > backup_$(date +%F).sql
```

### Restore
**WARNING**: This will overwrite existing data.
```bash
cat backup.sql | docker exec -i bazi-master-postgres-1 psql -U postgres -d bazi_master
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
    -   Ideally, write non-destructive migrations.
    -   If necessary, use Prisma Migrate to roll back:
        ```bash
        npx prisma migrate resolve --rolled-back <migration_name>
        ```
    -   *Note*: Down-migrations are not natively supported by Prisma in a simple way; restoring from backup is often safer for major data incidents.

## 5. Troubleshooting Common Issues

-   **Redis Connection Failed**: Check if `REDIS_URL` is correct and the Redis container is running.
-   **Database Timeout**: Ensure the database is accessible from the backend container. Check security groups/firewalls.
-   **CORS Errors**: Verify `CORS_ALLOWED_ORIGINS` includes the frontend URL.
