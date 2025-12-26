# BaZi Master - 全球化算命平台

<div align="center">

**一个现代化的全栈算命平台，融合东西方命理学**

[![Tests](https://img.shields.io/badge/tests-69%20passing-brightgreen)](./backend/test)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![React](https://img.shields.io/badge/react-18-blue)](https://react.dev)

[English](#english) | [中文](#中文)

</div>

---

## 中文

### 📖 项目简介

BaZi Master 是一个全球化的算命平台，集成了多种东西方命理系统：

- **八字 (BaZi)** - 中国传统四柱命理学
- **塔罗 (Tarot)** - 西方占卜系统
- **周易 (I Ching)** - 中国经典易经占卜
- **星座 (Zodiac)** - 西方占星学
- **紫微斗数 (Zi Wei)** - 中国高级命理系统 (V2)

### ✨ 核心特性

#### 🎯 功能亮点
- **访客模式**: 无需登录即可使用基础功能（八字排盘、单张塔罗、星座查询、周易起卦）
- **会员功能**: 完整分析、历史记录、收藏夹、AI 智能解读、多记录对比
- **AI 集成**: 支持 OpenAI、Anthropic 等多个 AI 提供商
- **国际化**: 完整的中英文双语支持

#### 🛠 技术栈

**前端**
- React 18 + Vite - 快速的现代化构建工具
- Tailwind CSS - 实用优先的 CSS 框架
- React Router v6 - 声明式路由
- react-i18next - 国际化解决方案
- ECharts - 数据可视化

**后端**
- Node.js + Express - 高性能 Web 框架
- Prisma ORM - 类型安全的数据库工具
- PostgreSQL - 生产级关系数据库
- Redis - 高性能缓存和会话存储
- Bearer 会话 Token - 身份认证（使用 `Authorization: Bearer <token>`）
- Pino - 高性能日志系统

**基础设施**
- Docker + Docker Compose - 容器化部署
- Nginx - 生产环境 Web 服务器
- GitHub Actions - CI/CD

### 🚀 快速开始

#### 前置要求

```bash
node --version  # >= 18.0.0
npm --version   # >= 9.0.0
docker --version  # >= 24.0.0
docker compose version  # >= 2.0.0
```

#### 一键安装（推荐）

```bash
# 克隆仓库
git clone <repository-url>
cd bazi-master

# 自动化初始化脚本
./init.sh

# 访问应用
# 前端: http://localhost:3000
# 后端: http://localhost:4000
```

#### 手动安装

<details>
<summary>点击展开详细步骤</summary>

```bash
# 1. 安装依赖
npm install
cd backend && npm install
cd ../frontend && npm install

# 2. 启动数据库服务
docker compose up -d postgres redis

# 3. 应用数据库迁移
cd backend
node scripts/prisma.mjs migrate deploy --schema=../prisma/schema.prisma

# 4. 启动后端服务（终端 1）
cd backend
npm run dev

# 5. 启动前端服务（终端 2）
cd frontend
npm run dev
```

</details>

### 📁 项目结构

```
bazi-master/
├── backend/              # 后端服务
│   ├── config/          # 配置模块
│   ├── middleware/      # Express 中间件
│   ├── routes/          # API 路由
│   ├── services/        # 业务逻辑层
│   ├── utils/           # 工具函数
│   ├── test/            # 测试文件
│   └── server.js        # 服务器入口
├── frontend/            # 前端应用
│   ├── src/
│   │   ├── auth/       # 认证模块
│   │   ├── components/ # React 组件
│   │   ├── pages/      # 页面组件
│   │   ├── i18n/       # 国际化
│   │   └── utils/      # 工具函数
│   └── tests/          # E2E 测试
├── prisma/             # 数据库模式
│   ├── schema.prisma   # Prisma schema
│   └── migrations/     # 迁移文件
├── docs/               # 项目文档
│   ├── api.md         # API 文档
│   ├── architecture.md # 架构文档
│   ├── development.md  # 开发指南
│   └── production-ready.md # 生产部署
├── scripts/            # 运维脚本
└── docker/             # Docker 配置
```

### 🧪 测试

```bash
# 后端单元测试
npm -C backend test

# 前端 E2E 测试（Playwright）
npm -C frontend test

# 全量测试（后端 + 前端）
npm test
```

### 📚 文档

- [API 文档](./docs/api.md) - 完整的 API 端点说明
- [开发指南](./docs/development.md) - 开发环境搭建和工作流
- [生产部署](./docs/production-ready.md) - 生产环境部署清单
- [PRODUCTION.md](./PRODUCTION.md) - 快速部署指南

### 🔧 配置

#### 环境变量

```bash
# 开发环境
cp .env.example .env

# 生产环境
cp .env.production.example .env.production
```

关键配置项：
- `DATABASE_URL` - PostgreSQL 连接字符串
- `REDIS_URL` - Redis 连接字符串
- `SESSION_TOKEN_SECRET` - 会话 Token 签名密钥（建议 32+ 字符）
- `FRONTEND_URL` - 前端 URL
- `BACKEND_BASE_URL` - 后端 API URL

### 🚢 部署

#### 开发环境

```bash
docker compose up -d
```

#### 生产环境

```bash
# 使用生产配置启动
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

# 查看日志
docker compose -f docker-compose.prod.yml logs -f
```

详见 [PRODUCTION.md](./PRODUCTION.md)

### 🤝 贡献指南

我们欢迎所有形式的贡献！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 编写代码并添加测试
4. 运行测试确保通过 (`npm test`)
5. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
6. 推送到分支 (`git push origin feature/AmazingFeature`)
7. 开启 Pull Request

### 📊 项目状态

- ✅ 数据库: PostgreSQL 生产就绪
- ✅ 文档: 已对齐当前代码与配置
- 🔄 持续改进中

### 📝 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

---

## English

### 📖 Introduction

BaZi Master is a global divination platform integrating multiple Eastern and Western fortune-telling systems:

- **BaZi (八字)** - Traditional Chinese Four Pillars of Destiny
- **Tarot** - Western divination system
- **I Ching (周易)** - Classic Chinese Book of Changes divination
- **Zodiac** - Western astrology
- **Zi Wei (紫微斗数)** - Advanced Chinese astrology (V2)

### ✨ Key Features

#### 🎯 Highlights
- **Guest Access**: Use basic features without login (BaZi calculation, single Tarot draw, Zodiac query, I Ching divination)
- **Member Features**: Full analysis, history, favorites, AI interpretations, multi-record comparison
- **AI Integration**: Support for OpenAI, Anthropic, and other AI providers
- **Internationalization**: Complete English and Chinese language support

#### 🛠 Tech Stack

**Frontend**
- React 18 + Vite - Fast modern build tool
- Tailwind CSS - Utility-first CSS framework
- React Router v6 - Declarative routing
- react-i18next - Internationalization solution
- ECharts - Data visualization

**Backend**
- Node.js + Express - High-performance web framework
- Prisma ORM - Type-safe database toolkit
- PostgreSQL - Production-grade relational database
- Redis - High-performance cache and session store
- Bearer session token - Authentication via `Authorization: Bearer <token>`
- Pino - High-performance logging

**Infrastructure**
- Docker + Docker Compose - Containerized deployment
- Nginx - Production web server
- GitHub Actions - CI/CD

### 🚀 Quick Start

#### Prerequisites

```bash
node --version  # >= 18.0.0
npm --version   # >= 9.0.0
docker --version  # >= 24.0.0
docker compose version  # >= 2.0.0
```

#### One-Click Setup (Recommended)

```bash
# Clone repository
git clone <repository-url>
cd bazi-master

# Automated initialization
./init.sh

# Access application
# Frontend: http://localhost:3000
# Backend: http://localhost:4000
```

#### Manual Setup

<details>
<summary>Click to expand detailed steps</summary>

```bash
# 1. Install dependencies
npm install
cd backend && npm install
cd ../frontend && npm install

# 2. Start database services
docker compose up -d postgres redis

# 3. Apply database migrations
cd backend
node scripts/prisma.mjs migrate deploy --schema=../prisma/schema.prisma

# 4. Start backend (Terminal 1)
cd backend
npm run dev

# 5. Start frontend (Terminal 2)
cd frontend
npm run dev
```

</details>

### 🧪 Testing

```bash
# Backend unit tests
npm -C backend test

# Frontend E2E tests (Playwright)
npm -C frontend test

# Full test suite (backend + frontend)
npm test
```

### 📚 Documentation

- [API Documentation](./docs/api.md) - Complete API endpoint reference
- [Development Guide](./docs/development.md) - Development setup and workflow
- [Production Deployment](./docs/production-ready.md) - Production deployment checklist
- [PRODUCTION.md](./PRODUCTION.md) - Quick deployment guide

### 🤝 Contributing

We welcome all forms of contributions!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Write code and add tests
4. Run tests to ensure they pass (`npm test`)
5. Commit changes (`git commit -m 'Add some AmazingFeature'`)
6. Push to branch (`git push origin feature/AmazingFeature`)
7. Open a Pull Request

### 📊 Project Status

- ✅ Database: PostgreSQL production-ready
- ✅ Documentation: Updated and enhanced
- ✅ Code Logic: Cleaned and optimized
- ✅ Tests: All 69 tests passing

### 📝 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details

---

<div align="center">

**Made by the BaZi Master Team**

[Report Bug](https://github.com/your-repo/issues) · [Request Feature](https://github.com/your-repo/issues)

</div>
