# BaZi Master API Documentation

## 概述

BaZi Master API 提供了完整的算命平台后端服务，支持八字、塔罗、周易、星座和紫微斗数等功能。

## 认证

API 使用 JWT (JSON Web Token) 进行认证。大部分高级功能需要用户登录后获取 token。

### 获取 Token

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}
```

响应:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "用户名"
  }
}
```

### 使用 Token

在请求头中包含 Authorization:

```
Authorization: Bearer <your-jwt-token>
```

## 健康检查

### GET /health

检查应用健康状态。

**响应:**
```json
{
  "status": "ok",
  "service": "bazi-master-backend",
  "timestamp": "2025-12-26T10:00:00.000Z",
  "uptime": 3600.5
}
```

### GET /api/ready

检查数据库和Redis连接状态。

**响应:**
```json
{
  "status": "ready",
  "checks": {
    "db": { "ok": true },
    "redis": { "ok": true }
  },
  "timestamp": "2025-12-26T10:00:00.000Z"
}
```

## 八字模块

### POST /api/bazi/calculate (公开)

基础八字排盘计算。

**请求:**
```json
{
  "birthYear": 1990,
  "birthMonth": 5,
  "birthDay": 15,
  "birthHour": 14,
  "gender": "male",
  "birthLocation": "Beijing, China"
}
```

**响应:**
```json
{
  "pillars": "庚午 乙巳 壬申 庚申",
  "fiveElements": { "wood": 2, "fire": 3, "earth": 1, "metal": 2, "water": 1 },
  "dayMaster": "壬",
  "dayMasterStrength": "偏弱"
}
```

### POST /api/bazi/full-analysis (需要认证)

完整八字分析，包括十神、大运、流年。

**响应:** 同上 + 十神分析、大运信息等

## 塔罗模块

### POST /api/tarot/draw (公开)

抽取塔罗牌。

**请求:**
```json
{
  "spread": "single" // "single", "three_card", "celtic_cross"
}
```

**响应:**
```json
{
  "cards": [
    {
      "id": 1,
      "name": "The Fool",
      "reversed": false,
      "position": "past"
    }
  ]
}
```

### GET /api/tarot/cards (公开)

获取所有塔罗牌信息。

**响应:**
```json
{
  "cards": [
    {
      "id": 1,
      "name": "The Fool",
      "chineseName": "愚者",
      "description": "...",
      "upright": "...",
      "reversed": "..."
    }
    // ... 其他77张牌
  ]
}
```

### POST /api/tarot/ai-interpret (需要认证)

AI 解读塔罗牌阵。

## 周易模块

### POST /api/iching/divine (公开)

周易起卦。

**请求:**
```json
{
  "method": "time" // "time", "number"
}
```

**响应:**
```json
{
  "hexagram": "乾",
  "hexagramNumber": 1,
  "judgment": "元亨利贞",
  "changingLines": [2, 5]
}
```

### GET /api/iching/hexagrams (公开)

获取所有64卦信息。

**响应:**
```json
{
  "hexagrams": [
    {
      "number": 1,
      "name": "乾",
      "chineseName": "乾卦",
      "judgment": "元亨利贞",
      "image": "..."
    }
    // ... 其他63卦
  ]
}
```

## 星座模块

### GET /api/zodiac/:sign (公开)

获取星座信息。

**参数:**
- `sign`: 星座名称 (aries, taurus, gemini, etc.)

**响应:**
```json
{
  "name": "Aries",
  "chineseName": "白羊座",
  "dates": "March 21 - April 19",
  "element": "fire",
  "rulingPlanet": "mars"
}
```

### GET /api/zodiac/:sign/horoscope (公开)

获取星座运势。

**查询参数:**
- `period`: daily, weekly, monthly (默认: daily)

### POST /api/zodiac/rising (公开)

计算上升星座。

**请求:**
```json
{
  "birthYear": 1990,
  "birthMonth": 5,
  "birthDay": 15,
  "birthHour": 14,
  "latitude": 39.9042,
  "longitude": 116.4074,
  "timezoneOffsetMinutes": 480
}
```

**响应:**
```json
{
  "risingSign": "scorpio",
  "risingDegree": 245.67
}
```

### GET /api/zodiac/compatibility (公开)

获取星座兼容性。

**查询参数:**
- `sign1`: 第一个星座
- `sign2`: 第二个星座

**响应:**
```json
{
  "compatibility": {
    "score": 85,
    "level": "excellent",
    "summary": "这两个星座非常兼容...",
    "highlights": ["共同目标", "相互理解"],
    "breakdown": {...}
  }
}
```

## 用户认证

### POST /api/auth/register

用户注册。

**请求:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "用户名"
}
```

### POST /api/auth/login

用户登录。

### GET /api/auth/me (需要认证)

获取当前用户信息。

### POST /api/auth/logout (需要认证)

用户登出。

### PUT /api/auth/profile (需要认证)

更新用户资料。

**请求:**
```json
{
  "name": "新用户名",
  "email": "newemail@example.com"
}
```

### POST /api/auth/change-password (需要认证)

修改密码。

**请求:**
```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword"
}
```

### POST /api/auth/forgot-password

忘记密码，发送重置邮件。

**请求:**
```json
{
  "email": "user@example.com"
}
```

### POST /api/auth/reset-password

重置密码。

**请求:**
```json
{
  "token": "reset-token",
  "newPassword": "newpassword"
}
```

## OAuth 认证

### Google OAuth

```
GET /api/auth/google
GET /api/auth/google/callback
```

### 微信 OAuth

```
GET /api/auth/wechat
GET /api/auth/wechat/callback
```

## 历史记录 (需要认证)

### GET /api/bazi/records

获取用户的八字记录。

**查询参数:**
- `page`: 页码 (默认: 1)
- `limit`: 每页数量 (默认: 10)

### GET /api/tarot/history

获取塔罗历史记录。

### GET /api/iching/history

获取周易历史记录。

## 收藏夹 (需要认证)

### GET /api/favorites

获取用户收藏。

### POST /api/favorites

添加收藏。

**请求:**
```json
{
  "recordType": "bazi", // "bazi", "tarot", "iching"
  "recordId": 123
}
```

### DELETE /api/favorites/:id

删除收藏。

## Zi Wei (紫微斗数) (需要认证)

### POST /api/ziwei/calculate

紫微斗数排盘计算。

**请求:**
```json
{
  "birthYear": 1990,
  "birthMonth": 5,
  "birthDay": 15,
  "birthHour": 14,
  "gender": "male",
  "birthLocation": "Beijing, China"
}
```

**响应:**
```json
{
  "chart": {
    "mainStars": [...],
    "minorStars": [...],
    "palaces": {...}
  },
  "analysis": {...}
}
```

## AI 功能 (需要认证)

### POST /api/ai/interpret

通用AI解读接口。

**请求:**
```json
{
  "type": "bazi", // "bazi", "tarot", "iching"
  "data": { /* 相关数据 */ },
  "question": "请详细解读这个八字"
}
```

### GET /api/ai/providers

获取可用的AI提供商。

**响应:**
```json
{
  "activeProvider": "openai",
  "providers": [
    { "name": "openai", "enabled": true },
    { "name": "anthropic", "enabled": true },
    { "name": "mock", "enabled": true }
  ]
}
```

### POST /api/ai/stream (需要认证)

流式AI解读（WebSocket推荐）。

**请求:**
```json
{
  "type": "bazi",
  "data": { /* 相关数据 */ },
  "question": "请详细解读这个八字",
  "stream": true
}
```

## 错误处理

### HTTP状态码
- `200`: 成功
- `201`: 资源创建成功
- `400`: 请求参数错误或无效数据
- `401`: 未认证或token无效
- `403`: 权限不足或禁止访问
- `404`: 资源不存在
- `409`: 资源冲突（如重复收藏）
- `422`: 请求数据无法处理
- `429`: 请求频率过高（超出速率限制）
- `500`: 服务器内部错误
- `503`: 服务不可用

### 错误响应格式
```json
{
  "error": "错误描述信息",
  "code": "ERROR_CODE" // 可选的错误代码
}
```

### 常见错误码
- `INVALID_TOKEN`: Token无效或过期
- `MISSING_AUTH`: 缺少认证信息
- `RATE_LIMITED`: 请求频率超限
- `VALIDATION_ERROR`: 数据验证失败
- `RESOURCE_NOT_FOUND`: 资源不存在
- `DUPLICATE_RESOURCE`: 资源已存在
- `SERVICE_UNAVAILABLE`: 服务不可用

## 速率限制

- 未认证用户: 60 次/分钟
- 认证用户: 120 次/分钟
- AI 请求: 10 次/分钟 (认证用户)

超出限制时返回 429 状态码，包含 `Retry-After` 头。

## 数据格式

- 所有API响应使用 JSON 格式
- 时间戳使用 ISO 8601 格式
- 坐标使用 WGS84 标准
- 文本编码: UTF-8

## SDK 和示例

### JavaScript 客户端示例

```javascript
// 初始化客户端
const api = {
  baseUrl: 'http://localhost:4000/api',
  token: localStorage.getItem('token')
};

// 通用请求方法
async function apiRequest(endpoint, options = {}) {
  const url = `${api.baseUrl}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(api.token && { Authorization: `Bearer ${api.token}` })
    },
    ...options
  };

  const response = await fetch(url, config);
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
  return response.json();
}

// 使用示例
const baziResult = await apiRequest('/bazi/calculate', {
  method: 'POST',
  body: JSON.stringify({
    birthYear: 1990,
    birthMonth: 5,
    birthDay: 15,
    birthHour: 14,
    gender: 'male'
  })
});
```

## 版本控制

当前API版本: v1

API 端点格式: `/api/{resource}`

未来版本将使用: `/api/v2/{resource}`
