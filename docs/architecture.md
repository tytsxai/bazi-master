# BaZi Master - 架构文档

> 版本: v0.2.0 | 更新: 2026-07-28

BaZi Master 是一个 self-hostable 的玄学计算引擎，以文档化 HTTP API 的形式交付。它不是单独算法库、不是托管 SaaS，也不含前端界面：八字排盘、塔罗、周易、星座、紫微斗数、合盘分析、AI 解读、用户系统和生产基础设施收敛在一个 Express + Prisma + PostgreSQL 仓库里，供你自己的客户端或智能体调用。

## 系统概览

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  你的客户端 /   │────▶│  Express API    │────▶│  PostgreSQL     │
│  AI Agent       │ HTTP│  (Node:4000)    │     │  (Prisma DS)    │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │     Redis       │
                        │ (会话/缓存/OAuth)│
                        └─────────────────┘
```

- **调用方**: 任意 HTTP 客户端 —— 你自己的 Web/App/小程序前端，或把 OpenAPI 转成 tool schema 的智能体。本仓库不提供界面
- **服务端**: Node.js 20+ / Express 4 / Prisma ORM（端口 4000）
- **数据库**: PostgreSQL（当前 Prisma schema 的 datasource）
- **缓存/会话**: Redis（本地可选，生产/多实例必需，用于会话/八字缓存/OAuth state/密码重置）
- **AI Provider**: mock / OpenAI / Anthropic 文本解读；Soul Portrait 图片当前走 OpenAI 或 mock 占位

## 目录结构

```
bazi-master/
├── backend/
│   ├── server.js              # 入口，挂载 /api 与健康检查
│   ├── routes/                # API 路由 (15 个模块)
│   │   ├── api.js             # 路由聚合 + /api/health /api/ready
│   │   ├── admin.js           # 管理端健康检查 (需管理员)
│   │   ├── ai.js              # AI provider 信息
│   │   ├── auth.js            # 认证: 注册/登录/注销/OAuth/密码重置
│   │   ├── bazi.js            # 八字: 计算/AI解读/记录CRUD
│   │   ├── calendar.js        # 每日运势
│   │   ├── favorites.js       # 收藏管理
│   │   ├── iching.js          # 周易: 起卦/AI解读
│   │   ├── locations.js       # 位置搜索 (占位)
│   │   ├── media.js           # AI图片 (灵魂画像)
│   │   ├── synastry.js        # 合盘分析
│   │   ├── tarot.js           # 塔罗: 抽牌/AI解读/历史
│   │   ├── user.js            # 用户设置
│   │   ├── ziwei.js           # 紫微: 排盘/历史
│   │   └── zodiac.js          # 星座: 信息/运势/配对/上升
│   ├── services/              # 业务逻辑 (21 个服务)
│   │   ├── ai.service.js          # AI 调用与 provider 管理
│   │   ├── apiSchema.service.js   # OpenAPI 规范生成
│   │   ├── auth.service.js        # 认证逻辑
│   │   ├── cache.service.js       # 缓存管理 (内存+Redis镜像)
│   │   ├── calculations.service.js # 八字计算核心
│   │   ├── credentialRevocation.service.js # 凭据变更后吊销旧会话
│   │   ├── email.service.js       # 邮件发送 (SMTP)
│   │   ├── health.service.js      # 健康检查
│   │   ├── iching.service.js      # 周易起卦
│   │   ├── lifecycle.service.js   # 进程生命周期/优雅停机就绪标志
│   │   ├── oauth.service.js       # OAuth (Google/WeChat)
│   │   ├── prompts.service.js     # AI 提示词管理
│   │   ├── resetTokens.service.js # 密码重置 token
│   │   ├── schema.service.js      # 数据校验
│   │   ├── session.service.js     # 会话管理
│   │   ├── solarTime.service.js   # 真太阳时计算
│   │   ├── synastry.service.js    # 合盘分析
│   │   ├── tarot.service.js       # 塔罗抽牌
│   │   ├── websocket.service.js   # WebSocket AI 流式
│   │   ├── ziwei.service.js       # 紫微排盘
│   │   └── zodiac.service.js      # 星座计算
│   ├── middleware/            # 中间件
│   │   ├── auth.js            # 认证校验
│   │   ├── error.js           # 错误处理
│   │   ├── rateLimit.middleware.js # 速率限制
│   │   ├── security.js        # Helmet/CORS
│   │   ├── logging.middleware.js   # 请求日志
│   │   └── validation.middleware.js # 输入校验
│   ├── utils/                 # 工具函数
│   ├── config/                # 配置 (app/prisma/redis/logger)
│   ├── constants/             # 常量 (天干地支/紫微/生肖)
│   └── test/                  # 后端测试
│
├── prisma/                    # 数据库 schema & migrations
├── docs/                      # 项目文档
├── docker/                    # Docker 初始化脚本
└── scripts/                   # 备份/恢复脚本
```

## 数据流程

### 认证流程

```
用户 ──▶ POST /api/auth/login ──▶ 验证凭据 ──▶ 生成 Token
                                              │
                                              ▼
                                    写入会话 (内存 + Redis镜像)
                                              │
                                              ▼
                                    返回 Token + 设置 Cookie
```

- 支持邮箱注册/登录、OAuth (Google/WeChat)、密码重置
- Token 通过 `Authorization: Bearer` 或 `bazi_session` Cookie 传递

### 核心功能权限

| 功能               | 公开 | 需认证 |
| ------------------ | ---- | ------ |
| 八字计算           | ✓    | -      |
| 八字 AI 解读/记录  | -    | ✓      |
| 塔罗抽牌           | ✓    | -      |
| 塔罗 AI 解读/历史  | -    | ✓      |
| 周易起卦           | ✓    | -      |
| 周易 AI 解读       | -    | ✓      |
| 星座信息/运势/配对 | ✓    | -      |
| 紫微排盘/历史      | -    | ✓      |
| 合盘分析           | ✓    | -      |
| 每日运势           | -    | ✓      |
| 灵魂画像           | -    | ✓      |

## 缓存策略

- **八字计算缓存**: 内存 + Redis 镜像，键包含出生信息与性别
- **会话存储**: 内存 + Redis 镜像（生产/多实例需 Redis，避免重启或实例切换丢会话）
- **OAuth State**: 内存 + Redis 镜像（多实例需 Redis 保持一致性）
- **密码重置 Token**: 内存 + Redis 镜像（多实例需 Redis 保持一致性）

## 并发控制

```javascript
// AI 请求并发守卫
createAiGuard: 同用户同时仅允许 1 个 AI 请求
- 防止重复消耗 API 配额
- 返回友好错误: "AI request already in progress"
```

## 安全机制

- **Helmet**: 安全响应头
- **CORS**: 白名单控制 (`FRONTEND_URL` / `CORS_ALLOWED_ORIGINS`，填调用方客户端的来源)
- **速率限制**: 窗口/最大值控制 (`RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`)
- **输入校验**: URL 长度、请求体大小、参数验证
- **管理员**: 邮箱白名单 `ADMIN_EMAILS`

## 日志与监控

- **日志格式**: Pino JSON (stdout)，包含 requestId
- **健康检查**: `/health`、`/api/ready` 执行 DB/Redis 依赖检查
- **WebSocket**: `/ws/ai` AI 流式输出

## 测试覆盖

| 类型     | 覆盖范围                               | 工具                           |
| -------- | -------------------------------------- | ------------------------------ |
| 后端单测 | 认证、核心服务、路由、中间件、API 契约 | Node.js test / Supertest       |
| 端到端   | 数据删除与级联的真实数据库校验         | `backend/scripts/verify-*.mjs` |
| CLI 契约 | 退出码约定、JSON 输出、安全闸          | Node.js test                   |

## 版本历史

以 CHANGELOG.md 为准，这里只列梗概。打过 tag 的只有 `v0.1.0` 和 `v0.2.0`；
带 `-dev` 的是 0.1.0 之前用过的内部编号，仓库里没有对应的 tag。

- **v0.2.0** (2026-07-28): 生产就绪补强 —— 停机排水、记录表索引、AI 流式空闲超时、
  WebSocket 连接上限（全局 + 按 IP）、容器 fd 上限、发布缓存策略、`./bazi` CLI 契约测试
- **v0.1.0** (2026-05-19): 首个 tag 版本，固化 v0.1 参考实现面
- **v0.1.3-dev** (2025-12-30): 文档完善、API 文档更新（已并入 0.1.0）
- **v0.1.2-dev** (2025-12-30): 八字重复检测、历史搜索过滤、OAuth/密码重置、代码质量改进（已并入 0.1.0）
- **v0.1.1** (2025-12-27): 生产就绪增强 (健康检查, Redis, Bundle 分析)（已并入 0.1.0）
- **v0.1.0-alpha** (2025-12-26): 初始开发版本（已并入 0.1.0）

## 相关文档

- [README.md](../README.md): 项目定位、快速开始、功能与限制
- [docs/api.md](api.md): HTTP API 清单
- [docs/development.md](development.md): 本地开发与测试
- [docs/faq.md](faq.md): FAQ、适用场景和搜索关键词
- [../llms.txt](../llms.txt): 面向 AI 搜索和代码助手的结构化摘要
