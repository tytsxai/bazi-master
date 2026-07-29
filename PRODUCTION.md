# 生产部署指南

> 版本: v0.2.0 | 更新: 2026-07-29

本指南以 Docker Compose 为例，目标环境：引擎 + 可选 Redis + Nginx 反向代理。

**先说清楚这套部署有多轻。** 引擎是无状态纯计算：不存数据、不写文件、没有数据库。
所以这份文档里**没有**数据库迁移、备份、恢复、灾难演练、连接池调优这些章节 ——
它们连同存储层一起从项目里删除了。整个栈可以随时销毁重建，唯一会丢的是 Redis 里的排盘缓存，
而那个重算一遍就有。

## 0. 准备配置

1. 复制 `env.production.template` 为 `.env.production`，至少改掉这几项：
   - `DOCS_PASSWORD=<强随机串>` —— **唯一的硬性必填项**，缺了它进程启动即退出
   - `BACKEND_BASE_URL=https://api.your-domain.com`
   - `CORS_ALLOWED_ORIGINS=https://app.your-domain.com`（浏览器客户端的来源，逗号分隔）
   - `TRUST_PROXY=1`（按实际跳数，见[安全要点](#7-安全要点)）
   - AI 密钥可选：`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`
   - `METRICS_TOKEN` 可选，但不配 `/metrics` 就是 404
2. 将 `.env.production` 与 `docker-compose.prod.yml` 放在同一目录。

> `REDIS_URL` 在这套编排里不要自己写：compose 把它固定指向内置的 redis 服务。
> 只有当引擎跑在 compose 之外、或者要接托管 Redis 时才直接设置它，同时改 compose 的
> `environment` 段。

> 引擎端口默认只绑定在 `127.0.0.1`，由你自己那层 nginx 终止 TLS。
> Docker 的端口发布会绕过 ufw/firewalld 直接写 iptables，所以不要随手改成 `0.0.0.0`；
> 确有需要时通过 `BACKEND_BIND_ADDR` 显式放开。

> `docker compose --env-file` 只用于变量替换，不会自动把所有变量注入容器。
> `docker-compose.prod.yml` 已显式透传引擎读取的每一个变量；新增变量时必须同步加进
> compose 的 `environment` 段。`scripts/check-env-template.sh` 在 CI 里守着模板那一侧。

## 1. 构建与启动

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

没有迁移步骤 —— 启动完就可以直接验证。

## 2. 健康检查

- 存活检查 `GET /live` —— 只看进程，不碰任何依赖
- 健康检查 `GET /health` —— 深度检查（含 Redis）
- 就绪检查 `GET /api/ready` —— 深度检查，返回 `ready` / `not_ready`
- 兼容探测 `GET /api/health` —— 同样是深度检查

> **两类探针不要接错，接错会自己制造事故。**
>
> - **容器/进程重启探针用 `/live`**。它不碰 Redis。`docker-compose.prod.yml` 的 backend
>   healthcheck 驱动 autoheal，如果改成深度检查，Redis 抖动十秒就会把引擎重启掉 ——
>   而 Redis 只是缓存，摘掉它服务照常工作，重启只会把一次无害的抖动放大成一轮冷启动。
> - **负载均衡摘流探针用 `/api/ready`**。它在收到 SIGTERM 后立刻返回 503
>   （`status: "shutting_down"`），此时进程仍在正常服务存量请求。LB 应该据此摘流，而不是重启。

```bash
curl -f https://api.your-domain.com/live
curl -f https://api.your-domain.com/health
curl -f https://api.your-domain.com/api/ready
```

也可以直接跑仓库自带的部署验证脚本：

```bash
API_BASE_URL=https://api.your-domain.com ./scripts/verify-deployment.sh
```

### 优雅停机与摘流

收到 SIGTERM 后的顺序是：`/health` 和 `/api/ready` 立即转 503 → 等待 `SHUTDOWN_DRAIN_MS`
→ 关闭监听端口 → 等存量请求跑完 → 退出。

本机实测（`SHUTDOWN_DRAIN_MS=3000`，直接对进程发 SIGTERM）：

| 时刻        | `/live` | `/api/ready` | 端口是否还接受 TCP |
| ----------- | ------- | ------------ | ------------------ |
| SIGTERM     | 200     | 200          | 是                 |
| **+2ms**    | 200     | **503**      | 是（排水中）       |
| **+3007ms** | 拒绝    | 拒绝         | 否（监听已关）     |
| **+3018ms** | —       | —            | 进程 exit 0        |

即摘流信号在 2ms 内生效，端口关闭时刻和配置值的误差在 10ms 量级。排水期间 `/live`
始终 200 —— 这是故意的，否则容器会被 autoheal 在停机过程中再踹一脚。

`SHUTDOWN_DRAIN_MS` 生产默认 5000，其他环境默认 0。取值要求：

- **大于** LB 的探测间隔 × 失败阈值，否则 LB 还没来得及摘流端口就关了，滚动发布期间会出 502。
- **小于** 编排的停机宽限期（`docker-compose.prod.yml` 里 `stop_grace_period: 30s`），
  否则排水没走完就被 SIGKILL。

**默认的 5000 只够用于反应快的 LB。** 按实际探测参数查表，别照抄默认值：

| 摘流方  | 探测间隔 × 失败阈值（默认）    | `SHUTDOWN_DRAIN_MS` 建议 | 还要改什么                               |
| ------- | ------------------------------ | ------------------------ | ---------------------------------------- |
| nginx   | 被动检查，约 1× `fail_timeout` | 5000（默认够用）         | —                                        |
| k8s     | `10s × 3` = 30s                | 35000                    | `terminationGracePeriodSeconds` ≥ 60     |
| AWS ALB | `30s × 2` = 60s                | 65000                    | 注销延迟 ≥ 90s，`stop_grace_period` 同调 |

本项目默认用 docker-compose + 前置 nginx，属于第一行，5000 够用。**换成 k8s 或 ALB
而没同步调这个值，滚动发布必然继续掉请求** —— 这是配置问题，不是代码问题，代码这边
已经验证过按配置值精确执行。

`GRACEFUL_SHUTDOWN_TIMEOUT_MS`（默认 10000）是排水结束之后留给存量请求的时间，
强制退出的总时限是两者之和（默认 15s，仍在 `stop_grace_period: 30s` 之内）。
调大排水窗口时务必同步抬高 `stop_grace_period`，否则排水会被 SIGKILL 截断。

## 3. Nginx 反向代理示例

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

  # 本仓库只提供 API。静态资源/界面由你自己的客户端部署决定，这里不做假设。
  location /api {
    proxy_pass http://backend:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

注意这份示例**没有**转发 `/metrics` —— 那是刻意的，见[监控与日志](#5-监控与日志)。
`/api-docs` 同理：它不在 `/api` 前缀下，默认不会被转发出去。

## 4. 运行时注意事项

- **Redis 可选**。不配 `REDIS_URL` 时每个实例各用自己的进程内排盘缓存，结果完全一致，
  只是跨实例命中率低。它不承载任何与正确性相关的状态，所以 Redis 挂了不影响服务。
- **多实例不需要任何协调**。引擎无状态，不需要粘性会话，扩容就是多起几个进程。
- `AI_PROVIDER` 会根据密钥自动选择；无密钥时回退 `mock`。
- 生产默认开启速率限制，可用 `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` 调整。
- **可选超时**：`SERVER_KEEP_ALIVE_TIMEOUT_MS` / `SERVER_HEADERS_TIMEOUT_MS` /
  `SERVER_REQUEST_TIMEOUT_MS` 控制慢连接；`headersTimeout` 应大于 `keepAliveTimeout`。
- **启动校验**：生产模式下只有 `DOCS_PASSWORD` 缺失会阻止启动；`CORS_ALLOWED_ORIGINS`、
  `BACKEND_BASE_URL`、`REDIS_URL`、`METRICS_TOKEN`、`SENTRY_DSN`、`TRUST_PROXY` 缺失只打
  warning，因为无头部署里它们各自都有合理的「就是不配」的情况。

## 5. 监控与日志

日志是 Pino JSON 输出到 stdout，可接入 ELK/CloudWatch。
探针路径（`/live`、`/health`、`/metrics`、`/api/health`、`/api/ready`）不写访问日志 ——
它们每几秒一次，记下来只会把真实流量淹掉。

### 指标抓取（`/metrics`）

Prometheus 文本格式，**需要 Bearer token**：

```bash
curl -H "Authorization: Bearer $METRICS_TOKEN" http://127.0.0.1:4000/metrics
```

- `METRICS_TOKEN` 用 `openssl rand -hex 32` 生成。**生产环境不配就返回 404** ——
  这个端点会报出连接数和内存占用，不是可以裸奔的东西。
- 直接抓引擎 `127.0.0.1:4000`。它不在 `/api` 前缀下，反向代理默认不会转发它，
  也**不要**把它暴露到公网。
- 它复用健康检查的缓存快照（见下），所以抓取间隔再短也不会额外压依赖。

暴露的指标：

| 指标                                                      | 用途                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `bazi_up` / `bazi_uptime_seconds`                         | 存活与重启检测                                                                    |
| `bazi_shutting_down`                                      | 1 表示正在排水，滚动发布期间预期为 1                                              |
| `bazi_dependency_up{dependency="..."}`                    | 每个依赖一条时间序列，由健康快照直接驱动。未配置的可选依赖算 `disabled`，上报为 1 |
| `bazi_rate_limit_degraded`                                | 1 表示限流已退化成单实例内存计数                                                  |
| `bazi_process_resident_memory_bytes` / `_heap_used_bytes` | 内存趋势                                                                          |

建议的告警线：

```yaml
# 限流退化：Redis 没了，配额变成"每实例"而不是"整个部署"
- alert: BaziRateLimitDegraded
  expr: bazi_rate_limit_degraded == 1
  for: 2m

# 依赖不可用（排水期间 bazi_shutting_down=1，用它排除掉发布窗口）
- alert: BaziDependencyDown
  expr: bazi_dependency_up == 0 and bazi_shutting_down == 0
  for: 2m
```

`bazi_rate_limit_degraded` 是时间窗口信号，Redis 恢复后约 60s 自动归零，不需要重启进程。
同一件事在日志里是每 60s 一条 `[rate-limit] Redis unavailable` 的 error。

### 健康检查缓存

`/health` 注册在限流**之前**（探针不能被限流），代价是它天然对未认证的请求循环敞开。
因此深度检查结果按 `HEALTH_CACHE_TTL_MS`（生产默认 1000ms）缓存，并且并发请求共享同一次探测：
探针每 5–10s 一次，拿到的始终是新鲜结果；而一次洪水只会被折叠成每窗口一次真实探测。
设为 `0` 可关闭缓存（每个请求都真的去探依赖，仅用于排查）。

### 其余建议监控

- API p95 / 错误率
- Redis 内存占用逼近 `REDIS_MAXMEMORY` 的比例（到顶后按 `volatile-lru` 淘汰）
- `/api/ready` 返回状态

## 6. 故障排查速查

```bash
docker compose -f docker-compose.prod.yml ps                    # 容器状态
docker compose -f docker-compose.prod.yml logs -f backend       # 引擎日志
docker compose -f docker-compose.prod.yml exec redis redis-cli ping
curl -f http://127.0.0.1:4000/api/system/cache-status           # 缓存与 Redis 连通性
```

| 症状             | 先看这里                                                            |
| ---------------- | ------------------------------------------------------------------- |
| 容器起来就退     | 日志里找 `[config]` —— 生产模式缺 `DOCS_PASSWORD` 是最常见的一条    |
| `/health` 503    | 看 `checks` 字段哪个依赖挂了；只有 Redis 的话服务其实还能用         |
| 所有用户一起 429 | `TRUST_PROXY` 跳数数错，`req.ip` 变成了代理地址，全站共用一个限流桶 |
| 浏览器报 CORS    | `CORS_ALLOWED_ORIGINS` 没登记该来源。服务端到服务端调用不受影响     |
| `/metrics` 404   | 没配 `METRICS_TOKEN`。这是安全默认值，不是故障                      |
| 滚动发布期间 502 | `SHUTDOWN_DRAIN_MS` 小于 LB 的探测间隔 × 失败阈值，查上面那张表     |

## 7. 安全要点

- **HTTPS 强制启用**：所有生产流量必须通过 HTTPS；由 Nginx 或负载均衡器处理证书。
- **CORS 白名单**：通过 `CORS_ALLOWED_ORIGINS` 限制浏览器来源，生产环境不应包含 localhost。
  服务端到服务端和 Agent 调用不带 Origin 头，不受这里影响。
- **API 文档保护**：`DOCS_PASSWORD` 是生产模式的硬性必填项（可选 `DOCS_USER`）。
- **指标端点**：`METRICS_TOKEN` 不配就是 404；配了也只从内网抓，不要经公网反代暴露。
- **`TRUST_PROXY` 要数对跳数**：写 `1` 表示"只信任一跳"。数错会让 `req.ip` 变成上游代理
  的地址，于是所有用户共用一个速率限制桶，一个人打满全站 429。上面的 nginx 示例是
  代理直连引擎，一跳；如果你在它前面还叠了 CDN 或外层 LB，那就是两跳。
  **绝对不要填 `true`** —— 那等于信任任意 `X-Forwarded-For`，限流可以被一个请求头绕过。
- **API 密钥保护**：定期轮换 AI provider 密钥；用环境变量而非硬编码。
- **速率限制**：生产默认开启，按需调整 `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`。
- **端口安全**：关闭不必要的端口；仅暴露 HTTPS (443) 和可能的 SSH (22)。
- **autoheal 的代价**：它需要 Docker socket，等价于宿主 root 权限。挂成 `:ro` 并不能限制
  能通过这个 socket 发起什么请求。不能接受就删掉这个服务，改用编排层自己的重启策略。

引擎不存任何用户数据，所以这套部署里没有数据保护、加密存储、数据删除响应这类义务 ——
那些责任在调用方那一侧。

## 8. 升级步骤

1. 拉取新镜像或代码
2. 滚动重启 backend（没有迁移步骤）
3. 验证 `/api/ready` 与核心接口，或直接跑 `./scripts/verify-deployment.sh`

> 本仓库只发布 API，没有静态资源要考虑缓存失效。要注意的是接口的向后兼容：
> 滚动重启期间新旧引擎会同时在跑，客户端可能打到任意一个。
>
> 回滚就是把镜像切回上一版重启 —— 无状态意味着没有「数据已经被新版本改过」这种情况，
> 回滚是干净的。
