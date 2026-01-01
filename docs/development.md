# BaZi Master - 开发指南

> 版本: v0.1.3-dev | 更新: 2025-12-30

## 前置要求

- Node.js >= 18
- npm >= 9
- 可选：Docker（PostgreSQL/Redis 本地服务）

## 环境变量

- 开发模板：`.env.example`（默认 SQLite）
- 生产模板：`env.production.template`（完整项）或 `.env.production.example`（精简项）
- 项目未自动加载 `.env`，请在 shell 中导出或使用进程管理器注入。
- 生产请改用 PostgreSQL 连接串，并设置 `SESSION_TOKEN_SECRET`（32+ 字符）。

## 安装与运行

```bash
# 根依赖（Prisma Client）
npm install

# 后端
npm -C backend install
npm -C backend run prisma:generate
NODE_ENV=development npm -C backend run dev   # http://localhost:4000

# （可选）启动 Postgres + Redis
docker compose up -d postgres redis

# 前端
npm -C frontend install
npm -C frontend run dev                      # http://localhost:3000
```

## 测试

```bash
npm -C backend test       # 后端 Node.js test
npm -C frontend test:unit # 前端 Vitest 单元测试
npm -C frontend test      # 前端 Playwright E2E
npm test                 # 组合执行
```

> 若前端 E2E 依赖真实后端/数据库，请确保相关服务已启动且数据可用。

## 常用脚本

- `npm -C backend run prisma:migrate:deploy` — 应用迁移
- `npm -C backend run prisma:generate` — 生成 Prisma Client
- `npm -C frontend run build` — 前端打包
- `npm -C frontend run preview` — 静态预览

## 代码结构提示

- 业务逻辑集中在 `backend/services/*.service.js`
- API 路由在 `backend/routes/*`
- 会话/鉴权逻辑在 `backend/middleware/auth.js`
- 前端路由与页面在 `frontend/src/App.tsx` 与 `frontend/src/pages/*`
- 多语言资源在 `frontend/src/i18n/locales`

## 代码质量

项目根目录配置了统一的 ESLint 和 Prettier：

```bash
# 检查代码风格
npm run lint

# 格式化代码
npm run format
```

## 开发约定

- 默认 CORS 允许 `FRONTEND_URL`；如需跨域，请在环境变量中增加 `CORS_ALLOWED_ORIGINS`
- 未配置 Redis 时会话存内存，调试 OK，生产需 Redis
- AI Provider 根据密钥自动选择；无密钥时为 `mock`

## 调试小贴士

- 健康检查：`curl http://localhost:4000/health`
- 就绪检查：`curl http://localhost:4000/api/ready`
- Prisma Studio：`npm -C backend exec npx prisma studio --schema=../prisma/schema.prisma`

## 贡献

- 遵循现有代码风格与目录划分
- 变更需附带测试或说明
- 修改/新增 API 时同步更新 `docs/api.md`

## 常见问题

### 数据库迁移失败

```bash
# 重置开发数据库
rm -f backend/prisma/dev.db
npm -C backend run prisma:migrate:deploy
```

### Redis 连接问题

开发环境可不配置 Redis，会话和缓存将使用内存存储。生产环境必须配置 `REDIS_URL`。

### AI 功能不可用

检查 `OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY` 是否配置。未配置时 AI provider 为 `mock`，返回模拟数据。
