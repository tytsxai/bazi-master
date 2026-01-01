# BaZi Master API 文档

> 版本: v0.1.2-dev | 更新: 2025-12-30

本文件概述当前代码中实际实现的 HTTP API。所有响应均为 JSON；时间戳采用 ISO 8601。

## 目录

- [认证](#认证)
- [AI 提供商](#ai-提供商)
- [八字 (BaZi)](#八字-bazi)
- [塔罗 (Tarot)](#塔罗-tarot)
- [周易 (I Ching)](#周易-i-ching)
- [星座 (Zodiac)](#星座-zodiac)
- [紫微 (Zi Wei)](#紫微-zi-wei-需认证)
- [收藏 (Favorites)](#收藏-favorites-需认证)
- [用户设置 (User)](#用户设置-user-需认证)
- [日历 (Calendar)](#日历-calendar-需认证)
- [媒体 (Media)](#媒体-media-需认证)
- [位置搜索 (Locations)](#位置搜索-locations)
- [合盘 (Synastry)](#合盘-synastry)
- [系统诊断 (System)](#系统诊断-system-需认证)
- [管理端 (Admin)](#管理端-admin-需认证--管理员)
- [健康检查](#健康检查)
- [错误格式](#错误格式)

## 认证

- 登录/注册返回 `token`，同时写入 `bazi_session` cookie；后续请求可用 Bearer 或 cookie 认证。
- 提供密码重置与 OAuth（Google/WeChat）入口；自助删除账号通过 `DELETE /api/auth/me`。

### POST /api/auth/register

请求：`{ email, password, name? }`
响应：`{ token, user: { id, email, name, isAdmin } }`

### POST /api/auth/login

请求：`{ email, password }`
响应同上。

### POST /api/auth/logout _(需认证)_

可在 Header 携带 Bearer Token，或 Body `token`。

### POST /api/auth/password/request

请求：`{ email }`
响应：`{ message }`（始终返回统一提示，避免泄露用户是否存在；若密码重置被禁用或邮件未配置，返回 503）

### POST /api/auth/password/reset

请求：`{ token, password }`
响应：`{ status: "ok" }`

### GET /api/auth/google

OAuth 入口（302 重定向）。

### GET /api/auth/google/callback

OAuth 回调（设置 session cookie 并重定向前端）。

### GET /api/auth/wechat/redirect

WeChat OAuth 入口（302 重定向）。

### GET /api/auth/wechat/callback

WeChat OAuth 回调（设置 session cookie 并重定向前端）。

### GET /api/auth/me _(需认证)_

返回当前用户信息。

### DELETE /api/auth/me _(需认证)_

自助删除账号及关联数据。

## AI 提供商

### GET /api/ai/providers

返回当前 active provider 与可用 provider 列表；无密钥时 `activeProvider` 通常为 `mock`。

## 八字 (BaZi)

- 公开：计算
- 需认证：AI 解读与记录 CRUD

### POST /api/bazi/calculate

请求：`{ birthYear, birthMonth, birthDay, birthHour, gender, birthLocation?, timezone?, birthMinute?, timezoneOffsetMinutes? }`
响应：排盘结果（pillars、fiveElements、tenGods、luckCycles、trueSolarTime 等）。

### POST /api/bazi/ai-interpret _(需认证)_

请求：`{ pillars, fiveElements, tenGods?, luckCycles?, strength?, provider? }`
响应：`{ content }`

### POST /api/bazi/full-analysis _(需认证)_

请求：同 calculate 输入，可选 `provider`。
响应：`{ calculation, interpretation, ...timeMeta }`

### GET /api/bazi/records _(需认证)_

查询参数：`page`, `limit`, `status` (active/deleted/all), `gender`, `q` (搜索), `sort` (created-desc/created-asc/birth-desc/birth-asc)
响应：`{ records: [...], totalCount, filteredCount }`

### POST /api/bazi/records _(需认证)_

保存计算并返回记录。自动检测 60 秒内的重复记录。
响应：`{ record }`

### GET /api/bazi/records/export _(需认证)_

导出记录（最多 2000 条）。
查询参数：同 GET /api/bazi/records，额外支持 `includeDeletedStatus=1`
响应：`[{ ...record, softDeleted? }, ...]`

### POST /api/bazi/records/import _(需认证)_

批量导入记录。
请求：`{ records: [{ birthYear, birthMonth, birthDay, birthHour, gender, softDeleted? }, ...] }`
响应：`{ created: number }`

### POST /api/bazi/records/bulk-delete _(需认证)_

批量软删除记录。
请求：`{ ids: [number, ...] }`
响应：`{ status: "ok" }`

### GET /api/bazi/records/:id _(需认证)_

获取单条记录详情。
响应：`{ record }`

### DELETE /api/bazi/records/:id _(需认证)_

软删除记录（移入回收站）。
响应：`{ status: "ok" }`

### POST /api/bazi/records/:id/restore _(需认证)_

恢复已删除的记录。
响应：`{ status: "ok" }`

### DELETE /api/bazi/records/:id/hard-delete _(需认证)_

永久删除记录（不可恢复）。
响应：`{ status: "ok" }`

## 塔罗 (Tarot)

- 公开：抽牌、牌组数据
- 需认证：AI 解读与历史

### GET /api/tarot/cards

返回 78 张塔罗牌完整数据。
响应：`{ cards: [...] }`

### POST /api/tarot/draw

请求：`{ spreadType?: "SingleCard" | "ThreeCard" | "CelticCross" }`
响应：抽取的牌阵。

### POST /api/tarot/ai-interpret _(需认证, 严格 auth)_

请求：`{ spreadType?, cards, userQuestion?, provider? }`
响应：`{ content }`（并自动写入历史）。

### GET /api/tarot/history _(需认证)_

响应：`{ records: [{ id, spreadType, userQuestion, aiInterpretation, cards, createdAt }, ...] }`

### DELETE /api/tarot/history/:id _(需认证)_

响应：`{ success: true }`

## 周易 (I Ching)

- 公开：卦象数据、起卦
- 需认证：AI 解读与历史

### GET /api/iching/hexagrams

返回 64 卦数据。
响应：`{ hexagrams: [...] }`

### POST /api/iching/divine

请求：`{ method?: "number" | "time", numbers?: [a,b,c] }`
响应：`{ hexagram, changingLines, timeContext?, method }`

### POST /api/iching/ai-interpret _(需认证)_

请求：`{ hexagram, userQuestion?, method?, changingLines?, timeContext?, provider? }`
响应：`{ content }`（并自动写入历史）

### POST /api/iching/history _(需认证)_

手动保存起卦记录。
请求：`{ method, numbers?, hexagram, resultingHexagram?, changingLines?, timeContext?, userQuestion?, aiInterpretation? }`
响应：`{ record }`

### GET /api/iching/history _(需认证)_

响应：`{ records: [...] }`

### DELETE /api/iching/history/:id _(需认证)_

响应：`{ status: "ok" }`

## 星座 (Zodiac)

全部公开。

- `GET /api/zodiac/:sign` — 基本信息
- `GET /api/zodiac/:sign/horoscope?period=daily|weekly|monthly`
- `GET /api/zodiac/compatibility?primary=&secondary=`
- `POST /api/zodiac/rising` — 输入生日、时间、经纬度、时区计算上升星座

## 紫微 (Zi Wei) _(需认证)_

### POST /api/ziwei/calculate

请求：`{ birthYear, birthMonth, birthDay, birthHour, gender }`
响应：紫微斗数排盘结果（含 timeMeta）

### POST /api/ziwei/history

保存排盘记录。
请求：`{ birthYear, birthMonth, birthDay, birthHour, gender }`
响应：`{ record }`

### GET /api/ziwei/history

查询参数：`limit` (默认 30，最大 100)
响应：`{ records: [...] }`

### DELETE /api/ziwei/history/:id

响应：`{ status: "ok" }`

## 收藏 (Favorites) _(需认证)_

### GET /api/favorites

响应：`{ favorites: [{ id, userId, recordId, record, createdAt }, ...] }`

### POST /api/favorites

请求：`{ recordId }`
响应：`{ favorite: { id, userId, recordId, record, createdAt } }`
错误：409 已收藏

### DELETE /api/favorites/:id

响应：`{ status: "ok" }`

## 用户设置 (User) _(需认证)_

### GET /api/user/settings

响应：`{ settings: { locale?, preferences? } }`

### PUT /api/user/settings

请求：`{ locale?, preferences? }`
响应：`{ settings }`

## 日历 (Calendar) _(需认证)_

### GET /api/calendar/daily

获取每日运势。
查询参数：`birthYear`, `birthMonth`, `birthDay`, `birthHour`, `gender`（提供任意出生参数时需全部提供，否则返回 400）
响应：每日运势数据

## 媒体 (Media) _(需认证)_

### POST /api/media/soul-portrait

生成灵魂画像（AI 图片）。
请求：`{ baziData: { dayMasterElement, strongestElement, dominantTenGod? } }`
响应：`{ imageUrl }` 或 mock 数据

## 位置搜索 (Locations)

### GET /api/locations

查询参数：`search`
响应：地点列表（当前为占位数据）

## 合盘 (Synastry)

### POST /api/synastry/analyze

八字合盘分析。
请求：`{ personA, personB }`（两人八字输入）
响应：合盘分析结果

## 系统诊断 (System) _(需认证)_

### GET /api/system/cache-status

获取缓存状态。
响应：`{ redis, sessionCache: { mirror }, baziCache: { mirror } }`

## 管理端 (Admin) _(需认证 + 管理员)_

### GET /api/admin/health

管理员健康检查（含 WebSocket 指标）。
响应：健康状态与 WebSocket 连接统计

## 健康检查

### GET /live

存活检查（仅进程存活，不依赖数据库/Redis）。
响应：`{ service, status: "alive", timestamp, uptime }`

### GET /health

深度健康检查（数据库/Redis）。
响应：`{ service, status: "ok"|"degraded", checks: { db, redis }, timestamp, uptime }`

### GET /api/live

同 `/live`，用于前端/工具探测。

### GET /api/health

同 `/health`，用于前端/工具探测。

### GET /api/ready

依赖就绪检查。
响应：`{ service, status: "ready"|"not_ready", checks: { db, redis }, timestamp, uptime }`

## 错误格式

```
{ "error": "message" }
```

HTTP 状态码：400 参数错误；401 未认证；403 禁止；404 未找到；409 冲突；429 频率限制；500/503 服务器错误。
