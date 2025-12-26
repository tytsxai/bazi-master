# BaZi Master API 文档

本文件概述当前代码中实际实现的 HTTP API。所有响应均为 JSON；时间戳采用 ISO 8601。

## 认证
- Bearer Token：登录/注册成功后返回 `token`，后续请求在 Header 中携带 `Authorization: Bearer <token>`。
- 无密码找回/重置接口；自助删除账号通过 `DELETE /api/auth/me`。

### POST /api/auth/register
请求：`{ email, password, name? }`
响应：`{ token, user: { id, email, name, isAdmin } }`

### POST /api/auth/login
请求：`{ email, password }`
响应同上。

### POST /api/auth/logout *(需认证)*
可在 Header 携带 Bearer Token，或 Body `token`。

### GET /api/auth/me *(需认证)*
返回当前用户信息。

### DELETE /api/auth/me *(需认证)*
自助删除账号及关联数据。

## AI 提供商
### GET /api/ai/providers
返回当前 active provider 与可用 provider 列表；无密钥时 `activeProvider` 通常为 `mock`。

## 八字 (BaZi)
- 公开：计算
- 需认证：AI 解读与记录 CRUD

### POST /api/bazi/calculate
请求：`{ birthYear, birthMonth, birthDay, birthHour, gender, ... }`
响应：排盘结果（pillars、fiveElements、tenGods 等）。

### POST /api/bazi/ai-interpret *(需认证)*
请求：`{ pillars, fiveElements, tenGods?, luckCycles?, strength?, provider? }`
响应：`{ content }`

### POST /api/bazi/full-analysis *(需认证)*
请求：同 calculate 输入，可选 `provider`。
响应：`{ calculation, interpretation }`

### GET /api/bazi/records *(需认证)*
查询参数：`page`, `limit`（内部使用安全值）。
响应：`{ records: [...] }`

### POST /api/bazi/records *(需认证)*
保存计算并返回记录。

### GET /api/bazi/records/:id *(需认证)*

### DELETE /api/bazi/records/:id *(需认证)*

## 塔罗 (Tarot)
- 公开：抽牌
- 需认证：AI 解读与历史

### POST /api/tarot/draw
请求：`{ spreadType?: "SingleCard" | "ThreeCard" | "CelticCross" }`
响应：抽取的牌阵。

### POST /api/tarot/ai-interpret *(需认证, 严格 auth)*
请求：`{ spreadType?, cards, userQuestion?, provider? }`
响应：`{ content }`（并尝试写入历史）。

### GET /api/tarot/history *(需认证)*

### DELETE /api/tarot/history/:id *(需认证)*

### GET /api/tarot/cards
返回 78 张塔罗牌完整数据。

## 周易 (I Ching)
### GET /api/iching/hexagrams
返回 64 卦数据。

### POST /api/iching/divine
请求：`{ method?: "number" | "time", numbers?: [a,b,c] }`
响应：`{ hexagram, changingLines, timeContext?, method }`

### POST /api/iching/ai-interpret *(需认证)*
请求：`{ hexagram, userQuestion?, method?, timeContext? }`
响应：`{ content }`

## 星座 (Zodiac)
全部公开。

- `GET /api/zodiac/:sign` — 基本信息
- `GET /api/zodiac/:sign/horoscope?period=daily|weekly|monthly`
- `GET /api/zodiac/compatibility?primary=&secondary=`
- `POST /api/zodiac/rising` — 输入生日、时间、经纬度、时区计算上升星座

## 紫微 (Zi Wei) *(需认证)*
- `POST /api/ziwei/calculate`
- `POST /api/ziwei/history`
- `GET /api/ziwei/history`
- `DELETE /api/ziwei/history/:id`

## 收藏 (Favorites) *(需认证)*
- `GET /api/favorites`
- `POST /api/favorites` — Body `{ recordId }`
- `DELETE /api/favorites/:id`

## 健康检查
- `GET /health` — 应用存活
- `GET /api/health` — 供前端开发 server 启动探测
- `GET /api/ready` — 依赖就绪（数据库/Redis）

## 错误格式
```
{ "error": "message" }
```
HTTP 状态码：400 参数错误；401 未认证；403 禁止；404 未找到；409 冲突；429 频率限制；500/503 服务器错误。
