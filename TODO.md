# BaZi Master 任务清单

> 更新: 2026-07-28

## 当前状态

| 指标         | 状态                        |
| ------------ | --------------------------- |
| 后端测试     | 397/397 通过                |
| 前端单元测试 | 86 用例 / 16 文件 (Vitest)  |
| 前端 E2E     | 89 文件 (Playwright)        |
| 数据库       | PostgreSQL（不支持 SQLite） |
| Redis        | 生产必需，缺失则拒绝启动    |
| Lint         | 0 error / 40 warning        |

> 数字请在改动后用 `./bazi test --json` 重新确认再更新，不要凭印象写。

## 待办

- [ ] TypeScript 迁移评估
- [ ] OAuth 完整验证（Google / WeChat 真实回调联调）
- [ ] CDN 资源分发
- [ ] 恢复演练：跑一次完整的 `restore-db.sh`，测出真实 RTO 并回填
      `docs/backend-reliability.md`（目前那里的 RTO/RPO 只是目标值）
- [ ] 备份异地化：`BACKUP_DIR` 已可指向独立卷，但对象存储上传仍需自行接入
      （备份默认还是和数据库同宿主，防不了硬件故障）
- [ ] 在真实部署机上验证备份 cron：装完跑一次 `./scripts/cron-backup.sh`，
      确认 cron 环境下能找到 docker、能写日志（本机没装 Docker，只验到失败路径）
- [ ] 后端覆盖率门槛：`test:coverage` 存在但无阈值，CI 也没跑
- [ ] 上线后确认 `SHUTDOWN_DRAIN_MS`（默认 5000）确实大于所用 LB 的
      探测间隔 × 失败阈值；小了滚动发布还是会漏 502
- [ ] `WS_MAX_CONNECTIONS` 默认 500 是拍的，不是压出来的。上线后按实际
      内存占用和并发调，并对 `totalConnections / maxConnections` 配告警
- [ ] 按 IP 的 WebSocket 限流要做在边缘 nginx 上（后端拿不到真实地址）

## 已完成

- [x] 后端模块化重构
- [x] 迁移到 PostgreSQL（移除 SQLite 支持）
- [x] 文档完善 (README, PRODUCTION, API)
- [x] 备份/恢复脚本 + 恢复后校验
- [x] 添加 LICENSE 文件
- [x] 生成 OpenAPI/Swagger 文档 (`/api-docs`，生产 Basic Auth 保护)
- [x] 前端 E2E 测试稳定性 (Playwright retries)
- [x] Bundle 优化 (代码分割, `npm run analyze`)
- [x] React 组件单元测试 (AuthContext, ProtectedRoute, BaziForm)
- [x] 健康检查 (`/live`, `/health`, `/api/ready`)
- [x] 八字重复记录检测
- [x] 历史记录客户端搜索过滤
- [x] 根级 ESLint/Prettier 配置，并接入 CI
- [x] React Router v7 future flags 兼容
- [x] 错误追踪集成 (Sentry，采样率/environment/release 可配)
- [x] 性能基线 (Lighthouse CI)
- [x] PWA 离线支持
- [x] Virtual scrolling 大数据列表
- [x] 多语言完善 (日语/韩语)
- [x] `./bazi` 程序化 CLI
- [x] 容器自愈 (autoheal，只覆盖无状态服务)
- [x] 优雅停机加排水窗口：SIGTERM 后 `/health` 和 `/api/ready` 立即 503，
      等 `SHUTDOWN_DRAIN_MS` 再关监听，避免滚动发布期间 LB 打进来的请求被拒
- [x] 容器 healthcheck 从 `/api/ready` 改回 `/live`，避免数据库抖动经 autoheal
      放大成崩溃循环
- [x] 记录表 `userId` 索引（PostgreSQL 不会自动给外键建索引，历史列表原本全表扫）
- [x] AI 流式响应加空闲超时（原来只有响应头有 deadline，中途卡住会永久挂住
      连接和该用户的 AI 并发槽）
- [x] `/ws/ai` 连接总数上限（upgrade 握手不经过 HTTP 限流）
- [x] 前端 `index.html` / `sw.js` 禁缓存、`/assets/` 长缓存，修掉发布后白屏
- [x] 后端容器直接 `node scripts/start.mjs`，不再经 npm/sh 转发 SIGTERM
- [x] 备份定时调度 (`scripts/install-cron.sh` + `cron-backup.sh`，带锁和失败告警)

## 已放弃

- WebAssembly 重计算逻辑 —— `frontend/assembly/` 只有三个未被任何代码调用的函数，
  却被 `predev`/`prebuild` 钉在构建关键路径上，是个纯粹的失败点。已整条移除。
