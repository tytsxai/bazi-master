# 变更日志 (Changelog)

本文档记录 BaZi Master 项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 修复
- 重命名 `ziwei.js` 为 `ziwei.service.js` 保持命名一致性
- 删除空的 `utils_backup` 目录
- 修复路由文件中的服务导入路径
- 更新文档状态和项目进度

### 优化
- 清理后端服务文件结构
- 更新架构文档中的技术债务状态
- 完善项目状态描述

### 新增
- 完整的架构文档 (docs/architecture.md)
- 双语 README (中文/English)
- 详细的项目结构说明
- 质量指标和发布计划

### 变更
- 更新 README.md 为专业双语版本
- 重组 TODO.md 为优先级驱动的任务列表
- 改进文档组织和可读性

### 修复
- 修复所有模块导入路径错误
- 修复 baziCache.test.js 导入路径
- 修复 iching.service.js 数据导入路径
- 所有 96 个后端测试现在通过

## [1.0.0] - 2025-12-26

### 新增
- 完整的八字 (BaZi) 计算系统
- 塔罗 (Tarot) 抽牌和解读
- 周易 (I Ching) 起卦系统
- 星座 (Zodiac) 查询和运势
- AI 智能解读 (支持 OpenAI, Anthropic)
- 用户认证系统 (JWT + OAuth2)
- 访客模式支持
- 历史记录和收藏夹功能
- 完整的国际化支持 (中文/English)
- WebSocket 实时 AI 流式响应
- Redis 缓存和会话管理
- PostgreSQL 数据库支持
- Docker 容器化部署
- 完整的测试套件 (96 个后端测试)
- 生产环境配置和部署指南

### 技术架构
- **前端**: React 18 + Vite + Tailwind CSS
- **后端**: Node.js + Express + Prisma
- **数据库**: PostgreSQL (生产) / SQLite (开发)
- **缓存**: Redis
- **日志**: Pino 结构化日志
- **测试**: Node.js test runner + Playwright

### 文档
- API 文档 (docs/api.md)
- 架构文档 (docs/architecture.md)
- 开发指南 (docs/development.md)
- 生产部署清单 (docs/production-ready.md)
- 快速部署指南 (PRODUCTION.md)

### 安全
- JWT token 认证
- bcrypt 密码哈希
- 速率限制 (60-120 req/min)
- CORS 配置
- Helmet 安全头
- 输入验证和清理

### 性能
- 八字计算结果缓存 (LRU + TTL)
- Redis 会话存储
- 数据库连接池
- AI 请求去重和并发控制

## [0.9.0] - 2025-12-25

### 新增
- 后端模块化重构
- 服务层抽象
- 中间件系统
- 健康检查端点
- 优雅关闭机制

### 变更
- server.js 从 5,558 行重构为 312 行
- 统一环境变量配置
- 改进错误处理

### 修复
- 前端导航问题
- 管理员界面错误
- 数据库兼容性问题

## [0.8.0] - 2025-12-24

### 新增
- 前端 E2E 测试套件 (87 个测试文件)
- Playwright 测试框架集成
- 测试覆盖报告

### 变更
- 改进前端组件结构
- 优化 API 调用逻辑

## [0.7.0] - 2025-12-23

### 新增
- OAuth2 社交登录框架
- Google OAuth 集成
- WeChat OAuth 准备

### 变更
- 认证流程优化
- 会话管理改进

## [0.6.0] - 2025-12-22

### 新增
- 星座 (Zodiac) 模块
- 上升星座计算
- 星座兼容性分析
- 星座运势生成

### 变更
- 真太阳时计算优化
- 时区处理改进

## [0.5.0] - 2025-12-21

### 新增
- 周易 (I Ching) 模块
- 64 卦数据完整集成
- 梅花易数起卦方法
- 变卦计算

### 变更
- 数据结构优化

## [0.4.0] - 2025-12-20

### 新增
- 塔罗 (Tarot) 模块
- 78 张塔罗牌数据
- 三种牌阵 (单张、三张、凯尔特十字)
- 正逆位支持

### 变更
- 前端组件重构

## [0.3.0] - 2025-12-19

### 新增
- AI 集成系统
- 多 AI 提供商支持
- 流式响应处理
- AI 提示词管理

### 变更
- API 路由结构优化

## [0.2.0] - 2025-12-18

### 新增
- 用户认证系统
- JWT token 生成和验证
- 密码哈希 (bcrypt)
- 会话管理
- 速率限制

### 变更
- 数据库模式更新

## [0.1.0] - 2025-12-17

### 新增
- 基础项目结构
- 八字 (BaZi) 核心计算
- 天干地支系统
- 五行分析
- 十神计算
- Prisma ORM 集成
- 基础 API 端点

---

## 版本说明

### 版本号格式: MAJOR.MINOR.PATCH

- **MAJOR**: 不兼容的 API 变更
- **MINOR**: 向后兼容的功能新增
- **PATCH**: 向后兼容的问题修复

### 变更类型

- **新增**: 新功能
- **变更**: 现有功能的变更
- **弃用**: 即将移除的功能
- **移除**: 已移除的功能
- **修复**: 问题修复
- **安全**: 安全相关的修复

## 升级指南

### 从 0.x 升级到 1.0.0

1. **数据库迁移**
   ```bash
   cd backend
   node scripts/prisma.mjs migrate deploy --schema=../prisma/schema.prisma
   ```

2. **环境变量更新**
   - 检查 `.env.production.example` 的新配置项
   - 更新 `SESSION_TOKEN_SECRET` (必须 32+ 字符)
   - 配置 `REDIS_URL` (生产环境必需)

3. **依赖更新**
   ```bash
   npm install
   cd backend && npm install
   cd ../frontend && npm install
   ```

4. **测试验证**
   ```bash
   npm run test:all
   ```

## 贡献

欢迎提交问题报告和功能建议到 [GitHub Issues](https://github.com/your-repo/issues)。

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件
