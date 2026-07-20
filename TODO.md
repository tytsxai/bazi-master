# BaZi Master 任务清单

> 更新: 2026-07-20

## 当前状态

| 指标         | 状态                        |
| ------------ | --------------------------- |
| 后端测试     | 376/376 通过                |
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
- [ ] 备份异地化：`BACKUP_DIR` 指向独立卷 + 对象存储上传
      （现在备份和数据库同宿主，防不了硬件故障）
- [ ] 容器 unhealthy 后无人自愈：compose 不会因 unhealthy 重启容器，
      需要 autoheal sidecar 或宿主 cron 兜底
- [ ] 后端覆盖率门槛：`test:coverage` 存在但无阈值，CI 也没跑

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

## 已放弃

- WebAssembly 重计算逻辑 —— `frontend/assembly/` 只有三个未被任何代码调用的函数，
  却被 `predev`/`prebuild` 钉在构建关键路径上，是个纯粹的失败点。已整条移除。
