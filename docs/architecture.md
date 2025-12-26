# BaZi Master - 架构文档

## 系统架构概览

BaZi Master 采用经典的三层架构设计,包括前端展示层、后端服务层和数据持久层。

```
┌─────────────────────────────────────────────────────────────┐
│                         前端层                               │
│  React + Vite + Tailwind CSS + React Router + i18next      │
│  (端口: 3000)                                               │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP/WebSocket
┌───────────────────────┴─────────────────────────────────────┐
│                        后端服务层                            │
│  Node.js + Express + Prisma + Redis                        │
│  (端口: 4000)                                               │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Routes  │  │Middleware│  │ Services │  │Controllers│   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────────────────┐
│                       数据持久层                             │
│  PostgreSQL (生产) / SQLite (开发) + Redis (缓存/会话)      │
│  (端口: 5432 / 6379)                                        │
└─────────────────────────────────────────────────────────────┘
```

## 后端架构详解

### 目录结构

```
backend/
├── config/              # 配置模块
│   ├── app.js          # 应用配置
│   ├── database.js     # 数据库配置
│   ├── logger.js       # 日志配置
│   ├── prisma.js       # Prisma 客户端
│   └── redis.js        # Redis 客户端
├── constants/          # 常量定义
│   ├── iching.js       # 周易常量
│   ├── tarot.js        # 塔罗常量
│   └── zodiac.js       # 星座常量
├── controllers/        # 控制器 (未来扩展)
├── data/              # 静态数据
│   ├── ichingHexagrams.js  # 64卦数据
│   └── tarotData.js        # 塔罗牌数据
├── lib/               # 第三方库封装
│   └── solarLunar.js  # 农历转换库
├── middleware/        # 中间件
│   ├── auth.js        # 认证中间件
│   ├── health.js      # 健康检查
│   ├── index.js       # 中间件导出
│   ├── logging.middleware.js    # 日志中间件
│   ├── rateLimit.middleware.js  # 速率限制
│   ├── requestId.middleware.js  # 请求ID
│   ├── security.js              # 安全中间件
│   └── urlLength.middleware.js  # URL长度限制
├── routes/            # 路由定义
│   ├── api.js         # API 路由聚合
│   ├── auth.js        # 认证路由
│   ├── bazi.js        # 八字路由
│   ├── iching.js      # 周易路由
│   ├── tarot.js       # 塔罗路由
│   └── zodiac.js      # 星座路由
├── services/          # 业务逻辑服务
│   ├── ai.js          # AI 服务 (遗留)
│   ├── ai.service.js  # AI 服务 (新)
│   ├── auth.service.js      # 认证服务
│   ├── bazi.js              # 八字计算 (遗留)
│   ├── bazi.service.js      # 八字服务 (新)
│   ├── cache.service.js     # 缓存服务
│   ├── health.service.js    # 健康检查服务
│   ├── iching.service.js    # 周易服务
│   ├── oauth.service.js     # OAuth 服务
│   ├── prompts.service.js   # AI 提示词服务
│   ├── schema.service.js    # 数据库模式服务
│   ├── session.service.js   # 会话服务
│   ├── softDelete.service.js # 软删除服务
│   ├── solarTime.service.js  # 真太阳时服务
│   ├── tarot.service.js      # 塔罗服务
│   └── zodiac.service.js     # 星座服务
├── test/              # 测试文件
├── utils/             # 工具函数
│   ├── express.js     # Express 工具
│   ├── pagination.js  # 分页工具
│   ├── passwords.js   # 密码工具
│   ├── query.js       # 查询工具
│   ├── search.js      # 搜索工具
│   ├── timezone.js    # 时区工具
│   └── validation.js  # 验证工具
├── recordCleanup.js   # 记录清理
├── userCleanup.js     # 用户清理
└── server.js          # 服务器入口
```

### 核心模块说明

#### 1. 配置模块 (config/)

**app.js**: 应用级配置
- 环境变量管理
- 应用配置初始化
- 配置验证

**database.js**: 数据库配置
- 数据库类型检测 (PostgreSQL/SQLite)
- 连接池配置
- 数据库特性开关

**logger.js**: 日志配置
- Pino 日志器初始化
- 日志级别控制
- 生产/开发环境日志格式

**prisma.js**: Prisma ORM 客户端
- 数据库连接管理
- Prisma 客户端单例
- 连接池配置

**redis.js**: Redis 客户端
- Redis 连接管理
- 可选 Redis 支持
- 连接错误处理

#### 2. 中间件 (middleware/)

**auth.js**: 认证与授权
- JWT token 验证
- 会话管理
- 管理员权限检查
- 静默会话过期处理

**rateLimit.middleware.js**: 速率限制
- Redis 基础的速率限制
- 内存回退机制
- 可配置的限制策略

**security.js**: 安全中间件
- CORS 配置
- Helmet 安全头
- 请求体大小限制

**logging.middleware.js**: 请求日志
- 请求/响应日志
- 性能监控
- 错误追踪

#### 3. 服务层 (services/)

**bazi.service.js**: 八字计算服务
- 天干地支计算
- 五行分析
- 十神推算
- 大运流年

**ai.service.js**: AI 集成服务
- 多 AI 提供商支持 (OpenAI, Anthropic, Mock)
- 流式响应处理
- AI 请求去重
- 并发控制

**cache.service.js**: 缓存服务
- 八字计算结果缓存
- LRU 淘汰策略
- TTL 过期管理
- Redis 镜像支持

**zodiac.service.js**: 星座服务
- 上升星座计算
- 星座运势生成
- 星座兼容性分析

**solarTime.service.js**: 真太阳时服务
- 地理坐标解析
- 真太阳时计算
- 时区转换

#### 4. 工具模块 (utils/)

**validation.js**: 输入验证
- 八字输入验证
- 日期有效性检查
- 参数规范化

**pagination.js**: 分页工具
- 分页参数规范化
- 分页结果切片
- hasMore 标志计算

**passwords.js**: 密码管理
- bcrypt 密码哈希
- 密码验证
- 哈希检测

**timezone.js**: 时区工具
- 时区偏移解析
- IANA 时区支持
- 出生时间元数据构建

**search.js**: 搜索工具
- 搜索词解析
- 引号短语支持
- Prisma OR 条件构建

## 前端架构详解

### 目录结构

```
frontend/
├── public/            # 静态资源
├── src/
│   ├── auth/         # 认证模块
│   │   ├── AuthContext.jsx    # 认证上下文
│   │   └── ProtectedRoute.jsx # 路由保护
│   ├── components/   # 可复用组件
│   │   ├── BaziForm.jsx
│   │   ├── TarotCard.jsx
│   │   ├── ZodiacWheel.jsx
│   │   └── ...
│   ├── pages/        # 页面组件
│   │   ├── Home.jsx
│   │   ├── Bazi.jsx
│   │   ├── Tarot.jsx
│   │   ├── IChingPage.jsx
│   │   ├── Zodiac.jsx
│   │   ├── Admin.jsx
│   │   └── ...
│   ├── hooks/        # 自定义 Hooks
│   │   ├── useAuth.js
│   │   ├── useBazi.js
│   │   └── ...
│   ├── i18n/         # 国际化
│   │   ├── en.json
│   │   ├── zh.json
│   │   └── i18n.js
│   ├── utils/        # 工具函数
│   │   ├── api.js
│   │   └── helpers.js
│   ├── App.jsx       # 应用根组件
│   └── main.jsx      # 应用入口
└── tests/            # E2E 测试
```

### 核心功能模块

#### 1. 认证模块 (auth/)

- **AuthContext**: 全局认证状态管理
- **ProtectedRoute**: 路由级别的权限控制
- JWT token 存储与刷新
- 登录/登出流程

#### 2. 国际化 (i18n/)

- react-i18next 集成
- 中英文双语支持
- 动态语言切换
- 翻译键管理

#### 3. API 集成 (utils/api.js)

- 统一的 API 请求封装
- 自动 token 注入
- 错误处理
- 请求拦截器

## 数据流

### 1. 用户认证流程

```
用户输入 → 前端验证 → POST /api/auth/login
                    ↓
            后端验证密码 (bcrypt)
                    ↓
            生成 JWT token
                    ↓
            创建会话 (Redis/内存)
                    ↓
            返回 token + 用户信息
                    ↓
            前端存储 token (localStorage)
                    ↓
            后续请求携带 Authorization header
```

### 2. 八字计算流程

```
用户输入出生信息 → 前端验证
                    ↓
            POST /api/bazi/calculate
                    ↓
            后端验证输入 (validation.js)
                    ↓
            检查缓存 (cache.service.js)
                    ↓ (缓存未命中)
            执行计算 (bazi.service.js)
                    ↓
            - 天干地支排盘
            - 五行统计
            - 十神分析
                    ↓
            存入缓存
                    ↓
            返回结果 + 可选保存到数据库
```

### 3. AI 解读流程

```
用户请求 AI 解读 → POST /api/bazi/full-analysis
                    ↓
            认证检查 (requireAuth)
                    ↓
            并发控制 (aiGuard)
                    ↓
            构建提示词 (prompts.service.js)
                    ↓
            调用 AI 服务 (ai.service.js)
                    ↓
            流式返回 (WebSocket/SSE)
                    ↓
            前端实时显示
```

## 缓存策略

### 1. 八字计算缓存

- **存储**: 内存 Map + Redis 镜像
- **键**: `${birthYear}-${birthMonth}-${birthDay}-${birthHour}-${gender}`
- **TTL**: 可配置 (默认 1 小时)
- **淘汰**: LRU (最近最少使用)
- **最大条目**: 可配置 (默认 1000)

### 2. 会话缓存

- **存储**: Redis (优先) / 内存 (回退)
- **键**: JWT token
- **TTL**: 7 天 (可配置)
- **刷新**: 每次请求更新 idle 时间

## 安全机制

### 1. 认证与授权

- JWT token 签名验证
- 会话过期检查
- 管理员权限验证
- OAuth2 社交登录

### 2. 速率限制

- 未认证用户: 60 次/分钟
- 认证用户: 120 次/分钟
- AI 请求: 10 次/分钟

### 3. 输入验证

- 请求体大小限制 (10MB)
- URL 长度限制
- SQL 注入防护 (Prisma 参数化查询)
- XSS 防护 (React 自动转义)

### 4. 安全头

- Helmet 中间件
- CORS 配置
- CSP (内容安全策略)

## 错误处理

### 1. 后端错误处理

```javascript
// 全局错误处理中间件
app.use((err, req, res, next) => {
  logger.error({ err, req }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});
```

### 2. 前端错误处理

- API 错误捕获
- 用户友好错误提示
- 错误边界 (Error Boundary)

## 性能优化

### 1. 后端优化

- 计算结果缓存
- 数据库连接池
- Redis 会话存储
- AI 请求去重

### 2. 前端优化

- 代码分割 (React.lazy)
- 图片懒加载
- 虚拟滚动 (长列表)
- 防抖/节流

## 监控与日志

### 1. 日志系统

- **开发环境**: Pretty print (可读性)
- **生产环境**: JSON 格式 (结构化)
- **日志级别**: debug, info, warn, error
- **日志内容**: 请求ID, 用户ID, 性能指标

### 2. 健康检查

- **GET /health**: 应用存活检查
- **GET /api/ready**: 依赖服务就绪检查
  - 数据库连接
  - Redis 连接

## 部署架构

### 开发环境

```
localhost:3000 (前端) → localhost:4000 (后端)
                            ↓
                    PostgreSQL (Docker)
                            ↓
                    Redis (Docker)
```

### 生产环境

```
Nginx (3000) → Node.js (4000)
                    ↓
            PostgreSQL (5432)
                    ↓
            Redis (6379)
```

## 扩展性考虑

### 1. 水平扩展

- 无状态后端设计
- Redis 共享会话
- 数据库读写分离 (未来)

### 2. 模块化设计

- 服务层独立
- 路由模块化
- 中间件可插拔

### 3. 未来扩展

- 微服务拆分
- 消息队列 (RabbitMQ/Kafka)
- 分布式缓存
- CDN 集成

## 技术债务

### 最近解决的问题

1. ✅ **服务层重复**: `bazi.js` 和 `bazi.service.js` 已合并到 `calculations.service.js`
2. ✅ **AI 服务重复**: `ai.js` 已合并到 `ai.service.js`
3. ✅ **文档同步**: API 文档已更新，包含所有端点
4. ✅ **服务文件命名**: `ziwei.js` 重命名为 `ziwei.service.js` 保持一致性
5. ✅ **代码清理**: 删除空的 `utils_backup` 目录

### 当前已知问题

1. **测试覆盖**: 前端 E2E 测试需要扩展 (88 个测试文件)
2. **性能优化**: Bundle 大小优化 (当前 527KB，目标 < 500KB)

### 改进计划

1. ✅ 统一服务层命名和组织 (ziwei.js → ziwei.service.js)
2. 增加单元测试覆盖率
3. 完善 API 文档自动生成
4. 添加性能监控和追踪
5. Bundle 优化 (当前 527KB，目标 < 500KB)

## 参考资料

- [Express 最佳实践](https://expressjs.com/en/advanced/best-practice-performance.html)
- [React 架构模式](https://react.dev/learn/thinking-in-react)
- [Prisma 最佳实践](https://www.prisma.io/docs/guides/performance-and-optimization)
- [Node.js 生产最佳实践](https://github.com/goldbergyoni/nodebestpractices)
