# BaZi Master 任务清单

> 更新: 2025-12-27

## 当前状态

| 指标 | 状态 |
|------|------|
| 后端测试 | 95/95 通过 (100%) |
| 前端单元测试 | 22 用例 (Vitest) |
| 前端E2E测试 | 93 用例 (Playwright) |
| 数据库 | PostgreSQL 生产就绪 |
| 文档 | 已完善 (v0.1.1) |

## 已完成

- [x] 后端模块化重构
- [x] 数据库兼容性 (SQLite/PostgreSQL)
- [x] 文档完善 (README, PRODUCTION, API)
- [x] 备份脚本
- [x] 添加 LICENSE 文件
- [x] 生成 OpenAPI/Swagger 文档 (`/api-docs`)
- [x] 前端 E2E 测试稳定性 (Playwright retries)
- [x] Bundle 优化 (代码分割, `npm run analyze`)
- [x] React 组件单元测试 (AuthContext, ProtectedRoute, BaziForm)
- [x] Redis 健康检查 (`/health`, `/api/ready`)
- [x] 生产环境 Basic Auth 保护 API 文档

## P1 - 本周

- [ ] TypeScript 迁移评估
- [ ] OAuth 完整验证 (Google/WeChat)
- [ ] 错误追踪集成 (Sentry)

## P2 - 本月

- [ ] 性能基线建立 (Lighthouse CI)
- [ ] CDN 资源分发
- [ ] PWA 离线支持

## P3 - 后续

- [ ] Virtual scrolling 大数据列表
- [ ] WebAssembly 重计算逻辑
- [ ] 多语言完善 (日语/韩语)
