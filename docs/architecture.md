# BaZi Master - 架构文档

> 版本: v0.1.3-dev | 更新: 2025-12-30

## 系统概览

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React SPA     │────▶│  Express API    │────▶│  PostgreSQL     │
│   (Vite:3000)   │     │  (Node:4000)    │     │  (生产推荐)      │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │     Redis       │
                        │ (会话/缓存/OAuth)│
                        └─────────────────┘
```

- **前端**: React 18 SPA（Vite 构建，端口 3000）
- **后端**: Node.js 20+ / Express 4 / Prisma ORM（端口 4000）
- **数据库**: SQLite（开发默认）/ PostgreSQL（生产推荐）
- **缓存/会话**: Redis（生产必需，用于会话/八字缓存/OAuth state/密码重置）

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
│   ├── services/              # 业务逻辑 (20 个服务)
│   │   ├── ai.service.js          # AI 调用与 provider 管理
│   │   ├── apiSchema.service.js   # OpenAPI 规范生成
│   │   ├── auth.service.js        # 认证逻辑
│   │   ├── cache.service.js       # 缓存管理 (内存+Redis镜像)
│   │   ├── calculations.service.js # 八字计算核心
│   │   ├── email.service.js       # 邮件发送 (SMTP)
│   │   ├── health.service.js      # 健康检查
│   │   ├── iching.service.js      # 周易起卦
│   │   ├── oauth.service.js       # OAuth (Google/WeChat)
│   │   ├── prompts.service.js     # AI 提示词管理
│   │   ├── resetTokens.service.js # 密码重置 token
│   │   ├── schema.service.js      # 数据校验
│   │   ├── session.service.js     # 会话管理
│   │   ├── softDelete.service.js  # 软删除
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
│   └── test/                  # 后端测试 (357+ 用例)
│
├── frontend/
│   ├── src/
│   │   ├── pages/             # 页面组件 (12+)
│   │   ├── components/        # 业务组件
│   │   │   ├── auth/          # 登录/注册表单
│   │   │   ├── bazi/          # 八字表单/结果
│   │   │   ├── chat/          # AI 聊天界面
│   │   │   ├── history/       # 历史记录
│   │   │   ├── profile/       # 用户资料
│   │   │   ├── tarot/         # 塔罗组件
│   │   │   ├── ziwei/         # 紫微组件
│   │   │   └── ui/            # 通用 UI 组件
│   │   ├── auth/              # AuthContext
│   │   ├── hooks/             # 自定义 hooks
│   │   ├── i18n/              # 多语言 (en/zh-CN/zh-TW/ja/ko)
│   │   └── utils/             # 工具函数
│   ├── tests/                 # Playwright E2E (89+ 文件)
│   ├── assembly/              # WebAssembly 模块
│   └── scripts/               # 开发脚本
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

| 功能 | 公开 | 需认证 |
|------|------|--------|
| 八字计算 | ✓ | - |
| 八字 AI 解读/记录 | - | ✓ |
| 塔罗抽牌 | ✓ | - |
| 塔罗 AI 解读/历史 | - | ✓ |
| 周易起卦 | ✓ | - |
| 周易 AI 解读 | - | ✓ |
| 星座信息/运势/配对 | ✓ | - |
| 紫微排盘/历史 | - | ✓ |
| 合盘分析 | ✓ | - |
| 每日运势 | - | ✓ |
| 灵魂画像 | - | ✓ |

## 缓存策略

- **八字计算缓存**: 内存 + Redis 镜像，键包含出生信息与性别
- **会话存储**: 内存 + Redis 镜像（生产必需 Redis）
- **OAuth State**: Redis 存储（多实例一致性）
- **密码重置 Token**: Redis 存储（多实例一致性）

## 并发控制

```javascript
// AI 请求并发守卫
createAiGuard: 同用户同时仅允许 1 个 AI 请求
- 防止重复消耗 API 配额
- 返回友好错误: "AI request already in progress"
```

## 安全机制

- **Helmet**: 安全响应头
- **CORS**: 白名单控制 (`FRONTEND_URL` / `CORS_ALLOWED_ORIGINS`)
- **速率限制**: 窗口/最大值控制 (`RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`)
- **输入校验**: URL 长度、请求体大小、参数验证
- **管理员**: 邮箱白名单 `ADMIN_EMAILS`

## 日志与监控

- **日志格式**: Pino JSON (stdout)，包含 requestId
- **健康检查**: `/health`、`/api/ready` 执行 DB/Redis 依赖检查
- **WebSocket**: `/ws/ai` AI 流式输出

## 测试覆盖

| 类型 | 数量 | 工具 |
|------|------|------|
| 后端单测 | 357+ | Node.js test |
| 前端单测 | 22+ | Vitest |
| E2E 测试 | 89+ | Playwright |
| API 契约 | 62+ | 自定义 |

## 版本历史

- **v0.1.3-dev** (2025-12-30): 文档完善、API 文档更新
- **v0.1.2-dev** (2025-12-30): 八字重复检测、历史搜索过滤、OAuth/密码重置、代码质量改进
- **v0.1.1** (2025-12-27): 生产就绪增强 (健康检查, Redis, Bundle 分析)
- **v0.1.0** (2025-12-26): 初始发布
