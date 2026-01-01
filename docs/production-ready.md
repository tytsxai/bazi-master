# Production Readiness Checklist

> 版本: v0.1.3-dev | 更新: 2025-12-30
>
> 详细部署步骤参见 `../PRODUCTION.md`

## 基础设施

- [ ] PostgreSQL 13+（启用连接池与慢查询日志）
- [ ] Redis 6+（会话/缓存/OAuth state/密码重置；多实例必须配置）
- [ ] 反向代理/HTTPS（Nginx/Traefik 等）
- [ ] 证书自动续期（Let’s Encrypt 或等效方案）
- [ ] 备份存储（数据库定期备份并演练恢复）

## 环境变量（生产建议值）

- `NODE_ENV=production`
- `PORT=4000`
- `DATABASE_URL=postgresql://user:pass@host:5432/dbname`
- `SESSION_TOKEN_SECRET=<32+ chars>`
- `FRONTEND_URL=https://your-domain.com`
- `BACKEND_BASE_URL=https://api.your-domain.com`
- `REDIS_URL=redis://redis:6379`
- `RATE_LIMIT_WINDOW_MS=60000`
- `RATE_LIMIT_MAX=120`
- AI（可选）：`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`
- OAuth（可选）：`GOOGLE_CLIENT_ID/SECRET`，`WECHAT_APP_ID/SECRET`
- 邮件（必需）：`SMTP_HOST`、`SMTP_FROM`、`SMTP_USER`、`SMTP_PASS`
- 密码重置：`PASSWORD_RESET_ENABLED=true`
- Cookie：`SESSION_COOKIE_SAMESITE` / `SESSION_COOKIE_DOMAIN` / `SESSION_COOKIE_SECURE`
- 代理：`TRUST_PROXY=1`
- 文档：`DOCS_USER` / `DOCS_PASSWORD`（生产访问 `/api-docs`）

## 应用健康

- [ ] `/live` 返回 200（仅进程存活）
- [ ] `/health` 返回 200
- [ ] `/api/ready` 返回 200（DB/Redis 正常）
- [ ] 日志输出为 JSON，集中收集

## 安全

- [ ] HTTPS 全站强制
- [ ] CORS 限定为 `FRONTEND_URL`
- [ ] 管理员邮箱通过 `ADMIN_EMAILS` 显式配置
- [ ] 会话密钥定期轮换（建议 90 天）
- [ ] 速率限制启用
- [ ] 关闭 `ALLOW_DEV_OAUTH`（生产环境禁用开发直登）

## 监控与告警

- [ ] API 延迟/错误率（p95, p99, 5xx）
- [ ] DB 连接池、慢查询
- [ ] Redis 内存/命中率/连接数
- [ ] 容器存活与重启次数

## 备份与恢复

- [ ] 每日自动备份 PostgreSQL，保留 ≥30 天
- [ ] 定期演练备份恢复
- [ ] 配置文件与环境变量另行备份

## 性能与容量

- [ ] 压测基础路径（Auth、Bazi、Tarot AI）
- [ ] 评估 Redis/DB 资源水位并设置报警
- [ ] 前端 bundle 体积与首屏时间基线

## 变更与回滚

- [ ] 迁移脚本可重复执行（Prisma migrate deploy）
- [ ] 多实例部署已关闭启动时迁移（`RUN_MIGRATIONS_ON_START=false`）
- [ ] 旧版本镜像可用以快速回滚
- [ ] 部署后验证脚本（健康检查 + 核心用例）
