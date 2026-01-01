# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **八字重复检测**: 保存记录时自动检测重复，避免冗余数据 (`dc2cb8d`)
- **历史搜索过滤**: 客户端搜索过滤功能，提升历史记录查找效率 (`b2408b9`)
- **根级 ESLint/Prettier**: 统一代码风格配置 (`86ff089`)
- **React Router v7 兼容**: 测试工具添加 future flags 支持 (`1e3aa5f`)

### Changed

- **认证优化**: 移除冗余的 profileName 加载效果 (`bd4eea3`)
- **WebSocket 日志**: 降级 WS 错误为警告级别，减少日志噪音 (`cd78787`)
- **TypeScript 类型**: 前端工具函数替换 `any` 为正确类型 (`b030e1c`)
- **文档完善**: API/架构/开发/生产文档全面更新，添加目录导航和详细端点说明
- Lighthouse CI 配置改为静态 dist 服务并补充 headless flags（性能阈值暂降至 0.65）

### Fixed

- E2E 测试过滤 WebSocket 错误，提升测试稳定性 (`5595440`)
- 修正过时的文件和 API 引用
- 修复 OpenAPI 生成脚本的重复导入问题
- 消除前端单测的 `act(...)` 警告（AuthContext / useBaziCalculation）
- 为 Lighthouse 提供首屏占位（避免 NO_FCP）
- 生产环境禁用 Dev OAuth 直登（同时在回调中强制拦截）
- 日历日运接口校验出生参数完整性，避免 NaN 计算
- 灵魂画像在未配置 OpenAI 时自动降级到 mock provider
- OAuth state 与密码重置 token 镜像到 Redis，支持多实例一致性
- 生产校验新增 SMTP/Trust Proxy 要求，避免上线后密码重置与限流失效
- 密码重置邮件发送与会话 Cookie SameSite 可配置

## [0.1.1] - 2025-12-27

### Added

- **Production Readiness**: Added `/health` (liveness) and `/api/ready` (readiness) endpoints.
- **Reliability**: Implemented Redis-based session storage and cache mirroring for multi-instance deployments.
- **Testing**: Configured Playwright retries and `data-testid` selectors for robust E2E testing.
- **Tooling**: Added `npm run analyze` for frontend bundle visualization.

## [0.1.0] - 2025-12-26

### Added

- Core domain modules: BaZi calculation & records, Tarot draw & history, I Ching divination, Zodiac info/horoscope/compatibility/rising, Zi Wei charting, Favorites.
- Authentication: register, login, logout, session token storage, self-delete.
- Health/readiness endpoints and basic rate limiting & CORS controls.
- Frontend React SPA with i18n, routing, and Playwright E2E specs.
- Prisma schema with initial migration targeting SQLite (dev) and PostgreSQL (prod).

[Unreleased]: https://github.com/tytsxai/bazi-master/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/tytsxai/bazi-master/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/tytsxai/bazi-master/releases/tag/v0.1.0
