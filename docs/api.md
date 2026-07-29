# BaZi Master API 文档

> 版本: v0.2.0 | 更新: 2026-07-29

引擎是**无状态的纯计算服务**：不存数据、不认用户、没有数据库。
所有业务接口都是公开的 —— 没有注册、登录、会话、token，也没有历史记录、收藏、用户设置这些概念。
调用方（你的后端、你的客户端、或者一个 AI Agent）自己决定要不要保存结果。

唯一带鉴权的是 `/api-docs`（Basic Auth）和 `/metrics`（Bearer token），它们是运维面，不是业务面。

**机器可读的契约是 [openapi.json](openapi.json)**，运行时挂在 `/api-docs`。
这份文档是给人读的导览；两边不一致时以 `openapi.json` 为准 —— 它由
`backend/services/apiSchema.service.js` 生成，CI 会比对快照，不会腐化。

- Base URL（本地）：`http://127.0.0.1:4000`
- Swagger UI：`/api-docs`
- OpenAPI JSON：`/api-docs.json`
- 所有响应都是 JSON；时间戳用 ISO 8601

## 目录

- [约定](#约定)
- [八字 BaZi](#八字-bazi)
- [紫微斗数 Zi Wei](#紫微斗数-zi-wei)
- [塔罗 Tarot](#塔罗-tarot)
- [周易 I Ching](#周易-i-ching)
- [星座 Zodiac](#星座-zodiac)
- [合盘 Synastry](#合盘-synastry)
- [日历 Calendar](#日历-calendar)
- [地点 Locations](#地点-locations)
- [AI 供应商](#ai-供应商)
- [健康检查与运维](#健康检查与运维)
- [错误格式](#错误格式)

## 约定

出生信息在所有排盘类接口里是同一组字段：

| 字段                    | 必填 | 说明                                                                   |
| ----------------------- | ---- | ---------------------------------------------------------------------- |
| `birthYear`             | ✓    | 1–9999                                                                 |
| `birthMonth`            | ✓    | 1–12                                                                   |
| `birthDay`              | ✓    | 1–31                                                                   |
| `birthHour`             | ✓    | 0–23                                                                   |
| `birthMinute`           |      | 0–59，默认 0                                                           |
| `gender`                | ✓    | `male` / `female`                                                      |
| `birthLocation`         |      | 地名或 `"纬度,经度"`。只用于真太阳时，认得的地名见 `GET /api/locations` |
| `timezone`              |      | IANA 时区名，如 `Asia/Shanghai`                                        |
| `timezoneOffsetMinutes` |      | 给了就优先于 `timezone`，供无法解析 IANA 名的调用方使用                 |

关于时刻，有两点要清楚（都不会报错，只会给出另一张盘）：

- **真太阳时参与排盘。** 只要 `birthLocation` 能解析出经度、且时区已知，四柱就按校正后的
  时刻排。经度每偏离标准经线 1 度差 4 分钟，中国西部足以把时柱推到隔壁一柱。
  响应的 `chartTime.used` 是实际用于排盘的时刻，`chartTime.trueSolarTime.clockTime`
  保留原始钟表时间，两者可直接对照。传 `trueSolarTime: false` 可关掉，退回按钟表时间排。
- **`birthMinute` 参与真太阳时，进而影响四柱。** 校正量按分钟计算，落在时辰交界上时，
  分钟会决定落在哪一柱。不给则按 0 分处理。

更多这类边界见 [.claude/skills/bazi-cli/SKILL.md](../.claude/skills/bazi-cli/SKILL.md)。

AI 解读类接口（`*/ai-interpret`、`full-analysis`）都接受一个可选的 `provider` 字段
（`openai` / `anthropic` / `mock`），覆盖服务端默认值；填了不可用的供应商返回 400。

## 八字 BaZi

### POST /api/bazi/calculate

排盘。请求体见[约定](#约定)。响应分两层：

- 顶层的 `pillars` / `fiveElements` / `tenGods` / `luckCycles` 是原有字段，语义未变
  （`fiveElements` 仍是天干与地支本气的**个数**统计）。
- `analysis` 是断命层，也是该拿去做判断的那一份：
  - `weightedElements` — 藏干加权五行。天干各 1 分，地支按本气/中气/余气权重分配，
    月支当令 ×2。与 `fiveElements` 的个数统计不是一回事。
  - `strength` — 身强/身弱/中和，含同党占比、是否得令、在哪几柱有根。
  - `usefulGod` — 扶抑法用神喜忌。中和局不硬凑用神，会说明改用调候或病药法。
  - `pillarDetails` — 逐柱的藏干全展开（含中气余气）、各自十神、纳音、日主在该支的十二长生。
  - `shensha` — 神煞，标注 `basis` 说明是按日干还是年支/日支起的。
  - `relations` — 四柱之间的刑冲合会害破，三合区分全合与半合。
  - `xunkong` — 日柱所在旬的空亡。
- `luckStart` 给出起运还需几年几月几天与交运公历日期；`luckCycles` 每步带 `liuNian` 逐年流年。

```bash
curl -X POST http://127.0.0.1:4000/api/bazi/calculate \
  -H "Content-Type: application/json" \
  -d '{"birthYear":1990,"birthMonth":5,"birthDay":20,"birthHour":14,"gender":"male",
       "birthLocation":"Beijing","timezone":"Asia/Shanghai"}'
```

响应头 `x-bazi-cache: hit|miss` 告诉你这次是否命中缓存。缓存键以
`年-月-日-时-性别` 为基础；因为真太阳时会改写时柱，出生地、分钟、时区与
`trueSolarTime: false` 也会进键（以后缀形式追加），否则不同出生地会互相命中对方的盘。

### POST /api/bazi/ai-interpret

对一张已经排好的盘做 AI 解读。必填 `pillars`，可选 `fiveElements` / `tenGods` /
`luckCycles` / `strength` / `provider`。

### POST /api/bazi/full-analysis

排盘 + 解读一次完成。请求体 = 排盘字段 + 可选 `provider`。

## 紫微斗数 Zi Wei

### POST /api/ziwei/calculate

排盘，返回十二宫、十四主星、六吉六煞、四化、大限。必填 `birthYear` / `birthMonth` /
`birthDay` / `birthHour` / `gender`，可选 `birthMinute`。

安星链条是「命宫 → 命宫干支 → 纳音 → 五行局 → 紫微 → 天府 → 十四主星 → 六吉六煞」，
五行局是整条链的根。响应里 `fiveElementBureau` 给出局别、局数与所据纳音，
`starPositions` 给出紫微天府落宫，出错时可以顺着这两个字段回溯。

各宫的 `stars` 分 `major`（十四主星）/ `minor`（文昌文曲左辅右弼天魁天钺禄存天马）/
`malefic`（擎羊陀罗火星铃星地空地劫）三组。`majorPeriods` 是十二步大限，
起限岁数即局数，顺逆按阳男阴女顺行、阴男阳女逆行 —— 所以 `gender` 会影响大限方向。

闰月按「归本月」处理：闰二月与二月落同一个月支。响应里 `lunar.month` 给的是正数，
是否闰月看 `lunar.isLeap` —— 两个字段要合起来读。

星曜庙旺利陷暂未实现（各家分歧大，需先定底本），响应里不会有该字段。

## 塔罗 Tarot

### GET /api/tarot/cards

完整牌库。

### POST /api/tarot/draw

抽牌。可选 `spreadType`：`SingleCard` / `ThreeCard` / `CelticCross`。

**同样输入不保证同样输出** —— 每次重新随机，不要拿它做幂等重试或断言。

### POST /api/tarot/ai-interpret

必填 `cards`（至少一张），可选 `spreadType` / `userQuestion` / `provider`。

## 周易 I Ching

### GET /api/iching/hexagrams

六十四卦全表。

### POST /api/iching/divine

起卦。给 `numbers` 时是确定性的；`method: time` 由调用时刻决定卦象，不可复现。

### POST /api/iching/ai-interpret

必填 `hexagram`（卦名字符串或完整卦象对象都接受），可选 `userQuestion` / `method` / `provider`。

## 星座 Zodiac

| 方法 | 路径                           | 参数                                  |
| ---- | ------------------------------ | ------------------------------------- |
| GET  | `/api/zodiac/{sign}`           | `sign` 路径参数                       |
| GET  | `/api/zodiac/{sign}/horoscope` | `sign` 路径参数，`period` 查询参数    |
| GET  | `/api/zodiac/compatibility`    | `primary`、`secondary` 查询参数，必填 |
| POST | `/api/zodiac/rising`           | 见下                                  |

`POST /api/zodiac/rising` 计算上升星座，必填 `birthDate`、`birthTime`、
`timezoneOffsetMinutes`、`latitude`、`longitude`。

## 合盘 Synastry

### POST /api/synastry/analyze

两组出生信息的相性分析。必填 `personA` 和 `personB`，各自是一组[约定](#约定)里的出生字段。

## 日历 Calendar

### GET /api/calendar/daily

当日日柱与流日运势。全部查询参数可选：`birthYear`、`birthMonth`、`birthDay`、
`birthHour`、`gender` —— 给了就结合本命盘，不给就只返回当日信息。

## 地点 Locations

### GET /api/locations

真太阳时校正认得的地点表（33 个城市）。可选 `search` 查询参数做过滤。

表里没有的地名**不报错**，只是不做校正（`trueSolarTime.applied: false`）。
要绕开这张表，直接给坐标串 `"30.27,120.15"`，这条路径永远可靠。

## AI 供应商

### GET /api/ai/providers

当前生效的供应商和可用列表。未配置任何密钥时是 `mock`。

## 健康检查与运维

| 方法 | 路径                       | 说明                                                  |
| ---- | -------------------------- | ----------------------------------------------------- |
| GET  | `/live`                    | 存活探针，只看进程，不查依赖                          |
| GET  | `/health`                  | 深度健康检查（含 Redis），排水期间返回 503            |
| GET  | `/api/live`                | `/live` 的 `/api` 前缀别名                            |
| GET  | `/api/health`              | `/health` 的 `/api` 前缀别名                          |
| GET  | `/api/ready`               | 就绪探针，给负载均衡用；排水期间立即 503              |
| GET  | `/api/system/cache-status` | Redis 连通性与八字缓存镜像状态                        |
| GET  | `/metrics`                 | Prometheus 文本格式；需要 `METRICS_TOKEN` Bearer 鉴权 |

`/metrics` 在没配 `METRICS_TOKEN` 时，生产环境返回 404 —— 视为未暴露，这是刻意的默认值。

健康检查结果带缓存（`HEALTH_CACHE_TTL_MS`，默认 1000ms）：`/health` 注册在限流之前，
探针永远不会被限流，这也意味着没有缓存的话一个无鉴权请求循环会变成无上限的检查负载。

## 错误格式

所有错误都是同一个形状：

```json
{ "error": "错误信息" }
```

| 状态码 | 含义                                   |
| ------ | -------------------------------------- |
| 400    | 参数校验失败（含不可用的 AI provider） |
| 404    | 路径不存在                             |
| 429    | 命中限流                               |
| 500    | 引擎内部错误                           |
| 503    | 依赖不可用，或进程正在排水             |

用 `./bazi` CLI 调用时，这些状态码已经被翻译成退出码（3 = 没就绪 / 4 = 请求被拒 /
5 = 可重试 / 1 = 引擎内部错），不需要自己判断。
见 [.claude/skills/bazi-cli/SKILL.md](../.claude/skills/bazi-cli/SKILL.md)。
