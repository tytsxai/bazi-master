# 生产部署指南

> 版本: v0.1.3-dev | 更新: 2025-12-30

本指南以 Docker Compose 为例，目标环境：PostgreSQL + Redis + Nginx 反向代理。

## 0. 准备配置

1. 复制 `env.production.template`（完整）或 `.env.production.example`（精简）为 `.env.production`，并按需修改：
   - `DATABASE_URL=postgresql://user:pass@postgres:5432/bazi_master`
   - `SESSION_TOKEN_SECRET=<32+ 随机字符>`
   - `FRONTEND_URL=https://your-domain.com`
   - `BACKEND_BASE_URL=https://api.your-domain.com`
   - `REDIS_URL=redis://redis:6379` (强烈推荐生产开启)
   - AI 密钥可选：`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`
2. 将 `.env.production` 与 `docker-compose.prod.yml` 放在同一目录。

## 1. 构建与启动

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

> 如果未使用 prod 编排文件，可在现有 `docker-compose.yml` 上添加/覆盖相同环境变量。

## 2. 数据库迁移

```bash
# 进入后端容器
docker compose -f docker-compose.prod.yml exec backend sh
# 应用迁移
node scripts/prisma.mjs migrate deploy --schema=../prisma/schema.prisma
```

> 多实例部署建议：仅在部署流水线中执行一次迁移，并将 `RUN_MIGRATIONS_ON_START=false`，避免并发迁移竞争。

## 3. 健康检查

- 存活检查: `GET /live` - 仅进程存活（不依赖数据库/Redis）。
- 健康检查: `GET /health` - 深度健康检查（数据库/Redis）。
- 就绪检查: `GET /api/ready` - 深度检查（返回 `ready/not_ready`）。
- 兼容探测: `GET /api/health` - 同样执行深度检查。

示例：

```bash
curl -f https://api.your-domain.com/live
curl -f https://api.your-domain.com/health
curl -f https://api.your-domain.com/api/ready
```

## 4. Nginx 反向代理示例

```nginx
server {
  listen 80;
  server_name your-domain.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name your-domain.com;

  ssl_certificate /path/to/fullchain.pem;
  ssl_certificate_key /path/to/privkey.pem;

  location / {
    proxy_pass http://frontend:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }

  location /api {
    proxy_pass http://backend:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

## 5. 运行时注意事项

- **Redis 必选**：生产环境必须配置 `REDIS_URL`，用于会话、八字缓存、OAuth state、密码重置等多实例一致性；未配置将阻止启动。
- `AI_PROVIDER` 会根据密钥自动选择；无密钥时回退 `mock`。
- 生产启用速率限制：设置 `RATE_LIMIT_WINDOW_MS` 与 `RATE_LIMIT_MAX`。
- `TRUST_PROXY` 在反向代理后应设为 `1` 或具体 hop 数。
- **密码重置邮件必配**：`SMTP_HOST` + `SMTP_FROM`（以及认证信息）必须配置，否则生产启动会失败。
- **跨站部署**：前后端跨站点时需 `SESSION_COOKIE_SAMESITE=none` 且 `SESSION_COOKIE_SECURE=true`。
- **可选超时**：可设置 `SERVER_KEEP_ALIVE_TIMEOUT_MS` / `SERVER_HEADERS_TIMEOUT_MS` / `SERVER_REQUEST_TIMEOUT_MS` 控制慢连接；`headersTimeout` 应大于 `keepAliveTimeout`。
- **迁移开关**：默认启动时执行 `migrate deploy`，可通过 `RUN_MIGRATIONS_ON_START=false` 关闭（推荐多实例时关闭）。

## 6. 监控与日志

- 日志：Pino JSON 输出到 stdout，可接入 ELK/CloudWatch。
- 建议监控：
  - API p95/错误率
  - DB 连接池使用率、慢查询
  - Redis 命中率与内存占用
  - `/api/ready` 返回状态

## 7. 备份与恢复（PostgreSQL 示例）

```bash
# 备份
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres bazi_master | gzip > backups/bazi_master_$(date +%Y%m%d_%H%M%S).sql.gz

# 恢复（覆盖现有库）
zcat backups/<file>.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres bazi_master
```

## 8. 故障排查速查

- 容器状态：`docker compose -f docker-compose.prod.yml ps`
- 后端日志：`docker compose -f docker-compose.prod.yml logs -f backend`
- 数据库连通：`docker compose -f docker-compose.prod.yml exec postgres pg_isready`
- Redis 连通：`docker compose -f docker-compose.prod.yml exec redis redis-cli ping`

## 9. 安全要点

- **HTTPS 强制启用**：所有生产流量必须通过 HTTPS；配置 Nginx 或负载均衡器处理 SSL 证书
- **CORS 配置**：通过 `FRONTEND_URL` 和 `CORS_ALLOWED_ORIGINS` 限制允许的源域名；生产环境不应包含 localhost
- **管理邮箱配置**：生产环境通过 `ADMIN_EMAILS` 显式配置管理员邮箱；默认值仅适用于开发环境
- **API 文档保护**：生产环境建议设置 `DOCS_PASSWORD`（可选 `DOCS_USER`）保护 `/api-docs`
- **反向代理设置**：配置 `TRUST_PROXY` 为 `1` 或具体跳数，确保正确解析客户端 IP
- **会话安全**：使用强随机 `SESSION_TOKEN_SECRET`（32+字符）；生产环境必须配置 Redis 避免会话丢失
- **API 密钥保护**：定期轮换 AI provider API keys；使用环境变量而非硬编码
- **速率限制**：生产环境启用 `RATE_LIMIT_WINDOW_MS` 和 `RATE_LIMIT_MAX` 防止滥用
- **端口安全**：关闭不必要的端口；仅暴露 HTTPS (443) 和可能的 SSH (22)

## 10. 升级步骤（简版）

1. 拉取新镜像或代码
2. 运行数据库迁移
3. 滚动重启 backend/front
4. 验证 `/api/ready` 与核心业务
