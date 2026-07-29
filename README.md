# BaZi Master · 八字排盘与多模态玄学全栈示例 / Open-Source Divination Web App

[![Release](https://img.shields.io/github/v/release/tytsxai/bazi-master)](https://github.com/tytsxai/bazi-master/releases) · [English README](README.en.md) · [llms.txt](llms.txt) · [API Docs](docs/api.md) · [Architecture](docs/architecture.md) · [Changelog](CHANGELOG.md) · [Issues](https://github.com/tytsxai/bazi-master/issues)

BaZi Master 是一个开源全栈参考项目，用 React + Express + Prisma 实现八字排盘（BaZi chart）、塔罗抽牌（Tarot draw）、周易起卦（I Ching divination）、星座与上升星座（Zodiac / Ascendant）、紫微斗数排盘（Zi Wei Dou Shu）、合盘分析（Synastry）和 AI 解读工作流。它适合被 fork、自部署、二次开发或作为命理/占星/娱乐向 AI 应用的工程样板。

English summary: **BaZi Master is an open-source full-stack divination web app starter** for developers who want to study, fork, self-host, or extend a multi-feature astrology / metaphysics application. It combines a React 18 + Vite frontend, Node.js / Express API, Prisma ORM, PostgreSQL, optional Redis, OAuth, history records, favorites, OpenAPI docs, and AI provider integration.

> 关键词 / Keywords: 八字排盘开源, BaZi chart open source, 紫微斗数排盘, Zi Wei Dou Shu chart, 塔罗抽牌 API, Tarot draw API, 周易起卦 API, I Ching divination API, 星座配对, astrology compatibility, 合盘分析 Synastry, React Vite Tailwind, Express Prisma PostgreSQL, AI fortune telling app starter, full-stack divination web app.

**目录**：[项目定位](#项目定位--project-snapshot) · [核心功能](#核心功能--core-features) · [快速开始](#快速开始--quick-start) · [API 示例](#api-使用示例--usage-examples) · [适用场景](#适用场景--use-cases) · [技术栈](#技术栈--tech-stack) · [环境变量](#环境变量--configuration) · [FAQ](#faq--常见问题) · [项目结构](#项目结构--repository-structure) · [测试](#测试--testing) · [生产部署](#部署与生产注意事项--production-notes) · [限制](#限制与免责声明--limitations)

## 项目定位 / Project Snapshot

| 维度         | 说明                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------- |
| 项目类型     | 开源全栈玄学 / 占星 / 命理 Web 应用参考实现，不是托管 SaaS 服务                                     |
| 解决问题     | 为八字、塔罗、周易、星座、紫微、AI 解读、登录、历史记录、收藏和部署提供可运行代码骨架               |
| 适合谁       | 想学习或二次开发命理/占星类应用的前端、全栈、AI 应用开发者，以及需要自部署参考架构的团队            |
| 技术栈       | React 18, Vite, Tailwind CSS, Express 4, Node.js 20+, Prisma, PostgreSQL, Redis, Playwright, Vitest |
| 默认本地依赖 | 当前 Prisma schema 使用 PostgreSQL；`docker-compose.yml` 提供本地 PostgreSQL + Redis                |
| AI 能力      | 支持 mock / OpenAI / Anthropic 文本解读；Soul Portrait 图片生成当前通过 OpenAI 或 mock 占位         |
| 多语言       | 前端内置 5 种界面语言：`en-US`、`zh-CN`、`zh-TW`、`ja`、`ko`（`frontend/src/i18n/locales`）         |
| 开发入口     | 仓库根 `./bazi` 程序化 CLI：环境准备、起停本地栈、迁移、测试、端到端校验，全部支持 `--json`         |
| 主要入口     | 前端页面在 `frontend/src/pages`；API 路由在 `backend/routes`；数据模型在 `prisma/schema.prisma`     |
| 许可证       | MIT，可自由 fork、修改、自部署和商用（需自行承担合规与免责声明）                                    |
| 重要限制     | 输出仅适合娱乐、文化研究或产品原型验证；不要当作医疗、法律、投资、人生决策建议                      |

### 这不是什么 / What it is not

- 不是托管的在线算命服务，仓库不提供任何线上实例。
- 不是一个纯 npm 八字算法库；八字计算是应用内部的一个 service，不是独立发布的包。
- 不是对命理、占星准确性的科学背书。
- 不是开箱即用的商业合规方案（应用商店、微信、支付、广告和各地法规需自行处理）。

## 核心功能 / Core Features

- **八字排盘 BaZi charting**：基于出生年月日时生成四柱、五行、十神、大运，并支持真太阳时元数据、缓存和重复记录检测。
- **AI 八字解读 AI interpretation**：登录后可请求八字解读或完整分析；未配置真实密钥时使用 mock provider。
- **塔罗 Tarot**：支持单张牌、三张牌、凯尔特十字牌阵，提供公开抽牌接口和登录后的 AI 解读/历史记录。
- **周易 I Ching**：支持数字起卦与时间起卦，包含 64 卦数据、变爻和 AI 解读入口。
- **星座 Zodiac / Astrology**：提供星座基础信息、每日运势、上升星座计算和星座配对。
- **紫微斗数 Zi Wei Dou Shu**：登录后可排盘、保存历史，并展示十二宫、主星、辅星和四化信息。
- **合盘 Synastry**：提供两组出生信息的基础合盘分析。
- **用户系统 User flows**：邮箱注册/登录、会话 token、cookie、Google / WeChat OAuth、密码重置、自助删除账号。
- **记录与收藏 History / Favorites**：八字、塔罗、周易、紫微历史记录，客户端搜索过滤、批量操作、收藏与快照。
- **多语言 i18n**：前端基于 react-i18next 内置 `en-US` / `zh-CN` / `zh-TW` / `ja` / `ko` 五套文案，并按浏览器语言自动匹配。
- **运维基础 Operations**：`/live`、`/health`、`/api/ready`、管理员健康检查、Pino JSON 日志、OpenAPI / Swagger UI、WebSocket AI 流式输出 `/ws/ai`。
- **程序化 CLI**：`./bazi` 把环境准备、本地栈生命周期、数据库迁移、测试和端到端校验收敛成一套命令，全部支持 `--json` 和约定退出码，方便脚本与 AI Agent 调用。

## 快速开始 / Quick Start

前置要求：Node.js 20+、npm、Docker（用于本地 PostgreSQL / Redis）。

关于环境变量：后端进程本身不引入 dotenv，`node server.js` 只读取真实环境变量。用 `./bazi` 启动时，CLI 会读取仓库根的 `.env` 并注入子进程（真实 `process.env` 优先级更高）。手动启动或生产部署时，需要由 shell、进程管理器或部署平台注入。

### 用 `./bazi`（推荐）

仓库根有一个 CLI，把环境准备、起停本地栈、迁移、测试都收敛成了一条链路，
比手敲下面那串命令更不容易出错：

```bash
git clone https://github.com/tytsxai/bazi-master.git
cd bazi-master

./bazi setup --with-frontend   # 装依赖 + 生成 .env + 生成 Prisma Client
./bazi doctor                  # 体检环境，每项失败都带可执行的修复命令
./bazi stack up                # 起 db + api + web
./bazi test                    # 跑测试
```

所有命令都支持 `--json`，退出码有明确约定，方便脚本和 agent 调用。
完整能力清单：`./bazi help --json`。

### 手动步骤

```bash
git clone https://github.com/tytsxai/bazi-master.git
cd bazi-master

# 安装根依赖、后端依赖、前端依赖
npm install
npm -C backend install
npm -C frontend install

# 启动本地 PostgreSQL + Redis
docker compose up -d postgres redis

# 应用数据库迁移；脚本默认使用本地 PostgreSQL:
# postgresql://postgres:postgres@localhost:5432/bazi_master?schema=public
npm -C backend run prisma:migrate:deploy

# 启动后端 API: http://127.0.0.1:4000
NODE_ENV=development npm -C backend run dev

# 另开终端启动前端: http://localhost:3000
npm -C frontend run dev
```

说明：`npm -C frontend run dev` 使用项目内置 dev server，会代理 `/api` 和 `/ws`，并在后端未运行时尝试启动后端；如果你希望分别观察前后端日志，可以按上面的方式先显式启动后端。

常用检查：

```bash
curl http://127.0.0.1:4000/live
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:4000/api/ready
curl http://127.0.0.1:4000/api/ai/providers
```

## API 使用示例 / Usage Examples

公开八字计算接口：

```bash
curl -X POST http://127.0.0.1:4000/api/bazi/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "birthYear": 1990,
    "birthMonth": 1,
    "birthDay": 1,
    "birthHour": 8,
    "gender": "male",
    "birthLocation": "beijing",
    "timezone": "Asia/Shanghai"
  }'
```

公开塔罗抽牌接口：

```bash
curl -X POST http://127.0.0.1:4000/api/tarot/draw \
  -H "Content-Type: application/json" \
  -d '{ "spreadType": "ThreeCard" }'
```

更多接口请参考 [docs/api.md](docs/api.md)。启动后也可以访问：

- Swagger UI: `http://127.0.0.1:4000/api-docs`
- OpenAPI JSON: `http://127.0.0.1:4000/api-docs.json`

## 适用场景 / Use Cases

- 学习如何把八字排盘、塔罗、周易、星座、紫微等模块组合成一个完整 React Web App。
- 构建命理、占星、娱乐向 AI 应用的自部署原型或二次开发基础。
- 参考 Express + Prisma + PostgreSQL + Redis 的登录、历史记录、收藏、健康检查和 OpenAPI 文档组织方式。
- 验证 AI 解读、WebSocket 流式输出、OAuth、密码重置、账号删除等产品路径。
- 作为 AI 搜索引擎、代码助手和开发者理解“divination app starter / astrology app starter”的结构化示例。

## 技术栈 / Tech Stack

- **Frontend**: React 18, Vite, React Router v6, Tailwind CSS, react-i18next, react-helmet-async
- **Backend**: Node.js 20+, Express 4, Prisma ORM, Pino, Swagger UI, WebSocket (`ws`)
- **Database**: PostgreSQL via Prisma schema (`prisma/schema.prisma`)
- **Cache / Session**: Redis optional in local development, required for production-like multi-instance consistency
- **AI Providers**: mock, OpenAI, Anthropic; OpenAI image generation for Soul Portrait
- **Testing**: Node.js test runner, Supertest, Vitest, Playwright
- **Observability**: JSON request logs, request ID, health/readiness endpoints, optional Sentry

## 环境变量 / Configuration

本地开发可参考 [.env.example](.env.example)，生产部署可参考 [env.production.template](env.production.template)。`./bazi setup` 会基于模板生成 `.env`，`./bazi env` 可以查看、校验和改键。应用进程本身不读 dotenv，详见[快速开始](#快速开始--quick-start)里的说明。

关键配置：

- `DATABASE_URL`: PostgreSQL 连接串，例如 `postgresql://postgres:postgres@127.0.0.1:5432/bazi_master?schema=public`
- `SESSION_TOKEN_SECRET`: 生产必须设置为 32+ 字符随机串
- `FRONTEND_URL` / `BACKEND_BASE_URL`: CORS、OAuth 回调和 OpenAPI base URL
- `REDIS_URL`: 本地可选；生产和多实例部署必须配置
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`: 可选；未配置真实密钥时 `AI_PROVIDER=mock`
- `SMTP_HOST` / `SMTP_FROM`: 启用密码重置时需要配置
- `ADMIN_EMAILS`: 管理员健康检查白名单
- `DOCS_USER` / `DOCS_PASSWORD`: 生产环境保护 `/api-docs`
- `TRUST_PROXY`: 有反向代理时设置成**跳数**（一层 nginx 就填 `1`）。填 `true` 表示
  信任所有代理，此时 `X-Forwarded-For` 完全由客户端控制，限流可被一个请求头绕过
- `SENTRY_DSN` / `VITE_SENTRY_DSN`: 可选错误与性能监控

## FAQ / 常见问题

### 这是八字算法库还是完整应用？

它是完整全栈 Web 应用参考实现，不是单独的 npm 八字算法库。八字计算逻辑在 `backend/services/calculations.service.js`，HTTP 入口在 `POST /api/bazi/calculate`，前端交互在 `frontend/src/pages/Bazi.jsx` 与 `frontend/src/components/bazi/`。

### 没有 AI API Key 能运行吗？

可以。未配置 `OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY` 时，文本解读默认使用 `mock` provider；Soul Portrait 图片接口会返回 mock 占位图。接入真实模型前，请在本地和生产环境分别验证密钥、超时、速率限制和成本。

### 当前默认数据库是什么？

当前 `prisma/schema.prisma` 使用 PostgreSQL。`docker-compose.yml` 提供本地 PostgreSQL 和 Redis；后端在开发/测试环境缺少 `DATABASE_URL` 时也会回落到本地 PostgreSQL 默认连接串。

### 可以直接生产上线吗？

可以作为生产化起点，但不是免配置商业 SaaS。生产需要自行配置 PostgreSQL、Redis、HTTPS、强随机 `SESSION_TOKEN_SECRET`、SMTP、OAuth、备份、监控、反向代理和合规策略。上线前请先跑通 [PRODUCTION.md](PRODUCTION.md) 与 [docs/production-ready.md](docs/production-ready.md)。

### 哪些接口不需要登录？

八字计算、塔罗抽牌、周易起卦、星座信息、上升星座、星座配对、合盘分析和位置搜索是公开接口；AI 解读、历史记录、收藏、紫微记录、灵魂画像、用户设置和管理端接口需要登录或管理员权限。完整清单见 [docs/api.md](docs/api.md)。

### 支持哪些界面语言？

前端内置 `en-US`、`zh-CN`、`zh-TW`、`ja`、`ko` 五套文案，位于 `frontend/src/i18n/locales`，默认按浏览器语言匹配，`zh-TW` 会依次回退到 `zh-CN` 和 `en-US`。新增语言只需添加 locale JSON 并在 `frontend/src/i18n/index.js` 注册。

### 许可证是什么？可以商用吗？

MIT 许可证，允许 fork、修改、闭源分发和商业使用。但命理/占星内容的合规声明、免责声明、数据保护和平台审核责任由部署者自行承担，详见[限制与免责声明](#限制与免责声明--limitations)。

### 为什么要用 `./bazi` 而不是直接 npm script？

`./bazi` 会记录本地栈的进程状态，手动 `node server.js` 起的进程它管不到、之后也停不掉。CLI 还负责生成 `.env`、检查端口/数据库/Prisma Client 就绪状态，并在失败时给出可直接执行的修复命令。全部命令见 `./bazi help --json`。

## 项目结构 / Repository Structure

```text
bazi-master/
├── backend/                 # Express API, routes, services, middleware, tests
│   ├── routes/              # /api/auth, /api/bazi, /api/tarot, /api/iching, ...
│   ├── services/            # calculation, AI, tarot, iching, zodiac, ziwei, health
│   ├── middleware/          # auth, CORS, rate limit, validation, error handling
│   └── test/                # backend Node.js tests
├── frontend/                # React + Vite web application
│   ├── src/pages/           # Home, Bazi, Tarot, Iching, Zodiac, Ziwei, Profile
│   ├── src/components/      # feature components and shared UI
│   ├── src/i18n/locales/    # en-US, zh-CN, zh-TW, ja, ko
│   └── tests/               # Playwright E2E tests
├── prisma/                  # Prisma schema and migrations
├── tools/cli/               # ./bazi programmatic CLI (setup/doctor/stack/db/test/verify)
├── docs/                    # API, architecture, development, production docs
├── docker/                  # PostgreSQL init scripts
├── bazi                     # CLI entry point
├── docker-compose.yml       # local PostgreSQL + Redis
├── llms.txt                 # AI-search friendly project summary
└── PRODUCTION.md            # production deployment notes
```

## 测试 / Testing

```bash
# 用 CLI 跑快集合（lint + typecheck + unit + backend，隔离临时库，不碰开发库）
./bazi test

# 包含 Playwright E2E 在内全部跑一遍
./bazi test --all

# 后端测试；脚本会在未提供 DATABASE_URL 时准备本地测试 PostgreSQL
npm -C backend test

# 前端单元测试
npm -C frontend run test:unit:run

# 前端 Playwright E2E；需要浏览器依赖
npm -C frontend test

# 根目录组合测试
npm test

# 前端构建体积分析
npm -C frontend run analyze
```

> 测试结果依赖本地 Node、Docker、浏览器和数据库状态。若 E2E 失败，先确认后端、数据库和 Playwright 浏览器依赖是否就绪。

## 部署与生产注意事项 / Production Notes

- 生产请使用 PostgreSQL、Redis、HTTPS 反向代理和强随机 `SESSION_TOKEN_SECRET`。
- 多实例部署需要 Redis 保存会话、OAuth state、密码重置 token 和八字缓存镜像。
- 生产启动前会校验关键配置；`DATABASE_URL`、`REDIS_URL`、`SESSION_TOKEN_SECRET` 等缺失会阻止启动。
- `/api-docs` 在生产环境建议配置 `DOCS_PASSWORD` 保护。
- 发布前请阅读 [PRODUCTION.md](PRODUCTION.md)、[docs/production-ready.md](docs/production-ready.md) 和 [docs/production-runbook.md](docs/production-runbook.md)。

## 限制与免责声明 / Limitations

- 本项目是参考实现，不提供托管服务、不保证占卜或命理准确性。
- 八字、紫微、塔罗、周易和星座输出适合娱乐、文化研究、产品原型与代码学习，不应作为专业建议。
- AI 解读依赖外部模型质量、密钥、速率限制和提示词；mock provider 仅用于开发和演示。
- OAuth、SMTP、Sentry、反向代理、域名、证书和平台合规需要部署者自行配置与验证。
- 当前重点是全栈功能闭环与工程参考，不等同于完整商业化命理平台。

## 文档 / Documentation

- [docs/api.md](docs/api.md): HTTP API overview（全部路由、鉴权要求、请求/响应字段）
- [docs/architecture.md](docs/architecture.md): system architecture and module map
- [docs/development.md](docs/development.md): local development guide
- [docs/faq.md](docs/faq.md): project FAQ for developers and AI search engines
- [docs/backend-reliability.md](docs/backend-reliability.md): 后端可靠性、超时、重试与降级策略
- [docs/production-ready.md](docs/production-ready.md): production readiness checklist
- [docs/production-runbook.md](docs/production-runbook.md): 上线、排障与回滚 runbook
- [docs/monitoring-guide.md](docs/monitoring-guide.md): monitoring and observability notes
- [docs/performance-audit.md](docs/performance-audit.md): 前后端性能实测与优化记录
- [PRODUCTION.md](PRODUCTION.md): 生产部署总览
- [CHANGELOG.md](CHANGELOG.md): 版本变更记录
- [llms.txt](llms.txt): structured summary for AI search engines and coding agents

## GitHub Topics 建议

`bazi`, `bazi-chart`, `ziwei`, `ziwei-doushu`, `tarot`, `iching`, `astrology`, `synastry`, `divination`, `fortune-telling`, `metaphysics`, `react`, `vite`, `tailwindcss`, `express`, `prisma`, `postgresql`, `redis`, `openapi`, `ai-app`, `self-hosted`

## License

MIT License. See [LICENSE](LICENSE).

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=tytsxai/bazi-master&type=Date)](https://www.star-history.com/#tytsxai/bazi-master&Date)
