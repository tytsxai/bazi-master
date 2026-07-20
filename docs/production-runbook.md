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

### 容器自愈 (autoheal)

`docker-compose.prod.yml` 里带一个 `autoheal` 服务：healthcheck 判定 unhealthy 后
自动重启带 `autoheal=true` 标签的容器。

之所以需要它：`restart: always` 只在**进程退出**时生效。进程还活着但一直 503
（事件循环卡死、连接池耗尽）时，compose 自己不会做任何事——那是 Swarm/K8s 的行为。
没有这个服务，backend 会一直挂在 unhealthy 状态没人管。

已打标签：`backend`、`frontend`。
**故意没打**：`postgres`、`redis` —— 有状态服务，healthcheck 失败就自动重启数据库
往往会把一个问题变成两个。这两个转红需要人去看。

```bash
docker compose -f docker-compose.prod.yml logs autoheal   # 看它重启过什么
docker inspect --format '{{.State.Health.Status}}' bazi_backend
```

> **取舍要说清楚**：autoheal 需要挂载 Docker socket，等价于宿主机 root 权限。
> 挂成 `:ro` 并不能真正限制通过 socket 能做什么（只是文件节点只读），所以要把这个
> 容器当特权容器看待，镜像 tag 已经固定。如果不能接受，删掉这个 service，改用
> 宿主 cron 轮询 `/api/ready` 兜底。

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

脚本输出为 `custom pg_dump` 后再 gzip 压缩的文件，并生成 `<backup>.sha256`。脚本会立即通过容器内 `pg_restore --list` 验证备份可读，避免本机缺少 `pg_restore` 时误判。

### Scheduled Backups

用安装脚本，别手写 crontab 行：

```bash
./scripts/install-cron.sh                      # 默认每天 02:30
./scripts/install-cron.sh --schedule '0 */6 * * *'   # 改成每 6 小时
./scripts/install-cron.sh --dry-run            # 只打印，不写入
./scripts/install-cron.sh --uninstall          # 移除
```

安装的是 `scripts/cron-backup.sh` 而不是 `backup-db.sh` 直接入 cron，因为直接挂
cron 有四个坑，包装脚本逐个处理了：

| 坑                                                           | 处理方式                                        |
| ------------------------------------------------------------ | ----------------------------------------------- |
| cron 的 PATH 几乎是空的，找不到 `docker`                     | 显式补上常见安装路径                            |
| cron 的工作目录不确定，`BACKUP_DIR=./backups` 会落到随机位置 | 解析仓库绝对路径                                |
| 备份跑超时会和下一次重叠                                     | flock（Linux）/ mkdir（其他）互斥锁，重叠时跳过 |
| 失败只进本地 mail，没人看                                    | 写日志 + `BACKUP_ALERT_WEBHOOK` 推送            |

`install-cron.sh` 是幂等的：条目用注释标记包起来，重复执行是替换而不是追加，
crontab 里其他任务不会被动到。改 schedule 直接重跑即可。

相关配置在 `.env.production`：`BACKUP_DIR`、`RETENTION_DAYS`、`BACKUP_ALERT_WEBHOOK`。

装完**一定要手动验证一次**，不要等到出事才发现 cron 环境跑不起来：

```bash
./scripts/cron-backup.sh
tail -20 "${BACKUP_DIR:-./backups}/backup.log"
crontab -l | grep bazi
```

> 备份默认落在本机，和它要保护的数据库同一块盘。这能防误删，防不了硬件故障。
> `BACKUP_DIR` 指向独立卷只是第一步，异地副本仍需自行接入。

### Restore

**WARNING**: This will overwrite existing data.

```bash
./scripts/restore-db.sh ./backups/<file>.sql.gz --dry-run
./scripts/restore-db.sh ./backups/<file>.sql.gz
```

如需手动执行：

```bash
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres bazi_master | gzip > backup_$(date +%F).sql.gz
zcat backup.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d bazi_master
```

> `restore-db.sh` 会校验 gzip 和 `.sha256`。生产恢复会覆盖数据库，执行前必须先确认目标环境、备份时间点和回滚方案。

### Pre-deploy backup（必做）

`RUN_MIGRATIONS_ON_START` 默认 `true`，也就是说每次容器启动都会 `migrate deploy`。
一旦新版本的迁移已经 apply，回滚旧镜像时数据库 schema 已经变了，而 Prisma 没有
down migration —— 这时唯一的退路就是备份。

定时备份是每天 02:30 跑一次，中午部署出问题最坏会丢 10 小时数据。所以**部署前必须
先备份，备份失败就中止部署**：

```bash
BACKUP_DIR=/var/backups/bazi ./scripts/backup-db.sh \
  && docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

用 `&&` 而不是分号：`backup-db.sh` 失败时不要继续往下走。

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
    - 迁移遵守「只加不减」：加列必须 nullable 或带 default，删列/改名分两次发布。
      做到这一点，旧镜像回滚时仍然能跑在新 schema 上，这比任何工具都管用。
    - If necessary, use Prisma Migrate to roll back:
      ```bash
      npx prisma migrate resolve --rolled-back <migration_name>
      ```
    - _Note_: Down-migrations are not natively supported by Prisma in a simple way; restoring from backup is often safer for major data incidents.
    - 恢复用部署前那份备份：`./scripts/restore-db.sh /var/backups/bazi/<file>.dump.gz`。
      脚本会先做一份 pre-restore 快照，只有在 `pg_restore` 无错**且**表数量校验通过后
      才删除它；失败时会保留并打印回滚命令。

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
