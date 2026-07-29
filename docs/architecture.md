# BaZi Master - 架构文档

> 版本: v0.2.0 | 更新: 2026-07-29

BaZi Master 是一个自部署的**算法能力层**：把八字、紫微、塔罗、周易、星座、合盘这些
推算逻辑，连同可选的 AI 解读，收敛成一套文档化的 HTTP 接口。它不含界面，也不服务 C 端 ——
界面、账号、持久化都属于调用方。

## 一句话架构

**无状态纯计算 + 一个可选的缓存。**

进程本身不持有任何跨请求状态：没有数据库、没有会话、没有用户、不写文件。
唯一的外部依赖 Redis 是纯缓存，摘掉它服务照常工作，只是跨实例的排盘缓存命中率下降。

这条约束是整个设计的支点，它直接决定了：

- 扩容就是多起几个进程，不需要粘性会话，也不需要协调
- 部署可以随时整体销毁重建：没有迁移、没有备份恢复、没有数据一致性问题
- 测试不需要任何服务容器
- 排查故障时不存在「数据脏了」这一类可能性 —— 同样输入必然同样输出

```
调用方（你的后端 / 客户端 / AI Agent）
        │  HTTP + JSON
        ▼
┌──────────────────────────────────────────┐
│  Express 中间件链                        │
│  helmet → CORS → compression →           │
│  requestId → json → validation →         │
│  pino 日志 → urlLength → rateLimit       │
├──────────────────────────────────────────┤
│  routes/        HTTP 入口，只做参数编解码│
│  controllers/   少数几条路由的处理函数   │
│  services/      全部算法与业务逻辑       │
│  constants/ data/  干支、星曜、塔罗、卦象│
└──────────────────────────────────────────┘
        │                    │
        ▼                    ▼
   Redis（可选，纯缓存）   AI Provider（可选）
                          OpenAI / Anthropic / mock
```

## 目录结构

```text
bazi-master/
├── backend/
│   ├── server.js            # 组装中间件链、挂路由、优雅停机、启动校验
│   ├── bootstrap/           # asyncRoutes：给 Express 4 打异步错误传播的补丁
│   ├── config/              # app（配置读取与校验）、logger（pino）、redis
│   ├── routes/              # bazi / ziwei / liuyao / liuren / qimen / fengshui
│   │                        # tarot / iching / zodiac / synastry / calendar
│   │                        # locations / ai / api
│   ├── controllers/         # calendar / synastry / zodiac 三条路由的处理函数
│   ├── services/            # 算法与业务逻辑，见下表
│   ├── middleware/          # cors / docs / error / rateLimit / requestId
│   │                        # security / urlLength / validation
│   ├── constants/           # ganzhi / shensha / stems / ziwei / liuyao
│   │                        # liuren / qimen / bazhai / zodiac 静态表
│   ├── data/                # 塔罗牌库、六十四卦（含真卦名，易经与六爻共用）
│   ├── lib/concurrency.js   # AI 并发闸
│   ├── utils/               # express / http / redact / timezone / validation
│   ├── scripts/             # start.mjs（容器入口）、generate-openapi.js
│   └── test/                # 后端测试
│
├── tools/cli/               # ./bazi 程序化 CLI（能力命令 + 仓库运维命令）
├── docs/                    # API、架构、开发、FAQ、OpenAPI 快照
└── scripts/                 # CI 守卫与部署验证脚本
```

没有 `prisma/`、没有 `docker/`、没有备份脚本 —— 存储层删除时它们一起走了。

## services 的分工

| 文件                   | 职责                                                               |
| ---------------------- | ------------------------------------------------------------------ |
| `calculations.service` | 八字**排盘**：定排盘时刻、四柱、五行个数、十神、大运               |
| `bazi.service`         | 八字**断命**：藏干加权、旺衰、用神、神煞、刑冲合会                 |
| `ganzhi.service`       | 干支关系判定层：纳音、藏干、长生、合冲刑害破会、旬空、五行局       |
| `jieqi.service`        | 节气交接时刻，**精确到分**；八字、六壬月将、奇门定局、八宅定年共用 |
| `ziwei.service`        | 紫微斗数：农历换算、五行局、十二宫、安星、四化、大限流年           |
| `tarot.service`        | 塔罗牌阵与抽牌                                                     |
| `iching.service`       | 起卦与变爻（卦名数据在 `data/ichingHexagrams.js`，与六爻共用）     |
| `liuyao.service`       | 六爻纳甲：八宫推衍、装卦、六亲六神、伏神、动爻变卦                 |
| `liuren.service`       | 大六壬：月将、天地盘、四课、三传九宗门、十二天将                   |
| `qimen.service`        | 奇门遁甲：三元定局、地盘三奇六仪、值符值使、转盘排星门神           |
| `fengshui.service`     | 八宅命卦与游年、择吉历注、姓名五格三才                             |
| `zodiac.service`       | 星座信息、运势、上升星座、配对                                     |
| `synastry.service`     | 合盘：日主十神、夫妻宫合冲刑害、交叉柱关系、五行互补               |
| `solarTime.service`    | 真太阳时校正（经度差 + 均时差）与地点表                            |
| `ai.service`           | AI 供应商适配、超时、流式空闲超时                                  |
| `prompts.service`      | 各类解读的提示词模板                                               |
| `cache.service`        | 八字排盘缓存（进程内 + 可选 Redis 镜像）                           |
| `health.service`       | 深度健康检查与结果快照缓存                                         |
| `metrics.service`      | Prometheus 文本格式指标                                            |
| `lifecycle.service`    | 优雅停机与排水状态                                                 |
| `apiSchema.service`    | OpenAPI 规格的唯一来源，`docs/openapi.json` 由它生成               |

## 数据流

一次八字排盘的完整路径：

```
POST /api/bazi/calculate
  → validation.middleware  形状护栏（数组长度、嵌套深度、键数、字符串长度）
  → rateLimit.middleware   限流（生产默认开，开发默认关）
  → routes/bazi.js         参数解析
  → cache.service          查缓存（键覆盖全部排盘输入），命中直接返回
  → calculations.service   resolveChartTime 定出排盘时刻
  → solarTime.service      算真太阳时校正值，校正后的时刻**参与排盘**
  → calculations.service   lunar-javascript 排四柱 + 藏干加权、旺衰、用神、神煞、刑冲合会
  → 写回缓存，返回，响应头带 x-bazi-cache: hit|miss
```

**缓存键必须覆盖全部排盘输入。** 基础是 `年-月-日-时-性别`，另以后缀追加会影响排盘的因子：
出生地、分钟、时区、以及 `trueSolarTime: false` 开关。真太阳时接进排盘之后这些就是排盘输入
的一部分 —— 不进键会让同一生辰不同出生地互相命中对方的盘。

以后再往排盘输入里加任何因子（流派开关、节气口径等），**必须同步加进这个键**。

## 缓存策略

两层，都是纯缓存，都可以整个失效而不影响正确性：

1. **进程内 LRU** —— `BAZI_CACHE_TTL_MS`（默认 6h）、`BAZI_CACHE_MAX_ENTRIES`（默认 500）
2. **Redis 镜像** —— 配了 `REDIS_URL` 才有，作用是让多个实例共享第 1 层的结果

不配 Redis 时每个实例各算各的，结果完全一致，只是命中率低。
`GET /api/system/cache-status` 能看到 Redis 连通性和镜像是否生效。

## 并发控制

`lib/concurrency.js` 是一道 AI 并发闸：AI 解读接口限制同时在飞的请求数，
超出直接 429（CLI 会把它翻译成退出码 5，可重试）。

排盘类接口不走这道闸 —— 它们是纯 CPU 计算，没有外部依赖，限流本身就够了。

AI 请求还有两层超时：`fetchWithTimeout` 管到响应头为止，`fetchStreamWithTimeout`
额外管流式响应的**空闲超时**。后者是必要的：一个发完响应头就卡住的供应商，
会让读循环永远等一个不会到来的分片，占着 socket 和调用方的并发槽直到进程重启。

## 安全机制

| 层面     | 措施                                                               |
| -------- | ------------------------------------------------------------------ |
| HTTP 头  | helmet                                                             |
| CORS     | 白名单，来源取自 `CORS_ALLOWED_ORIGINS`；无 Origin 的调用不受影响  |
| 输入     | 请求体大小、URL 长度、数组长度、嵌套深度、键数、字符串长度都有上限 |
| 限流     | 生产默认开启，按来源计；`TRUST_PROXY` 必须填跳数而不是 `true`      |
| 文档端点 | `/api-docs` Basic Auth，生产模式下 `DOCS_PASSWORD` 缺失则拒绝启动  |
| 指标端点 | `/metrics` 需要 Bearer token，未配置时在生产返回 404               |
| 错误响应 | 生产 5xx 不回内部细节，详细错误只进日志                            |
| 日志     | `utils/redact.js` 对敏感字段脱敏                                   |

`TRUST_PROXY=true` 等于信任任意 `X-Forwarded-For`，限流会被一个伪造请求头绕过。
所以配置读取那里刻意把数字保持为数字（`parseTrustProxy`），一层 nginx 就填 `1`。

## 日志与可观测性

- **请求日志**：pino JSON，每条带 request id
- **健康检查**：`/live`（只看进程）、`/health` 和 `/api/ready`（含依赖，带快照缓存）
- **指标**：`/metrics`，Prometheus 文本格式
- **错误追踪**：Sentry 可选，支持 environment / release / 采样率

`/health` 与 `/api/ready` 的分工很重要：前者驱动容器 healthcheck 和 autoheal（**重启**），
后者给负载均衡（**摘流**）。深度检查失败时该做的是摘流而不是重启 —— 详见
[PRODUCTION.md](../PRODUCTION.md)。

## 优雅停机

收到 SIGTERM 之后：

1. `/health` 和 `/api/ready` **立即**转 503（实测 +2ms）
2. 保持服务 `SHUTDOWN_DRAIN_MS`，让负载均衡把本实例摘掉
3. 关闭监听，等在途请求结束，最多再等 `GRACEFUL_SHUTDOWN_TIMEOUT_MS`
4. 退出

排水窗口必须小于编排层的 stop grace period，否则会被 SIGKILL 打断。
默认 5000 只够被动检查的 nginx；k8s 和 ALB 的默认探测节奏要大得多，
对照表在 [env.production.template](../env.production.template)。

## 测试

| 目标      | 内容                                                | 位置              |
| --------- | --------------------------------------------------- | ----------------- |
| `cli`     | CLI 契约：退出码语义、`--json` 单文档、安全闸不可绕 | `tools/cli/test/` |
| `lint`    | 根级 ESLint + Prettier                              | —                 |
| `backend` | 路由、服务、中间件、配置、健康检查、限流            | `backend/test/`   |

全部用 `./bazi test` 跑。**测试不需要任何外部服务** —— 这是无状态设计换来的直接好处。

## 相关文档

- [api.md](api.md) —— HTTP 接口清单
- [development.md](development.md) —— 本地开发
- [faq.md](faq.md) —— 常见问题
- [../PRODUCTION.md](../PRODUCTION.md) —— 生产部署与运维
- [../.claude/skills/bazi-cli/SKILL.md](../.claude/skills/bazi-cli/SKILL.md) —— 算法语义边界与 CLI 用法
