# BaZi Master · 八字与多模态玄学计算引擎 / Open-Source Divination Calculation API

[![Release](https://img.shields.io/github/v/release/tytsxai/bazi-master)](https://github.com/tytsxai/bazi-master/releases) · [English README](README.en.md) · [llms.txt](llms.txt) · [API Docs](docs/api.md) · [Architecture](docs/architecture.md) · [Changelog](CHANGELOG.md) · [Issues](https://github.com/tytsxai/bazi-master/issues)

BaZi Master 是一个开源的玄学计算引擎，把八字排盘（BaZi chart）、塔罗抽牌（Tarot draw）、周易起卦（I Ching divination）、星座与上升星座（Zodiac / Ascendant）、紫微斗数排盘（Zi Wei Dou Shu）、合盘分析（Synastry）和 AI 解读工作流，收敛成一套文档化的 HTTP API。它是专业工具，不是网页应用：既可以被你自己的 Web/App 前端调用去服务 C 端用户，也可以直接作为智能体（AI agent）的专业计算能力接入。

English summary: **BaZi Master is an open-source divination calculation engine** exposed as a documented HTTP API. It ships no UI of its own — you consume it from your own client, or wire it into an AI agent as a tool. Node.js / Express, Prisma ORM, PostgreSQL, optional Redis, OAuth, history records, favorites, OpenAPI docs, and pluggable AI providers.

> 关键词 / Keywords: 八字排盘 API, BaZi chart API, 紫微斗数排盘, Zi Wei Dou Shu chart, 塔罗抽牌 API, Tarot draw API, 周易起卦 API, I Ching divination API, 星座配对, astrology compatibility, 合盘分析 Synastry, Express Prisma PostgreSQL, calculation engine, agent tools, AI fortune telling backend.

**目录**：[项目定位](#项目定位--project-snapshot) · [核心功能](#核心功能--core-features) · [快速开始](#快速开始--quick-start) · [API 示例](#api-使用示例--usage-examples) · [适用场景](#适用场景--use-cases) · [技术栈](#技术栈--tech-stack) · [环境变量](#环境变量--configuration) · [FAQ](#faq--常见问题) · [项目结构](#项目结构--repository-structure) · [测试](#测试--testing) · [生产部署](#部署与生产注意事项--production-notes) · [限制](#限制与免责声明--limitations)

## 项目定位 / Project Snapshot

| 维度         | 说明                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------- |
| 项目类型     | 开源玄学 / 占星 / 命理计算引擎，以自部署 HTTP API 形式交付，不是托管 SaaS，也不含前端界面     |
| 解决问题     | 为八字、塔罗、周易、星座、紫微、AI 解读、鉴权、历史记录、收藏和部署提供可运行的能力层         |
| 适合谁       | 要给自己的产品接入命理/占星计算的后端与全栈开发者，以及要为智能体接一个专业计算工具的团队     |
| 消费方式     | 直接调 HTTP API；或作为 agent tool 接入；也可以自己写任意前端（Web/小程序/App）去调它         |
| 技术栈       | Node.js 20+, Express 4, Prisma, PostgreSQL, Redis, Node.js test runner                        |
| 默认本地依赖 | 当前 Prisma schema 使用 PostgreSQL；`docker-compose.yml` 提供本地 PostgreSQL + Redis          |
| AI 能力      | 支持 mock / OpenAI / Anthropic 文本解读；Soul Portrait 图片生成当前通过 OpenAI 或 mock 占位   |
| 开发入口     | 仓库根 `./bazi` 程序化 CLI：环境准备、起停本地栈、迁移、测试、端到端校验，全部支持 `--json`   |
| 主要入口     | API 路由在 `backend/routes`；计算逻辑在 `backend/services`；数据模型在 `prisma/schema.prisma` |
| 接口契约     | OpenAPI 描述在 [docs/openapi.json](docs/openapi.json)，运行时挂在 `/api-docs`                 |
| 许可证       | MIT，可自由 fork、修改、自部署和商用（需自行承担合规与免责声明）                              |
| 重要限制     | 输出仅适合娱乐、文化研究或产品原型验证；不要当作医疗、法律、投资、人生决策建议                |

### 这不是什么 / What it is not

- 不是网页应用，仓库不含任何前端代码，也不提供线上实例。界面由你自己实现。
- 不是托管的在线算命服务。
- 不是一个纯 npm 八字算法库；计算逻辑是服务内部的 service，通过 HTTP 暴露，不单独发包。
- 不是对命理、占星准确性的科学背书。
- 不是开箱即用的商业合规方案（应用商店、微信、支付、广告和各地法规需自行处理）。

## 核心功能 / Core Features

- **八字排盘 BaZi charting**：基于出生年月日时生成四柱、五行、十神、大运，并支持真太阳时元数据、缓存和重复记录检测。
- **AI 八字解读 AI interpretation**：登录后可请求八字解读或完整分析；未配置真实密钥时使用 mock provider。
- **塔罗 Tarot**：支持单张牌、三张牌、凯尔特十字牌阵，提供公开抽牌接口和登录后的 AI 解读/历史记录。
- **周易 I Ching**：支持数字起卦与时间起卦，包含 64 卦数据、变爻和 AI 解读入口。
- **星座 Zodiac / Astrology**：提供星座基础信息、每日运势、上升星座计算和星座配对。
- **紫微斗数 Zi Wei Dou Shu**：登录后可排盘、保存历史，并返回十二宫、主星、辅星和四化信息。
- **合盘 Synastry**：提供两组出生信息的基础合盘分析。
- **用户系统 User flows**：邮箱注册/登录、会话 token、cookie、Google / WeChat OAuth、密码重置、自助删除账号。
- **记录与收藏 History / Favorites**：八字、塔罗、周易、紫微历史记录，批量操作、收藏与快照。
- **运维基础 Operations**：`/live`、`/health`、`/api/ready`、`/metrics`（Prometheus）、管理员健康检查、Pino JSON 日志、OpenAPI / Swagger UI、WebSocket AI 流式输出 `/ws/ai`。
- **程序化 CLI**：`./bazi` 把环境准备、本地栈生命周期、数据库迁移、测试和端到端校验收敛成一套命令，全部支持 `--json` 和约定退出码，方便脚本与 AI Agent 调用。

## 快速开始 / Quick Start

前置要求：Node.js 20+、npm，以及一个本地 PostgreSQL。数据库有两条路可走，`./bazi stack up` 会自动选：装了 Docker 且用默认 5432 端口时走 `docker-compose.yml`；否则回退到本机已安装的 PostgreSQL（`initdb` / `pg_ctl`）。Redis 本地可选。走下面的「手动步骤」则需要 Docker。

关于环境变量：后端进程本身不引入 dotenv，`node server.js` 只读取真实环境变量。用 `./bazi` 启动时，CLI 会读取仓库根的 `.env` 并注入子进程（真实 `process.env` 优先级更高）。手动启动或生产部署时，需要由 shell、进程管理器或部署平台注入。

### 用 `./bazi`（推荐）

仓库根有一个 CLI，把环境准备、起停本地栈、迁移、测试都收敛成了一条链路，
比手敲下面那串命令更不容易出错：

```bash
git clone https://github.com/tytsxai/bazi-master.git
cd bazi-master

./bazi setup     # 装依赖 + 生成 .env + 生成 Prisma Client
./bazi doctor    # 体检环境，每项失败都带可执行的修复命令
./bazi stack up  # 起 db + api
./bazi test      # 跑测试（cli + lint + backend）
```

所有命令都支持 `--json`，退出码有明确约定，方便脚本和 agent 调用。
完整能力清单：`./bazi help --json`。

### 手动步骤

```bash
git clone https://github.com/tytsxai/bazi-master.git
cd bazi-master

# 安装根依赖与后端依赖
npm install
npm -C backend install

# 启动本地 PostgreSQL + Redis
docker compose up -d postgres redis

# 应用数据库迁移；脚本默认使用本地 PostgreSQL:
# postgresql://postgres:postgres@localhost:5432/bazi_master?schema=public
npm -C backend run prisma:migrate:deploy

# 启动 API: http://127.0.0.1:4000
NODE_ENV=development npm -C backend run dev
```

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

给智能体接入时，`docs/openapi.json` 可以直接转成 tool schema；公开计算类接口（八字、塔罗、周易、星座、上升星座、配对、合盘、地点搜索）无需鉴权，是最省事的接入面。

## 适用场景 / Use Cases

- 给已有产品（Web、小程序、App）接一套命理/占星计算后端，界面完全自己实现。
- 作为智能体的专业计算工具：让模型去调真实的排盘算法，而不是自己编排盘结果。
- 参考 Express + Prisma + PostgreSQL + Redis 的鉴权、历史记录、收藏、健康检查和 OpenAPI 组织方式。
- 验证 AI 解读、WebSocket 流式输出、OAuth、密码重置、账号删除等后端路径。
- 作为 AI 搜索引擎与代码助手理解 “divination API / astrology calculation engine” 的结构化示例。

## 技术栈 / Tech Stack

- **Runtime**: Node.js 20+, Express 4
- **Data**: Prisma ORM, PostgreSQL (`prisma/schema.prisma`)
- **Cache / Session**: Redis optional in local development, required for production-like multi-instance consistency
- **AI Providers**: mock, OpenAI, Anthropic; OpenAI image generation for Soul Portrait
- **Interfaces**: REST + OpenAPI / Swagger UI, WebSocket (`ws`) for AI streaming
- **Testing**: Node.js test runner, Supertest
- **Observability**: JSON request logs (Pino), request ID, health/readiness endpoints, Prometheus `/metrics`, optional Sentry

## 环境变量 / Configuration

本地开发可参考 [.env.example](.env.example)，生产部署可参考 [env.production.template](env.production.template)。`./bazi setup` 会基于模板生成 `.env`，`./bazi env` 可以查看、校验和改键。应用进程本身不读 dotenv，详见[快速开始](#快速开始--quick-start)里的说明。

关键配置：

- `DATABASE_URL`: PostgreSQL 连接串，例如 `postgresql://postgres:postgres@127.0.0.1:5432/bazi_master?schema=public`
- `SESSION_TOKEN_SECRET`: 生产必须设置为 32+ 字符随机串
- `FRONTEND_URL` / `CORS_ALLOWED_ORIGINS`: **调用方客户端的来源**——CORS 白名单、OAuth 回调跳转目标和邮件里的链接都取自它。本服务不自带界面，这里填你自己那个客户端的地址
- `BACKEND_BASE_URL`: OpenAPI base URL
- `REDIS_URL`: 本地可选；生产和多实例部署必须配置
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`: 可选；未配置真实密钥时 `AI_PROVIDER=mock`
- `SMTP_HOST` / `SMTP_FROM`: 启用密码重置时需要配置
- `ADMIN_EMAILS`: 管理员健康检查白名单
- `DOCS_USER` / `DOCS_PASSWORD`: 生产环境保护 `/api-docs`
- `METRICS_TOKEN`: `/metrics` 的 Bearer token；留空时该端点在生产环境返回 404
- `TRUST_PROXY`: 有反向代理时设置成**跳数**（一层 nginx 就填 `1`）。填 `true` 表示
  信任所有代理，此时 `X-Forwarded-For` 完全由客户端控制，限流可被一个请求头绕过
- `SENTRY_DSN`: 可选错误与性能监控

## FAQ / 常见问题

### 这是八字算法库还是完整应用？

都不是。它是一个自部署的计算服务：算法逻辑在 `backend/services/calculations.service.js`，HTTP 入口是 `POST /api/bazi/calculate`。它不作为 npm 包发布，也不含界面。

### 为什么没有前端？

前端不是这个项目的卖点。它的价值在能力层——算法正确性、接口契约、鉴权、持久化和可运维性。界面形态因产品而异（Web、小程序、App、纯 agent 调用），塞一套 React 参考实现进来只会模糊边界，还要额外维护一整套浏览器依赖和端到端测试。要做界面，直接照 [docs/api.md](docs/api.md) 和 `docs/openapi.json` 调即可。

### 没有 AI API Key 能运行吗？

可以。未配置 `OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY` 时，文本解读默认使用 `mock` provider；Soul Portrait 图片接口会返回 mock 占位图。接入真实模型前，请在本地和生产环境分别验证密钥、超时、速率限制和成本。

### 当前默认数据库是什么？

当前 `prisma/schema.prisma` 使用 PostgreSQL。`docker-compose.yml` 提供本地 PostgreSQL 和 Redis；后端在开发/测试环境缺少 `DATABASE_URL` 时也会回落到本地 PostgreSQL 默认连接串。

### 可以直接生产上线吗？

可以作为生产化起点，但不是免配置商业 SaaS。生产需要自行配置 PostgreSQL、Redis、HTTPS 反向代理、强随机 `SESSION_TOKEN_SECRET`、SMTP、OAuth、备份、监控和合规策略。上线前请先跑通 [PRODUCTION.md](PRODUCTION.md) 与 [docs/production-ready.md](docs/production-ready.md)。

### 哪些接口不需要登录？

八字计算、塔罗抽牌、周易起卦、星座信息、上升星座、星座配对、合盘分析和位置搜索是公开接口；AI 解读、历史记录、收藏、紫微记录、灵魂画像、用户设置和管理端接口需要登录或管理员权限。完整清单见 [docs/api.md](docs/api.md)。

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
│   ├── scripts/             # migrations, OpenAPI generation, verify-*.mjs
│   └── test/                # backend Node.js tests
├── prisma/                  # Prisma schema and migrations
├── tools/cli/               # ./bazi programmatic CLI (setup/doctor/stack/db/test/verify)
├── docs/                    # API, architecture, development, production docs
├── scripts/                 # backup/restore, deployment verification, CI guards
├── docker/                  # PostgreSQL init scripts
├── bazi                     # CLI entry point
├── docker-compose.yml       # local PostgreSQL + Redis
├── docker-compose.prod.yml  # production stack
├── llms.txt                 # AI-search friendly project summary
└── PRODUCTION.md            # production deployment notes
```

## 测试 / Testing

```bash
# 用 CLI 跑全部目标（cli + lint + backend，隔离临时库，不碰开发库）
./bazi test

# 只跑其中一个
./bazi test backend

# 端到端校验脚本（需要本地栈在跑）
./bazi stack up
./bazi verify all

# 直接用 npm：后端测试，脚本会在未提供 DATABASE_URL 时准备本地测试 PostgreSQL
npm -C backend test

# CLI 自身的契约测试
npm run test:cli
```

> 测试结果依赖本地 Node 与数据库状态。后端测试默认在隔离的临时 PostgreSQL 上跑，不会碰你的开发库；要它直连开发库必须显式加 `--use-dev-db`。

## 部署与生产注意事项 / Production Notes

- 生产请使用 PostgreSQL、Redis、HTTPS 反向代理和强随机 `SESSION_TOKEN_SECRET`。
- 服务默认只绑定 `127.0.0.1:4000`（`BACKEND_BIND_ADDR`），TLS 终结和公网入口交给你自己的反向代理。
- 多实例部署需要 Redis 保存会话、OAuth state、密码重置 token 和八字缓存镜像。
- 生产启动前会校验关键配置；`DATABASE_URL`、`REDIS_URL`、`SESSION_TOKEN_SECRET` 等缺失会阻止启动。
- `/api-docs` 在生产环境建议配置 `DOCS_PASSWORD` 保护；`/metrics` 需要 `METRICS_TOKEN`，且不要经公网反代暴露。
- 发布前请阅读 [PRODUCTION.md](PRODUCTION.md)、[docs/production-ready.md](docs/production-ready.md) 和 [docs/production-runbook.md](docs/production-runbook.md)。

## 限制与免责声明 / Limitations

- 本项目是参考实现，不提供托管服务、不保证占卜或命理准确性。
- 八字、紫微、塔罗、周易和星座输出适合娱乐、文化研究、产品原型与代码学习，不应作为专业建议。
- AI 解读依赖外部模型质量、密钥、速率限制和提示词；mock provider 仅用于开发和演示。
- OAuth、SMTP、Sentry、反向代理、域名、证书和平台合规需要部署者自行配置与验证。
- 当前重点是计算能力层与工程可靠性，不等同于完整商业化命理平台。

## 文档 / Documentation

- [docs/api.md](docs/api.md): HTTP API overview（全部路由、鉴权要求、请求/响应字段）
- [docs/architecture.md](docs/architecture.md): system architecture and module map
- [docs/development.md](docs/development.md): local development guide
- [docs/faq.md](docs/faq.md): project FAQ for developers and AI search engines
- [docs/backend-reliability.md](docs/backend-reliability.md): 后端可靠性、超时、重试与降级策略
- [docs/production-ready.md](docs/production-ready.md): production readiness checklist
- [docs/production-runbook.md](docs/production-runbook.md): 上线、排障与回滚 runbook
- [docs/monitoring-guide.md](docs/monitoring-guide.md): monitoring and observability notes
- [PRODUCTION.md](PRODUCTION.md): 生产部署总览
- [CHANGELOG.md](CHANGELOG.md): 版本变更记录
- [llms.txt](llms.txt): structured summary for AI search engines and coding agents

## GitHub Topics 建议

`bazi`, `bazi-chart`, `bazi-api`, `ziwei`, `ziwei-doushu`, `tarot`, `iching`, `astrology`, `synastry`, `divination`, `fortune-telling`, `metaphysics`, `calculation-engine`, `rest-api`, `agent-tools`, `express`, `prisma`, `postgresql`, `redis`, `openapi`, `self-hosted`

## License

MIT License. See [LICENSE](LICENSE).

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=tytsxai/bazi-master&type=Date)](https://www.star-history.com/#tytsxai/bazi-master&Date)
