# BaZi Master

一个融合八字、塔罗、周易、星座、紫微的全栈示例项目，前后端均为开源示例代码，默认使用 SQLite 数据库，生产推荐 PostgreSQL + Redis。

English summary: BaZi Master is a sample full‑stack divination app (React + Express + Prisma). Default DB is SQLite; production targets PostgreSQL + Redis.

## 功能特性
- 八字排盘与缓存（公开计算，登录后可保存记录/AI 解读）
- 塔罗抽牌与 AI 解读（公开抽牌，登录后可解读/保存历史）
- 周易起卦（基于数字或时间）与 AI 解读
- 星座基础信息、运势、上升星座计算、星座配对
- 紫微斗数排盘与历史保存
- 认证：邮箱注册/登录、会话 Token、注销、自助删除账号
- 健康检查：`/health` 与 `/api/ready`

## 技术栈
- 前端：React 18、Vite、React Router v6、react‑i18next、Tailwind CSS（配置在 `frontend/`）
- 后端：Node.js 18+、Express 4、Prisma ORM、Pino 日志
- 数据库：SQLite（开发缺省）/ PostgreSQL（生产推荐）
- 缓存与会话：可选 Redis（未配置时自动回退内存）
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

> 提示：项目未内置 dotenv 自动加载；请通过环境变量或复制 `.env.example` 后手动导出变量。

## 环境变量（节选）
复制 `.env.example` 为本地或生产配置并按需修改：

- `DATABASE_URL`：缺省为 `file:./prisma/dev.db`（SQLite）；生产请设置 PostgreSQL 连接串。
- `SESSION_TOKEN_SECRET`：生产必须设置为 32+ 字符随机串。
- `FRONTEND_URL` / `BACKEND_BASE_URL`：用于 CORS 与回调。
- `REDIS_URL`：可选；配置后会话与缓存使用 Redis。
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`：可选；未提供时 AI provider 默认为 `mock`。
- `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`：生产建议启用速率限制。

## 测试
```bash
# 后端测试（Node.js test） - Current Pass Rate: 100% (95/95 tests)
npm -C backend test

# 前端单元测试（Vitest）
npm -C frontend run test:unit

# 前端 E2E（Playwright，会自动拉起 dev server；需浏览器依赖）
npm -C frontend test

# 组合执行
npm test
```

### 测试通过率
- **后端测试**: 95/95 通过 (100%)，16个测试套件，涵盖认证、八字计算、缓存、API路由等核心功能
- **前端单元测试**: 22个测试用例，涵盖核心React组件(AuthContext、ProtectedRoute、BaziForm、HistoryList)
- **前端E2E测试**: 93个测试用例，涵盖可访问性、安全性、功能完整性、性能等多个维度

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
│   ├── test/           # 后端测试 (95个单元测试 + 19个API契约测试)
├── frontend/           # React 应用
│   ├── src/            # 页面、组件、hooks、i18n
│   │   ├── auth/       # 认证上下文
│   │   ├── components/ # React组件 (AuthContext/ProtectedRoute/BaziForm/HistoryList等)
│   │   ├── test/       # 单元测试设置
│   │   └── auth/__tests__/ # 组件单元测试 (22个测试)
│   └── tests/          # Playwright E2E测试 (93个测试用例)
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
- **契约测试**: 19个API契约测试确保文档与实现的一致性

## 部署
- 参考 `PRODUCTION.md` 获取基于 Docker Compose 的生产示例。
- 生产务必使用 PostgreSQL、配置 `SESSION_TOKEN_SECRET`，并启用 HTTPS 反向代理。

## 许可证
本项目采用 MIT 许可证。详情请参阅 `LICENSE` 文件。
