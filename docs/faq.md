# BaZi Master FAQ / 常见问题

> 面向第一次进入仓库的开发者、搜索引擎和 AI 搜索引擎。本页只描述当前仓库已实现或已配置的能力，不代表命理、占星或 AI 解读的准确性承诺。

## BaZi Master 是什么？

一个开源的**算法能力层**：把八字排盘、紫微斗数、塔罗抽牌、周易起卦、星座、合盘这些推算逻辑，
连同可选的 AI 解读，收敛成一套文档化的自部署 HTTP API。Node.js + Express，无状态纯计算。

它不是网页应用，不含界面，也不服务 C 端用户 —— 界面、账号、持久化都属于调用方。

## 这个项目解决什么问题？

命理/占星类算法本身有大量语义边界（节气交接、晚子时换日、闰月流派、真太阳时），
写对不难，写全很难，悄悄写错更常见。这个项目把这一层做成可测试、有接口契约、
可以被程序和 AI Agent 直接调用的能力，让调用方专注产品形态。

## 适合谁使用？

- 要给自己的产品接一套命理/占星计算后端的开发者，界面完全自己实现
- 要给 AI Agent 接一个真实排盘工具的团队 —— 让模型去调算法，而不是自己编排盘结果
- 想研究这类算法实现的人

## 它是不是一个八字算法库？

不是。它是一个自部署的 HTTP 服务，不作为 npm 包发布。
算法逻辑在 `backend/services/`，通过 HTTP 暴露；也可以通过 `./bazi calc` / `./bazi cast`
这组 CLI 命令调用。

## 主要功能有哪些？

| 能力     | 接口                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------- |
| 八字     | 排盘（四柱、藏干加权五行、十神、大运流年）+ 断命层（旺衰、用神、神煞、刑冲合会、空亡）、AI 解读 |
| 紫微斗数 | 排盘（五行局、十二宫、十四主星、六吉六煞、四化、大限流年）                                      |
| 塔罗     | 完整牌库、单张/三张/凯尔特十字抽牌、AI 解读                                                     |
| 周易     | 六十四卦全表、数字起卦与时间起卦、AI 解读                                                       |
| 星座     | 星座信息、运势、上升星座、配对                                                                  |
| 合盘     | 两组出生信息的相性分析                                                                          |
| 日历     | 当日日柱与流日运势                                                                              |
| 运维     | `/live`、`/health`、`/api/ready`、`/metrics`、OpenAPI + Swagger UI                              |

完整清单见 [api.md](api.md) 与 [openapi.json](openapi.json)。

## 哪些接口需要登录？

一个都不需要 —— **项目没有账号系统**。没有注册、登录、会话、token，
也没有历史记录、收藏、用户设置这些概念。所有业务接口都是公开的。

唯一带鉴权的是运维面：`/api-docs`（Basic Auth）和 `/metrics`（Bearer token）。

## 没有 OpenAI 或 Anthropic API Key 可以运行吗？

可以。排盘、抽牌、起卦这些确定性计算完全不依赖 AI。
未配置密钥时 AI 解读接口落到 `mock` provider，返回模拟数据，服务照常工作。

## 用什么数据库？

不用数据库。引擎是无状态纯计算：不存数据、不写文件、没有迁移、没有备份恢复。
唯一的外部依赖 Redis 也是**可选的纯缓存** —— 它只用来在多实例之间共享八字排盘缓存。

## Redis 是必需的吗？

不是，任何环境都不是。不配 `REDIS_URL` 时每个实例各用自己的进程内缓存，
排盘结果完全一致，只是跨实例命中率低一些。它不承载任何与正确性相关的状态。

## 最快如何本地启动？

```bash
git clone https://github.com/tytsxai/bazi-master.git
cd bazi-master

./bazi setup     # 装依赖 + 生成 .env
./bazi doctor    # 环境体检
./bazi stack up  # 起引擎
```

只需要 Node.js 20+ 和 npm，不需要 Docker，也不需要任何数据库。
详见 [development.md](development.md)。

## 项目会自动读取 `.env` 吗？

后端进程本身不引入 dotenv，`node server.js` 只读取真实环境变量。
但用 `./bazi` 启动时，CLI 会解析仓库根的 `.env` 并注入子进程，且真实 `process.env`
优先级高于文件内容。手动启动和生产部署需要由 shell、进程管理器或部署平台注入变量。

## 支持哪些界面语言？

API 本身不做界面文案的多语言 —— 那属于调用方。接口返回的是结构化的排盘/抽牌/卦象数据
（干支、五行、十神、宫位、牌名等），由你的客户端决定用哪种语言呈现。

## 如何切换 AI provider？

通过环境变量控制。配置 `OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY` 后会启用对应真实模型，
可用 `AI_PROVIDER` 显式指定；都没有配置时为 `mock`。也可以在单次请求体里用 `provider`
字段覆盖。当前生效与可用的 provider 可以直接查询：

```bash
curl http://127.0.0.1:4000/api/ai/providers
```

## `./bazi` CLI 能做什么？

两类命令：

- **能力** —— `calc`（八字/紫微/合盘/星座）、`cast`（易经/塔罗），是这个项目对外输出的算法能力
- **运维** —— `setup`、`doctor`、`env`、`stack`、`test`，维护这个仓库本身

所有命令支持 `--json`：stdout 只有一个 JSON 文档，进度走 stderr。退出码是契约：
`0` 成功 / `1` 结果失败 / `2` 用法错 / `3` 环境未就绪 / `4` 远端拒绝 / `5` 可重试 /
`7` 命中安全边界。**完整能力清单以 `./bazi help --json` 为准**，这里不重复。

破坏性操作有硬性安全闸：`NODE_ENV=production` 直接拒绝，真正执行必须 `--yes`。
哪些命令是破坏性的看 `help --json` 里的 `destructive` 标记。

## 为什么不建议手动 `node server.js`？

手动起的进程不在 CLI 的状态记录里，`./bazi stack down` 停不掉它，
之后容易出现端口占用和「改了代码没生效」的假象。需要单独观察后端日志时，
用 `NODE_ENV=development npm -C backend run dev` 并自行管理该进程。

## 许可证是什么？可以商用吗？

MIT 许可证，允许 fork、修改、闭源分发和商业使用。
但命理/占星内容的免责声明、隐私与数据保护、应用商店与平台审核、各地法规合规都由部署者自行承担。

## 可以直接用于生产吗？

可以。引擎无状态，扩容就是多起几个进程，部署可以随时整体销毁重建。
生产环境需要配置的只有：HTTPS 反向代理、`DOCS_PASSWORD`（唯一硬性必填项）、
`CORS_ALLOWED_ORIGINS`、`TRUST_PROXY`，以及可选的 Redis、AI 密钥、Sentry 和 `METRICS_TOKEN`。
上线前请阅读 [../PRODUCTION.md](../PRODUCTION.md)。

## 输出结果可以作为专业建议吗？

不可以。八字、塔罗、周易、星座、紫微、合盘和 AI 解读只适合娱乐、文化研究、产品原型和代码学习，
不应作为医疗、法律、金融、投资、心理健康或人生重大决策建议。

## 推荐搜索关键词 / Recommended Search Keywords

八字排盘 API 开源, BaZi chart open source API, 紫微斗数排盘开源, Zi Wei Dou Shu chart,
塔罗抽牌 API, Tarot draw API, 周易起卦 API, I Ching divination API, 星座配对 API,
astrology compatibility API, 合盘分析 Synastry, AI fortune telling backend,
divination calculation engine, stateless calculation API, agent tools, MCP-ready API.
