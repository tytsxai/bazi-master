# BaZi Master - 开发指南

## 项目概述

BaZi Master 是一个全球化算命平台,核心功能包括:
- 八字 (BaZi) - 中国传统命理
- 塔罗 (Tarot) - 西方占卜
- 周易 (I Ching) - 中国经典占卜
- 星座 (Zodiac) - 西方占星
- 紫微斗数 (Zi Wei) - 中国高级命理

## 技术栈

### 前端
- React 18 + Vite
- Tailwind CSS
- React Router v6
- react-i18next (国际化)
- Playwright (E2E 测试)

### 后端
- Node.js + Express
- Prisma ORM
- PostgreSQL + Prisma Migrations
- Redis (会话 + 缓存)
- Bearer 会话 Token（`Authorization: Bearer <token>`）
- OAuth2：当前代码中有基础实现/预留，但路由层可能未全部接入（以 `backend/routes/` 为准）

### 基础设施
- Docker & Docker Compose
- Nginx (前端生产服务)
- PostgreSQL (持久化)
- Redis (缓存)

## 开发环境搭建

### 前置要求
```bash
# 检查版本
node --version       # >= 18.0.0
npm --version
docker --version     # >= 24.0.0
docker compose version  # >= 2.0.0
```

### 环境变量配置
复制环境变量模板并配置：
```bash
cp .env.example .env
```

编辑 `.env` 或在 shell 中导出环境变量（项目未内置 dotenv 自动加载）：
```bash
# 数据库
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bazi_master?schema=public"

# 会话密钥
SESSION_TOKEN_SECRET="your-32-character-secret-key-here"

# AI提供商 (可选)
OPENAI_API_KEY="your-openai-key"
ANTHROPIC_API_KEY="your-anthropic-key"

# OAuth (可选，开发环境)
GOOGLE_CLIENT_ID="your-google-client-id"
WECHAT_APP_ID="your-wechat-app-id"
```

### 快速开始

```bash
# 1. 克隆仓库
git clone <repository-url>
cd bazi-master

# 2. 自动化初始化
./init.sh

# 3. 启动服务
# 后端（终端 1）
cd backend && npm run dev

# 前端（终端 2）
cd frontend && npm run dev
```

### 手动安装

```bash
# 安装依赖
npm install
cd backend && npm install
cd ../frontend && npm install

# 启动数据库服务
docker compose up -d postgres redis

# 应用数据库迁移
cd backend
node scripts/prisma.mjs migrate deploy --schema=../prisma/schema.prisma

# 启动后端 (终端 1)
npm run dev

# 启动前端 (终端 2)
cd ../frontend
npm run dev
```

## 项目结构

```
bazi-master/
├── backend/                 # 后端服务
│   ├── config/             # 配置模块
│   ├── middleware/         # Express 中间件
│   ├── routes/            # API 路由
│   ├── services/          # 业务逻辑
│   ├── test/              # 后端测试
│   └── server.js          # 入口文件
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── auth/          # 认证模块
│   │   ├── components/    # React 组件
│   │   ├── pages/         # 页面组件
│   │   ├── hooks/         # 自定义 Hooks
│   │   ├── i18n/          # 国际化
│   │   └── utils/         # 工具函数
│   └── tests/             # E2E 测试
├── prisma/                # 数据库模式
│   ├── schema.prisma      # Prisma schema
│   └── migrations/        # 迁移文件
├── docs/                  # 项目文档
├── scripts/               # 运维脚本
├── docker/                # Docker 配置
├── .env.example           # 开发环境变量模板
└── .env.production.example # 生产环境变量模板
```

## 开发工作流

### 1. 创建功能分支
```bash
git checkout -b feature/your-feature-name
```

### 2. 编写代码
- 遵循现有代码风格
- 添加必要的测试
- 更新相关文档

### 3. 测试
```bash
# 后端测试
cd backend && npm test

# 前端 E2E 测试
cd frontend && npm test

# 完整测试套件
npm test
```

### 4. 提交代码
```bash
git add .
git commit -m "feat: add your feature description"
git push origin feature/your-feature-name
```

### 5. 创建 Pull Request
在 GitHub 上创建 PR,描述:
- 功能概述
- 测试结果
- 破坏性变更 (如有)

## API 开发

### 添加新 API 端点

1. 在 `backend/routes/` 创建或编辑路由文件
2. 在 `backend/services/` 实现业务逻辑
3. 添加测试到 `backend/test/`
4. 更新 `docs/api.md`

### 示例
```javascript
// backend/routes/example.js
import express from 'express';
import { requireAuth } from '../middleware/index.js';

const router = express.Router();

router.get('/example', requireAuth, async (req, res) => {
  // 业务逻辑
  res.json({ message: 'Hello' });
});

export default router;
```

## 前端开发

### 添加新页面

1. 在 `frontend/src/pages/` 创建页面组件
2. 在 `frontend/src/App.jsx` 添加路由
3. 更新 `frontend/src/i18n/` 的翻译文件
4. 添加 E2E 测试到 `frontend/tests/`

### 示例
```jsx
// frontend/src/pages/NewPage.jsx
import React from 'react';

export default function NewPage() {
  return (
    <div>
      <h1>New Page</h1>
    </div>
  );
}
```

## 数据库操作

### 修改 Schema

```bash
# 编辑 schema
vim prisma/schema.prisma

# 创建迁移
cd backend
node scripts/prisma.mjs migrate dev --name your_migration_name

# 应用迁移
node scripts/prisma.mjs migrate deploy --schema=../prisma/schema.prisma

# 重置数据库 (开发环境)
node scripts/prisma.mjs migrate reset --schema=../prisma/schema.prisma
```

### 使用 Prisma Studio
```bash
cd backend
npx prisma studio --schema=../prisma/schema.prisma
```

## 测试

### 后端测试
```bash
cd backend
npm test
```

### 前端测试
```bash
cd frontend
npm run test  # 运行所有E2E测试
npm run test --grep "test-name"  # 运行特定测试
npm run test --headed  # 显示浏览器窗口（调试模式）
```

### 测试覆盖
- 后端: 单元测试 + 集成测试
- 前端: E2E 测试 (Playwright)

## 部署

### 开发部署
```bash
docker compose up -d
```

### 生产部署
```bash
# 1. 准备环境变量
cp .env.production.example .env.production
vim .env.production

# 2. 构建并启动
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

# 3. 检查状态
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

## 常见问题

### Q: 数据库连接失败
A: 检查 DATABASE_URL 环境变量,确保 PostgreSQL 服务正在运行

### Q: Redis 连接失败
A: 开发环境可选,生产环境必须。启动 Redis: `docker compose up -d redis`

### Q: E2E 测试失败
A: 确保后端和前端服务都正在运行,检查端口占用

### Q: 修改 Prisma schema 后报错
A: 需要重新生成 Prisma Client: `cd backend && node scripts/prisma.mjs generate`

## 资源链接

- [React 文档](https://react.dev)
- [Express 文档](https://expressjs.com)
- [Prisma 文档](https://www.prisma.io/docs)
- [Vite 文档](https://vitejs.dev)
- [Playwright 文档](https://playwright.dev)

## 贡献指南

欢迎贡献!请遵循以下原则:
1. 保持代码简洁 (KISS 原则)
2. 编写清晰的自文档化代码
3. 添加必要的测试
4. 遵循现有代码风格
5. 及时更新文档

## 许可证

MIT License
