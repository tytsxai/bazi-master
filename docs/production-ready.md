# Production Readiness Checklist

> 详细部署指南请参考 [PRODUCTION.md](../PRODUCTION.md)

## 部署前检查清单

### 基础设施
- [ ] **PostgreSQL 13+**: 配置连接池，设置适当的超时
- [ ] **Redis 6+**: 用于会话存储和缓存，确保持久化配置
- [ ] **反向代理**: Nginx 配置 SSL/TLS 终止和负载均衡
- [ ] **SSL/TLS 证书**: Let's Encrypt 或商业证书，配置自动续期
- [ ] **域名和 DNS 配置**: 指向后端 API 和前端应用的 CNAME/A 记录
- [ ] **CDN**: 可选，用于静态资源分发
- [ ] **备份存储**: S3 或类似服务用于数据库备份

### 必需环境变量
```bash
# 应用配置
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://your-domain.com
BACKEND_BASE_URL=https://api.your-domain.com

# 数据库
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require

# 缓存和会话
REDIS_URL=redis://redis:6379
SESSION_TOKEN_SECRET=<32+字符的安全密钥>
SESSION_IDLE_MS=1800000

# AI 服务 (至少配置一个)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# OAuth 配置 (生产环境必需)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
WECHAT_APP_ID=...
WECHAT_APP_SECRET=...

# 安全配置
ADMIN_EMAILS=admin@your-domain.com
CORS_ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com

# 性能配置
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
JSON_BODY_LIMIT=50mb
MAX_URL_LENGTH=16384

# 监控和日志
LOG_LEVEL=info
SENTRY_DSN=https://...@sentry.io/...
```

### 安全配置
- [ ] CORS 限制为生产域名
- [ ] HTTPS 强制启用
- [ ] 密钥定期轮换 (建议 90 天)

### 监控和可观测性
- [ ] **健康检查**: `/health` 和 `/api/ready` 端点正常响应
- [ ] **应用监控**: PM2 或类似进程管理器监控应用状态
- [ ] **数据库监控**: 连接池使用率，慢查询日志
- [ ] **Redis 监控**: 内存使用率，连接数
- [ ] **日志聚合**: 结构化 JSON 日志，ELK stack 或类似
- [ ] **错误追踪**: Sentry 或类似错误监控服务
- [ ] **性能监控**: 响应时间，吞吐量，错误率
- [ ] **业务指标**: 用户注册数，API 调用次数，付费转化率

### 备份和灾难恢复
- [ ] **数据库备份**: 每日自动备份，保留 30 天
- [ ] **备份验证**: 定期测试备份恢复流程
- [ ] **异地备份**: 备份存储到不同地理位置
- [ ] **应用配置备份**: 环境变量和配置文件备份
- [ ] **恢复时间目标 (RTO)**: 定义并测试恢复时间
- [ ] **恢复点目标 (RPO)**: 定义数据丢失容忍度
- [ ] **灾难恢复计划**: 完整的故障恢复文档
