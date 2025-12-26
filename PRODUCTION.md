# 生产环境部署指南

## 快速开始

```bash
# 1. 准备环境变量
cp .env.production.example .env.production
vim .env.production  # 编辑配置

# 2. 构建并启动
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

# 3. 验证部署
curl http://localhost:4000/health
curl http://localhost:4000/api/ready
```

## 服务架构

| 服务 | 端口 | 说明 | 健康检查 |
|------|------|------|----------|
| Frontend | 3000 | Nginx (React SPA) | HTTP 200 on / |
| Backend | 4000 | Node.js API | GET /health |
| PostgreSQL | 5432 | 主数据库 | pg_isready |
| Redis | 6379 | 缓存/会话 | redis-cli ping |

## 必需环境变量

### 核心配置

```bash
# 环境
NODE_ENV=production

# 数据库
DATABASE_URL=postgresql://user:password@postgres:5432/bazi_master

# 应用 URL
FRONTEND_URL=https://your-domain.com
BACKEND_BASE_URL=https://api.your-domain.com

# 安全
SESSION_TOKEN_SECRET=<生成一个 32+ 字符的随机字符串>

# Redis
REDIS_URL=redis://redis:6379

# 管理员
ADMIN_EMAILS=admin@example.com,admin2@example.com
```

### 可选配置

```bash
# AI 提供商
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# OAuth (可选)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
WECHAT_APP_ID=...
WECHAT_APP_SECRET=...

# 日志
LOG_LEVEL=info  # debug, info, warn, error

# 性能
BAZI_CACHE_TTL_MS=3600000  # 1 小时
BAZI_CACHE_MAX_ENTRIES=1000
```

## 生成安全密钥

```bash
# 方法 1: OpenSSL
openssl rand -base64 32

# 方法 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 方法 3: Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

## 健康检查

### 存活检查 (Liveness)

```bash
# 检查应用是否运行
curl http://localhost:4000/health
```

**预期响应:**
```json
{
  "status": "ok",
  "service": "bazi-master-backend",
  "timestamp": "2025-12-26T10:00:00.000Z",
  "uptime": 3600.5
}
```

### 就绪检查 (Readiness)

```bash
# 检查依赖服务是否就绪
curl http://localhost:4000/api/ready
```

**预期响应:**
```json
{
  "status": "ready",
  "checks": {
    "db": { "ok": true },
    "redis": { "ok": true }
  },
  "timestamp": "2025-12-26T10:00:00.000Z"
}
```

## 数据库管理

### 自动迁移

数据库迁移在容器启动时自动运行 (`prisma migrate deploy`)。

### 手动迁移

```bash
# 进入后端容器
docker compose -f docker-compose.prod.yml exec backend sh

# 运行迁移
node scripts/prisma.mjs migrate deploy --schema=../prisma/schema.prisma

# 查看迁移状态
node scripts/prisma.mjs migrate status --schema=../prisma/schema.prisma
```

### 数据库备份

```bash
# 自动备份 (推荐每日运行)
./scripts/backup-db.sh

# 备份文件位置
ls -lh ./backups/

# 示例输出
# bazi_master_20251226_100000.sql.gz
```

### 数据库恢复

```bash
# 从备份恢复
./scripts/restore-db.sh ./backups/bazi_master_20251226_100000.sql.gz

# 注意: 这将覆盖现有数据!
```

## 安全配置

### 1. HTTPS 配置

**生产环境必须使用 HTTPS!**

```nginx
# nginx.conf 示例
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

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

### 2. CORS 配置

CORS 自动限制为 `FRONTEND_URL` 指定的域名。

### 3. 速率限制

- **未认证用户**: 60 请求/分钟
- **认证用户**: 120 请求/分钟
- **AI 请求**: 10 请求/分钟

### 4. 密钥轮换

建议每 90 天轮换一次 `SESSION_TOKEN_SECRET`。

**轮换步骤:**
1. 生成新密钥
2. 更新环境变量
3. 重启服务
4. 用户需要重新登录

## 监控和日志

### 日志格式

生产环境使用 JSON 格式日志,便于日志聚合工具 (ELK, CloudWatch) 处理。

```json
{
  "level": "info",
  "time": 1703577600000,
  "pid": 1,
  "hostname": "backend-1",
  "reqId": "req-123",
  "userId": 42,
  "msg": "Request completed",
  "responseTime": 45
}
```

### 查看日志

```bash
# 实时日志
docker compose -f docker-compose.prod.yml logs -f

# 特定服务日志
docker compose -f docker-compose.prod.yml logs -f backend

# 最近 100 行
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

### 监控指标

建议监控以下指标:

1. **应用健康**
   - `/health` 端点响应时间
   - `/api/ready` 端点状态

2. **错误率**
   - 5xx 错误数量
   - 4xx 错误数量

3. **性能**
   - API 响应时间 (p50, p95, p99)
   - 数据库查询时间

4. **资源使用**
   - CPU 使用率
   - 内存使用率
   - 磁盘空间

### 告警建议

- `/api/ready` 返回 503 → 立即告警
- 5xx 错误率 > 1% → 告警
- API p95 响应时间 > 1s → 警告
- 磁盘使用 > 80% → 警告

## 性能优化

### 1. 数据库优化

```sql
-- 创建索引 (如果尚未创建)
CREATE INDEX idx_bazi_user_id ON "BaziRecord"("userId");
CREATE INDEX idx_bazi_created_at ON "BaziRecord"("createdAt");
CREATE INDEX idx_user_email ON "User"("email");
```

### 2. Redis 缓存

确保 Redis 正常运行以获得最佳性能:

```bash
# 检查 Redis 状态
docker compose -f docker-compose.prod.yml exec redis redis-cli ping
# 应返回: PONG

# 查看缓存统计
docker compose -f docker-compose.prod.yml exec redis redis-cli INFO stats
```

### 3. 连接池配置

PostgreSQL 连接池已在 Prisma 中配置:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // 连接池配置在 DATABASE_URL 中:
  // ?connection_limit=10&pool_timeout=20
}
```

## 故障排查

### 问题: 容器无法启动

```bash
# 查看容器状态
docker compose -f docker-compose.prod.yml ps

# 查看容器日志
docker compose -f docker-compose.prod.yml logs backend

# 常见原因:
# 1. 环境变量配置错误
# 2. 端口冲突
# 3. 数据库连接失败
```

### 问题: 数据库连接失败

```bash
# 检查 PostgreSQL 是否运行
docker compose -f docker-compose.prod.yml ps postgres

# 测试数据库连接
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d bazi_master -c "SELECT 1"

# 检查 DATABASE_URL 格式
echo $DATABASE_URL
# 应该类似: postgresql://user:pass@postgres:5432/bazi_master
```

### 问题: Redis 连接失败

```bash
# 检查 Redis 是否运行
docker compose -f docker-compose.prod.yml ps redis

# 测试 Redis 连接
docker compose -f docker-compose.prod.yml exec redis redis-cli ping

# 注意: Redis 是可选的,应用会回退到内存存储
```

### 问题: 前端无法访问后端

```bash
# 检查 CORS 配置
# 确保 FRONTEND_URL 和 BACKEND_BASE_URL 正确设置

# 检查网络连接
docker compose -f docker-compose.prod.yml exec frontend \
  wget -O- http://backend:4000/health
```

## 扩展和高可用

### 水平扩展

```bash
# 启动多个后端实例
docker compose -f docker-compose.prod.yml up -d --scale backend=3

# 需要配置负载均衡器 (Nginx, HAProxy)
```

### 数据库高可用

考虑使用:
- PostgreSQL 主从复制
- 读写分离
- 连接池管理 (PgBouncer)

### Redis 高可用

考虑使用:
- Redis Sentinel (主从切换)
- Redis Cluster (分片)

## 维护计划

### 日常维护

- ✅ 每日数据库备份
- ✅ 监控日志错误
- ✅ 检查磁盘空间

### 每周维护

- 🔄 审查性能指标
- 🔄 检查安全更新
- 🔄 清理旧日志

### 每月维护

- 📅 依赖包更新
- 📅 安全审计
- 📅 性能优化评估

### 每季度维护

- 🗓 密钥轮换
- 🗓 灾难恢复演练
- 🗓 容量规划评估

## 回滚策略

### 应用回滚

```bash
# 1. 停止当前版本
docker compose -f docker-compose.prod.yml down

# 2. 切换到之前的镜像版本
# 编辑 docker-compose.prod.yml 中的镜像标签

# 3. 启动旧版本
docker compose -f docker-compose.prod.yml up -d
```

### 数据库回滚

```bash
# 1. 停止应用
docker compose -f docker-compose.prod.yml stop backend

# 2. 恢复数据库备份
./scripts/restore-db.sh ./backups/bazi_master_YYYYMMDD.sql.gz

# 3. 重启应用
docker compose -f docker-compose.prod.yml start backend
```

## 最佳实践

1. **始终使用 HTTPS** - 生产环境必须
2. **定期备份** - 自动化每日备份
3. **监控告警** - 设置关键指标告警
4. **日志聚合** - 使用 ELK 或 CloudWatch
5. **密钥管理** - 使用密钥管理服务 (AWS Secrets Manager, HashiCorp Vault)
6. **蓝绿部署** - 零停机更新
7. **灾难恢复** - 定期演练恢复流程
8. **文档更新** - 保持运维文档最新

## 更多资源

- [架构文档](./docs/architecture.md) - 系统架构详解
- [API 文档](./docs/api.md) - API 端点参考
- [开发指南](./docs/development.md) - 开发环境搭建
- [生产就绪清单](./docs/production-ready.md) - 部署前检查清单

## 支持

遇到问题?

- 📖 查看文档: [docs/](./docs/)
- 🐛 报告问题: [GitHub Issues](https://github.com/your-repo/issues)
- 💬 讨论: [GitHub Discussions](https://github.com/your-repo/discussions)
- 🔒 安全问题: security@example.com
