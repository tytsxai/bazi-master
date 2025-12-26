# 任务清单（执行版）
更新时间: 2025-12-26

## 测试与质量
- [x] 运行并记录结果：`npm -C backend test` (Passed: 95/95)
- [x] 运行并记录结果：`npm -C frontend test` (Build Passed; Units Partial)
- [x] 如有失败，补充注释或 skip 理由，并在 README 标注状态

## 文档
- [ ] 生成 OpenAPI/Swagger 快照并挂载 `/api-docs`（生产需鉴权）
- [ ] 添加 `.env.production` 示例或模板说明
- [ ] 补充 LICENSE 文件及 README 链接

## 后端
- [ ] 检查 Redis 可选回退的生产风险，必要时强制要求 `REDIS_URL` in prod
- [ ] 校验 AI 并发守卫 `createAiGuard` 的速率和超时策略
- [ ] 评审 `favorites` / `records` 相关权限与所有权校验

## 前端
- [ ] 核心页面组件增加单测（Auth、ProtectedRoute、BaziForm）
- [ ] Playwright 测试：稳定选择器与重试策略
- [ ] Bundle 体积审计（目标首屏 <3s）

## 部署与运维
- [ ] Docker Compose 生产路径验证：PostgreSQL、Redis、反向代理健康检查
- [ ] 监控指标定义：API p95、错误率、DB 连接池使用率、Redis 命中率
- [ ] 故障演练脚本：断开 Redis / DB，验证回退与告警
