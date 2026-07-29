# BaZi Master 任务清单

> 更新: 2026-07-28

## 当前状态

| 指标     | 状态                                |
| -------- | ----------------------------------- |
| 交付形态 | HTTP API，无前端界面                |
| 后端测试 | 待重新确认                          |
| 端到端   | 2 个 `backend/scripts/verify-*.mjs` |
| CLI 契约 | 82 项通过                           |
| 数据库   | PostgreSQL（不支持 SQLite）         |
| Redis    | 生产必需，缺失则拒绝启动            |
| Lint     | 待重新确认                          |

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
- [ ] 部署时按所用 LB 查表设 `SHUTDOWN_DRAIN_MS`：机制已实测（+2ms 摘流、
      误差 10ms 量级，见 PRODUCTION.md 的对照表），但默认 5000 只够 nginx 被动检查；
      换 k8s 要 35000、ALB 要 65000，且都要同步抬高 `stop_grace_period`
- [ ] 给 `totalConnections / maxConnections` 配告警（比值告警，不是等它开始拒绝）。
      指标已由 `/api/admin/health` 暴露，缺的是监控侧的告警规则
- [ ] 按 IP 的 WebSocket 并发限制随前端 nginx 一起删掉了，现在只剩后端的
      `WS_MAX_CONNECTIONS` 总数上限。要恢复按来源限流，得在你自己的反向代理上配，
      并注意套了 CDN 时要设 `set_real_ip_from` / `real_ip_header`，否则会退化成
      全站共用一个桶
- [ ] 给调用方的接入示例：把 `docs/openapi.json` 转成 agent tool schema 的最小样例

## 已完成

- [x] 后端模块化重构
- [x] 迁移到 PostgreSQL（移除 SQLite 支持）
- [x] 文档完善 (README, PRODUCTION, API)
- [x] 备份/恢复脚本 + 恢复后校验
- [x] 添加 LICENSE 文件
- [x] 生成 OpenAPI/Swagger 文档 (`/api-docs`，生产 Basic Auth 保护)
- [x] 健康检查 (`/live`, `/health`, `/api/ready`)
- [x] 八字重复记录检测
- [x] 历史记录客户端搜索过滤
- [x] 根级 ESLint/Prettier 配置，并接入 CI
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
- [x] 后端容器直接 `node scripts/start.mjs`，不再经 npm/sh 转发 SIGTERM
- [x] 容器 `ulimits.nofile` 显式钉死：每条 WS 连接占一个 fd，
      实测每条只吃 ~9KB 内存，所以先撞上的一定是 fd 而不是内存限额
- [x] 删除前端，项目收敛为纯算法能力层（frontend/ 全部 232 个文件、CLI 的 web 组件、
      compose 的 frontend 服务、CI 的前端三步）
- [x] 排水时序端到端实测并写进 PRODUCTION.md（+2ms 摘流 / 误差 10ms 量级）
- [x] 备份定时调度 (`scripts/install-cron.sh` + `cron-backup.sh`，带锁和失败告警)

## 已放弃

- WebAssembly 重计算逻辑 —— 前端 `assembly/` 只有三个未被任何代码调用的函数，
  却被 `predev`/`prebuild` 钉在构建关键路径上，是个纯粹的失败点。已整条移除。
- 自带 React 前端 —— 界面形态因产品而异（Web / 小程序 / App / 纯 agent 调用），
  塞一套参考实现进来只会模糊能力层的边界，还要为它维护 91 个 Playwright 用例和
  一整套浏览器依赖。已整体删除，界面交给调用方。
