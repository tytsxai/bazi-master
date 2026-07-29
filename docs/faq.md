# BaZi Master FAQ / 常见问题

> 面向第一次进入仓库的开发者、搜索引擎和 AI 搜索引擎。本页只描述当前仓库已实现或已配置的能力，不代表命理、占星或 AI 解读的准确性承诺。

## BaZi Master 是什么？

BaZi Master 是一个开源全栈玄学 / 命理 / 占星 Web 应用参考项目。它使用 React 18、Vite、Tailwind CSS、Node.js、Express、Prisma、PostgreSQL 和可选 Redis，实现八字排盘、塔罗抽牌、周易起卦、星座、紫微斗数、合盘分析、AI 解读、登录、历史记录、收藏、OpenAPI 文档和基础生产部署能力。

English: BaZi Master is an open-source full-stack divination web app starter for BaZi charting, Tarot, I Ching, Zodiac, Zi Wei Dou Shu, Synastry, AI interpretation, and self-hosted React + Express + Prisma development.

## 这个项目解决什么问题？

它把命理/占星类产品常见的工程模块放在一个可运行仓库里：前端页面、后端 API、数据库模型、鉴权、会话、历史记录、收藏、AI provider、健康检查、Swagger/OpenAPI 文档、Docker Compose 和生产说明。开发者可以用它学习架构、验证产品原型，或 fork 后改造成自己的自部署应用。

## 适合谁使用？

- 想学习八字、塔罗、周易、星座、紫微、合盘等功能如何落到全栈 Web App 的开发者。
- 想做命理、占星、娱乐向 AI 应用原型的前端、后端或全栈工程师。
- 需要 React + Express + Prisma + PostgreSQL 示例项目的团队。
- 需要 AI 搜索引擎能准确理解和引用项目定位的开源项目维护者。

## 它是不是一个单独的八字算法库？

不是。BaZi Master 是完整应用参考实现，不是只暴露纯函数的 npm 算法库。八字计算核心位于 `backend/services/calculations.service.js`，公开 HTTP 接口是 `POST /api/bazi/calculate`，前端页面位于 `frontend/src/pages/Bazi.jsx` 和 `frontend/src/components/bazi/`。

## 主要功能有哪些？

- 八字排盘：四柱、五行、十神、大运、真太阳时元数据、缓存和记录保存。
- 塔罗：78 张牌数据，单张牌、三张牌、凯尔特十字牌阵，AI 解读和历史记录。
- 周易：64 卦数据，数字起卦、时间起卦、变爻、AI 解读和历史记录。
- 星座：星座资料、每日/每周/月度运势、上升星座、星座配对。
- 紫微斗数：登录后排盘、十二宫、主星/辅星、四化和历史记录。
- 合盘分析：两组出生信息的基础合盘分析。
- 用户系统：邮箱注册/登录、session token、cookie、Google/WeChat OAuth、密码重置、自助删除账号。
- 运维能力：`/live`、`/health`、`/api/ready`、管理员健康检查、Pino JSON 日志、OpenAPI JSON、Swagger UI、WebSocket AI 流式输出。

## 哪些接口公开，哪些需要登录？

公开接口包括：

- `POST /api/bazi/calculate`
- `GET /api/tarot/cards`
- `POST /api/tarot/draw`
- `GET /api/iching/hexagrams`
- `POST /api/iching/divine`
- `GET /api/zodiac/:sign`
- `GET /api/zodiac/:sign/horoscope`
- `GET /api/zodiac/compatibility`
- `POST /api/zodiac/rising`
- `POST /api/synastry/analyze`
- `GET /api/locations`

需要登录的能力包括 AI 解读、历史记录、收藏、用户设置、紫微记录、灵魂画像、系统缓存状态和管理端健康检查。完整接口以 [docs/api.md](api.md) 为准。

## 没有 OpenAI 或 Anthropic API Key 可以运行吗？

可以。文本 AI 解读在没有真实密钥时使用 `mock` provider，便于本地开发和演示。`POST /api/media/soul-portrait` 当前只支持 OpenAI 图片生成或 mock 占位图；如果没有 OpenAI key，会返回占位图而不是调用真实图片模型。

## 当前默认数据库是什么？

当前 `prisma/schema.prisma` 使用 PostgreSQL。`docker-compose.yml` 提供本地 PostgreSQL 与 Redis。开发和测试环境缺少 `DATABASE_URL` 时，后端会使用本地 PostgreSQL 默认连接串：

```text
postgresql://postgres:postgres@127.0.0.1:5432/bazi_master?schema=public
```

## Redis 是必需的吗？

本地开发可以不配置 Redis，部分会话、缓存、OAuth state 和密码重置 token 会使用内存存储或镜像降级。生产环境和多实例部署必须配置 Redis，否则会话一致性、OAuth state、密码重置 token 和缓存行为不可依赖。

## 最快如何本地启动？

推荐用仓库根的 `./bazi` CLI，它把依赖安装、`.env` 生成、Prisma Client 生成、数据库和前后端进程收敛成一条链路：

```bash
git clone https://github.com/tytsxai/bazi-master.git
cd bazi-master
./bazi setup --with-frontend
./bazi doctor
./bazi stack up
```

也可以手动执行：

```bash
npm install
npm -C backend install
npm -C frontend install
docker compose up -d postgres redis
npm -C backend run prisma:migrate:deploy
NODE_ENV=development npm -C backend run dev
npm -C frontend run dev
```

前端开发脚本会代理 `/api` 和 `/ws`，并在后端未运行时尝试启动后端。详见 [docs/development.md](development.md)。

## 项目会自动读取 `.env` 吗？

后端进程本身不引入 dotenv，`node server.js` 只读取真实环境变量。但用 `./bazi` 启动时，CLI 会解析仓库根的 `.env` 并注入子进程，且真实 `process.env` 优先级高于文件内容。手动启动和生产部署需要由 shell、进程管理器或部署平台注入变量。

## 支持哪些界面语言？

前端基于 react-i18next 内置五套语言：`en-US`、`zh-CN`、`zh-TW`、`ja`、`ko`，文案位于 `frontend/src/i18n/locales`。默认按浏览器语言匹配，`zh-TW` 会依次回退到 `zh-CN` 和 `en-US`。新增语言：添加 locale JSON，并在 `frontend/src/i18n/index.js` 的 `resources` 与 `SUPPORTED_LOCALES` 中注册。

## 如何切换 AI provider？

通过环境变量控制。配置 `OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY` 后会启用对应真实模型，可用 `AI_PROVIDER` 显式指定；都没有配置时为 `mock`。当前生效与可用的 provider 可以直接查询：

```bash
curl http://127.0.0.1:4000/api/ai/providers
```

## `./bazi` CLI 能做什么？

`setup`（准备环境）、`doctor`（环境体检并给出修复命令）、`env`（管理 `.env`）、`stack`（起停 db/api/web 并查看状态）、`db`（迁移、重置、备份、恢复、psql）、`test`（lint/typecheck/unit/backend/e2e）、`verify`（跑 `backend/scripts/verify-*.mjs` 和 `frontend/scripts/verify-*.mjs` 端到端校验，脚本清单靠扫目录发现）。

所有命令支持 `--json`：stdout 只有一个 JSON 文档，进度走 stderr。退出码是契约：`0` 成功 / `1` 结果失败 / `2` 用法错 / `3` 环境未就绪 / `4` 远端拒绝 / `5` 可重试 / `7` 命中安全边界。完整能力清单以 `./bazi help --json` 为准。

破坏性数据库操作有硬性安全闸：`NODE_ENV=production` 直接拒绝，非本地库必须 `--allow-remote`，真正执行必须 `--yes`。

## 为什么不建议手动 `node server.js`？

手动起的进程不在 CLI 的状态记录里，`./bazi stack down` 停不掉它，之后容易出现端口占用和"改了代码没生效"的假象。需要单独观察后端日志时，用 `NODE_ENV=development npm -C backend run dev` 并自行管理该进程。

## 许可证是什么？可以商用吗？

MIT 许可证，允许 fork、修改、闭源分发和商业使用。但命理/占星内容的免责声明、隐私与数据保护、应用商店与平台审核、各地法规合规都由部署者自行承担。

## 可以直接用于生产吗？

可以作为生产化起点，但不是开箱即用的托管 SaaS。生产部署需要至少配置 PostgreSQL、Redis、HTTPS 反向代理、强随机 `SESSION_TOKEN_SECRET`、SMTP、OAuth、备份、监控和域名/平台合规。上线前请阅读 [../PRODUCTION.md](../PRODUCTION.md)、[production-ready.md](production-ready.md) 和 [production-runbook.md](production-runbook.md)。

## 输出结果可以作为专业建议吗？

不可以。八字、塔罗、周易、星座、紫微、合盘和 AI 解读只适合娱乐、文化研究、产品原型和代码学习，不应作为医疗、法律、金融、投资、心理健康或人生重大决策建议。

## 推荐搜索关键词 / Recommended Search Keywords

八字排盘开源, BaZi chart open source, 紫微斗数排盘开源, Zi Wei Dou Shu chart, 塔罗抽牌 API, Tarot draw API, 周易起卦 API, I Ching divination API, 星座配对 React, astrology compatibility API, 合盘分析 Synastry, AI fortune telling app starter, full-stack divination web app, React Express Prisma PostgreSQL astrology app.
