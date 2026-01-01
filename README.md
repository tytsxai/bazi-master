# BaZi Master

> 版本: v0.1.3-dev | 更新: 2025-12-30

一个融合八字、塔罗、周易、星座、紫微的全栈示例项目，前后端均为开源示例代码，默认使用 SQLite 数据库，生产推荐 PostgreSQL + Redis。

English summary: BaZi Master is a sample full‑stack divination app (React + Express + Prisma). Default DB is SQLite; production targets PostgreSQL + Redis.

## 功能特性

- 八字排盘与缓存（公开计算，登录后可保存记录/AI 解读）
- 八字重复记录检测（保存时自动检测避免冗余）
- 塔罗抽牌与 AI 解读（公开抽牌，登录后可解读/保存历史）
- 周易起卦（基于数字或时间）与 AI 解读
- 星座基础信息、运势、上升星座计算、星座配对
- 紫微斗数排盘与历史保存
- 合盘分析（Synastry）
- 每日运势（日历接口，支持传入生日做个性化评分）
- 灵魂画像生成（Soul Portrait，AI 图片）
- 历史记录管理（客户端搜索过滤、批量操作）
- 收藏与历史快照
- 认证：邮箱注册/登录、会话 Token、注销、自助删除账号
- 认证增强：密码重置、Google/WeChat OAuth 登录
- 用户设置（语言/偏好）
- 健康检查：`/health` 与 `/api/ready`
- 管理端健康检查：`/api/admin/health`（管理员）
- WebSocket AI 流式输出：`/ws/ai`

## 技术栈

- 前端：React 18、Vite、React Router v6、react‑i18next、Tailwind CSS（配置在 `frontend/`）
- 后端：Node.js 20+、Express 4、Prisma ORM、Pino 日志
- 数据库：SQLite（开发缺省）/ PostgreSQL（生产推荐）
- 缓存与会话：可选 Redis（会话/八字缓存/OAuth state/密码重置使用镜像；未配置时回退内存）
- 测试：Node.js test（后端单测在 `backend/test`），Playwright（前端 E2E 在 `frontend/tests`）

## 快速开始（开发）

```bash
# 克隆仓库
git clone <repository-url>
cd bazi-master

# 安装根依赖（Prisma 客户端）
npm install

# 安装后端依赖并生成 Prisma Client
npm -C backend install
npm -C backend run prisma:generate

# 安装前端依赖
npm -C frontend install

# 可选：启动 PostgreSQL + Redis（Docker）
docker compose up -d postgres redis

# 运行开发后端（监听 4000）
NODE_ENV=development npm -C backend run dev

# 运行开发前端（监听 3000，dev-server 会自动代理 API）
npm -C frontend run dev
```

> 提示：项目未内置 dotenv 自动加载；请通过环境变量或复制 `.env.example` (开发) 以及 `env.production.template`/`.env.production.example` (生产) 后手动导出变量。

## 环境变量（节选）

复制 `.env.example` 为本地配置；生产请用 `env.production.template` 或 `.env.production.example` 生成 `.env.production` 并按需修改：

- `DATABASE_URL`：缺省为 `file:./prisma/dev.db`（SQLite）；生产请设置 PostgreSQL 连接串。
- `SESSION_TOKEN_SECRET`：生产必须设置为 32+ 字符随机串。
- `FRONTEND_URL` / `BACKEND_BASE_URL`：用于 CORS 与回调。
- `REDIS_URL`：可选；配置后会话、八字缓存、OAuth state、密码重置使用 Redis 镜像。
- `SMTP_HOST` / `SMTP_FROM`：生产密码重置必填（SMTP 发送重置码）。
- `PASSWORD_RESET_ENABLED`：可关闭密码重置（生产建议开启并配置 SMTP）。
- `SESSION_COOKIE_SAMESITE` / `SESSION_COOKIE_DOMAIN` / `SESSION_COOKIE_SECURE`：跨站部署需设置 `SameSite=None` 并启用 `Secure`。
- `TRUST_PROXY`：有反向代理时必须配置（影响限流与客户端 IP）。
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`：可选；未提供时 AI provider 默认为 `mock`。
- `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`：生产建议启用速率限制。
- `SENTRY_DSN` / `VITE_SENTRY_DSN`：可选；后端/前端错误与性能监控上报。
- `DOCS_USER` / `DOCS_PASSWORD`：生产环境访问 `/api-docs` 的 Basic Auth。
- `ALLOW_DEV_OAUTH`：非生产默认允许开发 OAuth 直登；生产建议显式关闭。
- `RUN_MIGRATIONS_ON_START`：生产启动时是否自动执行迁移；多实例部署建议设为 `false` 并在部署流程中单独执行。
- `SERVER_KEEP_ALIVE_TIMEOUT_MS` / `SERVER_HEADERS_TIMEOUT_MS` / `SERVER_REQUEST_TIMEOUT_MS`：可选；控制慢连接超时。

## 测试

```bash
# 后端测试（Node.js test）
npm -C backend test

# 前端单元测试（Vitest）
npm -C frontend run test:unit

# 前端 E2E（Playwright，会自动拉起 dev server；需浏览器依赖）
npm -C frontend test

# 组合执行
npm test

# 分析前端构建体积
npm -C frontend run analyze
```

> 前端包含一个 AssemblyScript WebAssembly 示例模块；`npm -C frontend run dev/build` 会自动执行 `asbuild` 并同步 `build/optimized.wasm` 到 `public/wasm/optimized.wasm`。

### 测试覆盖范围

- **后端测试**：覆盖认证、八字计算、缓存、API 路由等核心功能
- **前端单元测试**：覆盖 AuthContext、ProtectedRoute、BaziForm、HistoryList 等核心组件
- **前端 E2E**：覆盖可访问性、安全性、功能完整性、性能等多个维度

> 运行结果依赖本地环境与服务（Postgres/Redis）；请先准备依赖。

## 项目结构

```
bazi-master/
├── backend/            # Express + Prisma 服务
│   ├── routes/         # API 路由
│   ├── services/       # 业务逻辑 (*.service.js)
│   ├── middleware/     # 中间件
│   ├── config/         # 配置与客户端初始化
│   ├── utils/          # 工具函数
│   ├── test/           # 后端测试（Node.js test + API契约测试）
├── frontend/           # React 应用
│   ├── src/            # 页面、组件、hooks、i18n
│   │   ├── auth/       # 认证上下文
│   │   ├── components/ # React组件 (AuthContext/ProtectedRoute/BaziForm/HistoryList等)
│   │   ├── test/       # 单元测试设置
│   │   └── auth/__tests__/ # 组件单元测试
│   └── tests/          # Playwright E2E 测试
├── prisma/             # Prisma schema & migrations
├── docs/               # 架构/开发/部署/API/性能 文档
├── docker/             # Docker 初始化脚本
├── docker-compose.yml  # 开发/测试服务编排
├── PRODUCTION.md       # 生产部署指南
├── env.production.template # 生产环境变量模板
└── LICENSE             # MIT许可证
```

## API 文档

- **Swagger UI**: 启动服务后访问 `/api-docs` 查看交互式API文档
- **OpenAPI Spec**: `/api-docs.json` 提供完整的OpenAPI 3.0规范
- **覆盖范围**: 包含认证、健康检查、八字计算、记录管理、收藏功能等所有API端点
- **契约测试**: 62个API契约测试确保文档与实现的一致性
- **生产访问**: 生产环境需配置 `DOCS_PASSWORD`（可选 `DOCS_USER`）开启 Basic Auth

## 部署

- 参考 `PRODUCTION.md` 获取基于 Docker Compose 的生产示例。
- 生产务必使用 PostgreSQL、配置 `SESSION_TOKEN_SECRET`，并启用 HTTPS 反向代理。

## 许可证

本项目采用 MIT 许可证。详情请参阅 `LICENSE` 文件。
