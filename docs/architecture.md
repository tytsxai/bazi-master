# BaZi Master - 架构文档

## 系统概览
- 前端：React SPA（Vite 构建，端口 3000）
- 后端：Node.js + Express + Prisma（端口 4000）
- 数据：SQLite（默认）/ PostgreSQL（生产推荐）
- 缓存/会话：Redis 可选，未配置时使用内存回退

## 目录结构（关键部分）
```
backend/
├── server.js              # 入口，挂载 /api 与健康检查
├── routes/                # API 路由
│   ├── api.js             # 聚合与 /health /ready
│   ├── auth.js            # 注册/登录/注销/自删
│   ├── ai.js              # AI provider 信息
│   ├── bazi.js            # 八字计算 + AI 解读 + 记录 CRUD
│   ├── tarot.js           # 抽牌 + AI 解读 + 历史 CRUD
│   ├── iching.js          # 起卦 + AI 解读
│   ├── zodiac.js          # 星座信息/运势/配对/上升
│   └── ziwei.js           # 紫微排盘 + 历史 CRUD
├── services/              # 业务逻辑（*.service.js）
├── middleware/            # auth、rateLimit、cors、helmet 等
├── utils/                 # validation、pagination、timezone、passwords
├── config/                # app/prisma/redis/logger 配置
└── test/                  # 后端测试（Node.js test）

frontend/
├── src/
│   ├── pages/             # Home、Bazi、Tarot、Iching、Zodiac、Ziwei、History、Favorites、Profile、Login、NotFound 等
│   ├── components/        # BaziForm/BaziResult 等业务组件
│   ├── auth/              # AuthContext、ProtectedRoute
│   ├── hooks/             # useHistoryData 等
│   ├── i18n/              # en/zh-CN/zh-TW 语言包
│   └── utils/             # apiError、aiProvider、clientId
├── tests/                 # Playwright 规格（E2E）
└── scripts/               # dev-server、verify flows
```

## 数据与流程
- **认证**：邮箱注册/登录生成会话 token，`Authorization: Bearer <token>`；Redis 可存储会话，未配置时内存。
- **八字**：`/api/bazi/calculate` 公开；登录后可调用 `/full-analysis`（AI 解读）与 `/records` CRUD。计算结果可缓存（内存+可选 Redis 镜像）。
- **塔罗**：公开抽牌 `/api/tarot/draw`；登录后 AI 解读 `/ai-interpret` 并保存历史。
- **周易**：公开起卦 `/api/iching/divine`；登录后 AI 解读 `/ai-interpret`。
- **星座**：信息、运势、配对、上升星座计算均为公开接口。
- **紫微**：登录后计算与历史 CRUD。
- **AI 提供商**：`/api/ai/providers` 返回当前与可用 provider；无密钥时默认 `mock`。

## 缓存与并发
- 八字计算结果缓存（内存，支持 Redis 镜像）；键包含出生信息与性别。
- AI 请求并发守卫 `createAiGuard`：同用户同一时间仅处理一个 AI 请求，避免重复消耗。
- 速率限制：通过中间件按窗口/最大值控制；生产建议启用。

## 安全
- Helmet 安全头、CORS 白名单（基于 `FRONTEND_URL` / `CORS_ALLOWED_ORIGINS`）。
- URL 长度与请求体大小限制（`MAX_URL_LENGTH` / `JSON_BODY_LIMIT`）。
- 管理员身份基于邮箱白名单 `ADMIN_EMAILS`。

## 日志与监控
- Pino JSON 日志输出 stdout；包含 requestId。
- 健康检查：`/health`（存活）、`/api/ready`（依赖检查：数据库、Redis）。

## 已实现
- **API 文档**: OpenAPI 3.0 规范已实现，访问 `/api-docs` (Swagger UI) 或 `/api-docs.json` (JSON)
- **契约测试**: 19 个 API 契约测试确保文档与实现一致性

## 已知待办
- 性能基线审计尚未完成
