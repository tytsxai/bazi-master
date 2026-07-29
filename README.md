# BaZi Master · 八字与多模态玄学计算引擎 / Open-Source Divination Calculation API

[![Release](https://img.shields.io/github/v/release/tytsxai/bazi-master)](https://github.com/tytsxai/bazi-master/releases) · [English README](README.en.md) · [llms.txt](llms.txt) · [API Docs](docs/api.md) · [Architecture](docs/architecture.md) · [Changelog](CHANGELOG.md) · [Issues](https://github.com/tytsxai/bazi-master/issues)

BaZi Master 是一个开源的玄学计算引擎，把八字排盘（BaZi chart）、紫微斗数排盘（Zi Wei Dou Shu）、塔罗抽牌（Tarot draw）、周易起卦（I Ching divination）、星座与上升星座（Zodiac / Ascendant）、合盘分析（Synastry）和 AI 解读，收敛成一套文档化的 HTTP API 和一个面向 Agent 的程序化 CLI。

它是**算法能力层**，不是网页应用，也不服务 C 端用户：界面、账号、持久化都属于调用方。引擎本身是无状态纯计算——不存数据、不认用户、没有数据库。

English summary: **BaZi Master is an open-source divination calculation engine** exposed as a documented HTTP API and an agent-callable CLI. It is a stateless pure-calculation service — no database, no accounts, no UI. Node.js / Express, optional Redis cache, pluggable AI providers, OpenAPI contract.

> 关键词 / Keywords: 八字排盘 API, BaZi chart API, 紫微斗数排盘, Zi Wei Dou Shu chart, 塔罗抽牌 API, Tarot draw API, 周易起卦 API, I Ching divination API, 星座配对, astrology compatibility, 合盘分析 Synastry, stateless calculation engine, agent tools, AI divination backend.

**目录**：[项目定位](#项目定位--project-snapshot) · [核心能力](#核心能力--core-capabilities) · [快速开始](#快速开始--quick-start) · [调用示例](#调用示例--usage-examples) · [适用场景](#适用场景--use-cases) · [技术栈](#技术栈--tech-stack) · [环境变量](#环境变量--configuration) · [FAQ](#faq--常见问题) · [项目结构](#项目结构--repository-structure) · [测试](#测试--testing) · [生产部署](#部署与生产注意事项--production-notes) · [限制](#限制与免责声明--limitations)

## 项目定位 / Project Snapshot

| 维度         | 说明                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------- |
| 项目类型     | 开源玄学 / 占星 / 命理**算法能力层**，以自部署 HTTP API + 程序化 CLI 交付                |
| 解决问题     | 把命理算法里那些「写错也不会报错」的语义边界做成可测试、有契约、可被程序调用的能力       |
| 适合谁       | 要给产品接命理计算的后端开发者，以及要给 AI Agent 接一个真实排盘工具的团队               |
| 消费方式     | 直接调 HTTP API；用 `./bazi calc` / `./bazi cast`；或作为 agent tool 接入                |
| 运行形态     | **无状态纯计算**：没有数据库、没有账号、没有会话、不写文件                               |
| 唯一外部依赖 | Redis，且是**可选的纯缓存**（只影响跨实例排盘缓存命中率，不影响结果）                    |
| 技术栈       | Node.js 20+, Express 4, Node.js test runner                                              |
| 本地前置     | Node.js 20+ 和 npm。不需要 Docker，不需要数据库                                          |
| AI 能力      | mock / OpenAI / Anthropic 文本解读，可按请求覆盖；不配密钥时排盘照常工作                 |
| 开发入口     | 仓库根 `./bazi` 程序化 CLI：算法调用、环境准备、起停引擎、测试，全部支持 `--json`        |
| 主要入口     | API 路由在 `backend/routes`；算法逻辑在 `backend/services`                               |
| 接口契约     | OpenAPI 描述在 [docs/openapi.json](docs/openapi.json)，运行时挂在 `/api-docs`，CI 守快照 |
| 许可证       | MIT，可自由 fork、修改、自部署和商用（需自行承担合规与免责声明）                         |
| 重要限制     | 输出仅适合娱乐、文化研究或产品原型验证；不要当作医疗、法律、投资、人生决策建议           |

### 这不是什么 / What it is not

- 不是网页应用，仓库不含任何前端代码，也不提供线上实例。界面由你自己实现。
- 不是托管的在线算命服务。
- 不是一个纯 npm 八字算法库；计算逻辑是服务内部的 service，通过 HTTP 和 CLI 暴露，不单独发包。
- 不是带账号系统的后端脚手架——注册、登录、OAuth、历史记录、收藏这些能力**已经从项目中移除**，它们属于调用方。
- 不是对命理、占星准确性的科学背书。
- 不是开箱即用的商业合规方案（应用商店、微信、支付、广告和各地法规需自行处理）。

## 核心能力 / Core Capabilities

- **八字排盘 BaZi charting**：四柱、藏干加权五行、十神（含中气余气）、身强身弱、扶抑法用神喜忌、
  神煞、纳音、十二长生、四柱刑冲合会害破、空亡；大运带起运时刻与逐年流年。真太阳时参与排盘，
  带排盘缓存。
- **紫微斗数 Zi Wei Dou Shu**：农历换算、五行局、十二宫、十四主星、六吉六煞、四化、大限小限流年。
  安星依「命宫干支纳音定五行局 → 紫微 → 天府 → 诸星」的正统链条。闰月按「归本月」流派。
- **六爻纳甲 Liu Yao**：京房筮法装卦。八宫归属、世应、纳甲干支、六亲、六神、伏神、旬空、
  月建日辰生克、动爻变卦。八宫由世卦推衍规则算出，非硬编表。
- **大六壬 Da Liu Ren**：月将加时得天地盘、日干寄宫、四课、三传（九宗门全备）、十二天将。
  月将取月建六合、以中气换将。
- **奇门遁甲 Qi Men**：拆补法定局、地盘三奇六仪、值符值使、转盘法排九星八门八神。
- **八宅风水 Ba Zhai**：本命卦（立春为界）与八方游年星，由变爻法排出。
- **择吉 Almanac**：建除十二神、二十八宿及其吉凶、吉神凶煞、彭祖百忌。
- **姓名五格 Name Grids**：天人地外总五格与三才配置（笔画数由调用方提供）。
- **塔罗 Tarot**：完整牌库，单张 / 三张 / 凯尔特十字牌阵。
- **周易 I Ching**：六十四卦全表（含真卦名与《周易》序号），数字起卦（确定性）与时间起卦。
- **星座 Zodiac**：星座信息、运势、上升星座计算、配对。
- **合盘 Synastry**：两组出生信息的相性分析。
- **AI 解读 AI interpretation**：八字 / 塔罗 / 周易的解读接口，支持 mock / OpenAI / Anthropic，带并发闸与流式空闲超时。
- **运维基础 Operations**：`/live`、`/health`、`/api/ready`、`/metrics`（Prometheus）、Pino JSON 日志、OpenAPI / Swagger UI、优雅停机与排水。
- **程序化 CLI**：`./bazi` 把算法调用与仓库运维收敛成一套命令，全部支持 `--json` 和约定退出码，方便脚本与 AI Agent 调用。

### 一条贯穿全部能力的边界：结构归引擎，断语归调用方

盘**怎么排**由引擎负责，且必须精准：三传、安星、排局、游年，这些有唯一正确答案，
错了就是错了。盘**怎么解**不由引擎负责：紫微的庙旺利陷、奇门的格局名目（青龙返首、
飞鸟跌穴）、神煞的吉凶轻重，各家取法与成立条件出入极大，塞进能力层只会让调用方
继承一套说不清出处的判断。

所以引擎把断语所需的原料给全（每宫的星门神干、每爻的六亲六神、每柱的藏干十神），
断语本身留给调用方按所宗流派叠加。有流派分歧的排盘口径（藏干权重、闰月归属、
定局用拆补法、天盘用转盘法）一律就地注明，换派只改一处。

## 快速开始 / Quick Start

前置要求只有 **Node.js 20+ 和 npm**。不需要 Docker，不需要数据库，不需要 Redis。

关于环境变量：后端进程本身不引入 dotenv，`node server.js` 只读取真实环境变量。用 `./bazi` 启动时，CLI 会读取仓库根的 `.env` 并注入子进程（真实 `process.env` 优先级更高）。手动启动或生产部署时，需要由 shell、进程管理器或部署平台注入。

### 用 `./bazi`（推荐）

```bash
git clone https://github.com/tytsxai/bazi-master.git
cd bazi-master

./bazi setup     # 装依赖 + 生成 .env
./bazi doctor    # 体检环境，每项失败都带可执行的修复命令
./bazi stack up  # 起引擎
./bazi test      # 跑测试（cli + lint + backend）
```

所有命令都支持 `--json`，退出码有明确约定，方便脚本和 agent 调用。
完整能力清单：`./bazi help --json`——这是唯一真源，本文档刻意不重复命令列表。

### 手动步骤

```bash
git clone https://github.com/tytsxai/bazi-master.git
cd bazi-master

npm install
npm -C backend install

NODE_ENV=development npm -C backend run dev   # http://127.0.0.1:4000
```

常用检查：

```bash
curl http://127.0.0.1:4000/live
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:4000/api/ready
curl http://127.0.0.1:4000/api/ai/providers
```

## 调用示例 / Usage Examples

八字排盘：

```bash
curl -X POST http://127.0.0.1:4000/api/bazi/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "birthYear": 1990,
    "birthMonth": 5,
    "birthDay": 20,
    "birthHour": 14,
    "gender": "male",
    "birthLocation": "Beijing",
    "timezone": "Asia/Shanghai"
  }'
```

塔罗抽牌：

```bash
curl -X POST http://127.0.0.1:4000/api/tarot/draw \
  -H "Content-Type: application/json" \
  -d '{ "spreadType": "ThreeCard" }'
```

用 CLI 调同样的能力（引擎要先起着）：

```bash
./bazi calc bazi --birth 1990-05-20T14:30 --gender male --json
./bazi cast tarot --spread ThreeCard --json
```

更多接口见 [docs/api.md](docs/api.md)。启动后也可以访问：

- Swagger UI: `http://127.0.0.1:4000/api-docs`
- OpenAPI JSON: `http://127.0.0.1:4000/api-docs.json`

给智能体接入时，`docs/openapi.json` 可以直接转成 tool schema；所有业务接口都无需鉴权。

## 适用场景 / Use Cases

- 给已有产品（Web、小程序、App）接一套命理/占星计算后端，界面完全自己实现。
- 作为智能体的专业计算工具：让模型去调真实的排盘算法，而不是自己编排盘结果。
- 参考一个无状态计算服务如何组织接口契约、健康检查、优雅停机和可观测性。
- 研究八字/紫微算法里那些流派选择与边界条件（节气交接、晚子时、闰月、真太阳时）。

## 技术栈 / Tech Stack

- **Runtime**: Node.js 20+, Express 4
- **State**: 无。引擎是纯计算，不持有任何跨请求状态
- **Cache**: Redis 可选，仅用于多实例共享八字排盘缓存
- **AI Providers**: mock, OpenAI, Anthropic
- **Interfaces**: REST + OpenAPI / Swagger UI，以及 `./bazi` 程序化 CLI
- **Testing**: Node.js test runner，不依赖任何外部服务
- **Observability**: JSON request logs (Pino), request ID, health/readiness endpoints, Prometheus `/metrics`, optional Sentry

## 环境变量 / Configuration

本地开发参考 [.env.example](.env.example)，生产部署参考 [env.production.template](env.production.template)。`./bazi setup` 会基于模板生成 `.env`，`./bazi env` 可以查看、校验和改键。

**开发环境一个变量都不必填**，全部有默认值。生产环境的关键配置：

- `DOCS_PASSWORD`: **唯一的硬性必填项**。缺了它进程在生产模式下启动即退出（`/api-docs` 没法保护）
- `CORS_ALLOWED_ORIGINS`: 允许跨域的调用方来源。服务端到服务端、Agent 调用不带 Origin 头，不受影响
- `BACKEND_BASE_URL`: OpenAPI 文档里的 base URL
- `TRUST_PROXY`: 有反向代理时设置成**跳数**（一层 nginx 就填 `1`）。填 `true` 表示信任所有代理，此时 `X-Forwarded-For` 完全由客户端控制，限流可被一个请求头绕过
- `REDIS_URL`: 可选。只影响多实例之间的排盘缓存共享，不影响结果正确性
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`: 可选；未配置时 `AI_PROVIDER=mock`
- `METRICS_TOKEN`: `/metrics` 的 Bearer token；留空时该端点在生产环境返回 404
- `SHUTDOWN_DRAIN_MS`: 排水窗口，要按你的负载均衡探测节奏设置（模板里有对照表）
- `SENTRY_DSN`: 可选错误与性能监控

## FAQ / 常见问题

### 这是八字算法库还是完整应用？

都不是。它是一个自部署的计算服务：算法逻辑在 `backend/services/`，HTTP 入口是 `POST /api/bazi/calculate`，也可以用 `./bazi calc bazi` 调用。它不作为 npm 包发布，也不含界面。

### 为什么没有前端？

前端不是这个项目的卖点。它的价值在能力层——算法正确性、语义边界、接口契约和可运维性。界面形态因产品而异（Web、小程序、App、纯 agent 调用），塞一套参考实现进来只会模糊边界。要做界面，直接照 [docs/api.md](docs/api.md) 和 `docs/openapi.json` 调即可。

### 为什么连账号系统也删掉了？

同一个理由。注册、登录、OAuth、密码重置、历史记录、收藏这些能力和命理算法没有任何关系，任何一个真实产品都会用自己那一套。留着它们意味着这个项目要为一堆自己不擅长、调用方也不会用的能力承担安全和维护责任。删掉之后，整个存储层、会话层和它们带来的备份/迁移/一致性问题一起消失了。

### 没有 AI API Key 能运行吗？

可以。排盘、抽牌、起卦这些确定性计算完全不依赖 AI。未配置 `OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY` 时，解读接口落到 `mock` provider。

### 需要数据库吗？

不需要。引擎不存任何数据。Redis 也是可选的，且只是缓存。

### 可以直接生产上线吗？

可以。无状态意味着扩容就是多起几个进程，部署可以随时整体销毁重建。生产需要配置的是 HTTPS 反向代理、`DOCS_PASSWORD`、`CORS_ALLOWED_ORIGINS`、`TRUST_PROXY`，以及可选的 Redis、AI 密钥、Sentry 和 `METRICS_TOKEN`。上线前请读 [PRODUCTION.md](PRODUCTION.md)。

### 哪些接口需要登录？

一个都不需要——项目没有账号系统。唯一带鉴权的是 `/api-docs`（Basic Auth）和 `/metrics`（Bearer token），它们是运维面。

### 许可证是什么？可以商用吗？

MIT 许可证，允许 fork、修改、闭源分发和商业使用。但命理/占星内容的合规声明、免责声明、数据保护和平台审核责任由部署者自行承担，详见[限制与免责声明](#限制与免责声明--limitations)。

### 为什么要用 `./bazi` 而不是直接 npm script？

`./bazi` 会记录引擎进程的状态，手动 `node server.js` 起的进程它管不到、之后也停不掉。CLI 还负责生成 `.env`、检查端口与依赖就绪状态，并在失败时给出可直接执行的修复命令。全部命令见 `./bazi help --json`。

## 项目结构 / Repository Structure

```text
bazi-master/
├── backend/                 # Express API
│   ├── routes/              # /api/bazi, /api/ziwei, /api/tarot, /api/iching, ...
│   ├── services/            # 算法与业务逻辑：calculation, ziwei, tarot, iching, ai, ...
│   ├── middleware/          # CORS, rate limit, validation, docs auth, error handling
│   ├── constants/ data/     # 干支、星曜、塔罗牌库、六十四卦
│   ├── scripts/             # start.mjs（容器入口）、generate-openapi.js
│   └── test/                # backend Node.js tests
├── tools/cli/               # ./bazi 程序化 CLI（calc/cast + setup/doctor/env/stack/test）
├── docs/                    # API、架构、开发、FAQ、OpenAPI 快照
├── scripts/                 # CI 守卫与部署验证脚本
├── bazi                     # CLI entry point
├── docker-compose.yml       # 本地可选 Redis（引擎本身不需要）
├── docker-compose.prod.yml  # 生产参考栈：引擎 + 可选 Redis + autoheal
├── llms.txt                 # AI-search friendly project summary
└── PRODUCTION.md            # 生产部署与运维
```

## 测试 / Testing

```bash
./bazi test              # 全部目标：cli + lint + backend
./bazi test backend      # 只跑后端
./bazi test --fail-on-skip --json   # CI 用：有目标被跳过就退 3

npm -C backend test      # 后端测试
npm run test:cli         # CLI 自身的契约测试
```

**测试不需要任何外部服务**——没有数据库要准备，没有容器要起。这是无状态设计换来的直接好处。

> `bazi test` 的目标未就绪时会记 `skipped` 并照样返回 0。读 `summary.skipped`，别只看退出码。

## 部署与生产注意事项 / Production Notes

- 引擎无状态：多实例部署不需要粘性会话，也不需要任何协调。
- 服务默认只绑定 `127.0.0.1:4000`（`BACKEND_BIND_ADDR`），TLS 终结和公网入口交给你自己的反向代理。
- 生产启动前会校验配置：`DOCS_PASSWORD` 缺失会阻止启动，其余缺失只打 warning。
- `/metrics` 需要 `METRICS_TOKEN`，且不要经公网反代暴露。
- 优雅停机带排水窗口：`SHUTDOWN_DRAIN_MS` 必须按你的负载均衡探测节奏设置，并小于编排层的 stop grace period。
- 发布前请阅读 [PRODUCTION.md](PRODUCTION.md)。

## 限制与免责声明 / Limitations

- 本项目是参考实现，不提供托管服务、不保证占卜或命理准确性。
- 八字、紫微、塔罗、周易和星座输出适合娱乐、文化研究、产品原型与代码学习，不应作为专业建议。
- 算法涉及流派选择（晚子时不换日、闰月归本月、藏干权重与旺衰阈值、真太阳时默认参与排盘），与你预期的流派可能不同——这些边界在 [.claude/skills/bazi-cli/SKILL.md](.claude/skills/bazi-cli/SKILL.md) 里逐条写明，代码里也就地标注了选定口径。
- AI 解读依赖外部模型质量、密钥、速率限制和提示词；mock provider 仅用于开发和演示。
- 反向代理、域名、证书和平台合规需要部署者自行配置与验证。

## 文档 / Documentation

- [docs/api.md](docs/api.md): HTTP API 接口清单
- [docs/architecture.md](docs/architecture.md): 架构与模块分工
- [docs/development.md](docs/development.md): 本地开发指南
- [docs/faq.md](docs/faq.md): 常见问题
- [.claude/skills/bazi-cli/SKILL.md](.claude/skills/bazi-cli/SKILL.md): 算法语义边界与 CLI 用法
- [PRODUCTION.md](PRODUCTION.md): 生产部署与运维
- [CHANGELOG.md](CHANGELOG.md): 版本变更记录
- [llms.txt](llms.txt): structured summary for AI search engines and coding agents

## GitHub Topics 建议

`bazi`, `bazi-chart`, `bazi-api`, `ziwei`, `ziwei-doushu`, `tarot`, `iching`, `astrology`, `synastry`, `divination`, `fortune-telling`, `metaphysics`, `calculation-engine`, `rest-api`, `agent-tools`, `stateless`, `express`, `nodejs`, `openapi`, `self-hosted`

## License

MIT License. See [LICENSE](LICENSE).

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=tytsxai/bazi-master&type=Date)](https://www.star-history.com/#tytsxai/bazi-master&Date)
