# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Production-readiness pass. No behaviour or API changes; every item below closes a gap
that would have surfaced during a deploy or under real traffic.

### Added

- Per-source-IP ceiling on WebSocket connections (`limit_conn ws_per_ip 10` in
  `frontend/nginx.conf`). The backend's `WS_MAX_CONNECTIONS` bounds the process as a
  whole but does nothing to stop one client from holding every slot — and since the
  `/ws/ai` handshake is unauthenticated (path and Origin only, and a client that sends
  no Origin is let through), doing so requires nothing at all. Verified end to end
  against a real nginx: the 11th connection gets a 503 and closing one hands the slot
  straight back. Where the container sits behind another proxy this needs
  `set_real_ip_from` first, or every user shares one counter; the commented lines are
  in place for that.
- Explicit `ulimits.nofile` (65536) on both application containers, rather than
  inheriting whatever the daemon happens to default to. Each WebSocket connection costs
  one descriptor in the backend and two in the nginx container, and measurement puts an
  idle connection at ~9KB RSS — 500 of them is ~4.4MB against a 1g limit, so the
  descriptor table is what runs out first. It fails as `EMFILE` with every `accept()`
  failing at once, which is considerably harder to read than an OOM.

- Indexes on `userId` for `BaziRecord`, `TarotRecord`, `IchingRecord` and `ZiweiRecord`,
  and on `Favorite.recordId`. PostgreSQL does not index foreign keys automatically, so
  every history listing was a sequential scan plus a sort over the whole table.
  Migration `20260728022702_add_user_id_indexes` is purely additive.
- Connection draining on SIGTERM (`SHUTDOWN_DRAIN_MS`, default 5000 in production).
  `/health` and `/api/ready` report 503 with `status: "shutting_down"` immediately, while
  the process keeps serving, so a load balancer can drain the instance before its socket
  closes. `/live` deliberately keeps returning 200.
- An idle deadline on streamed AI responses. The existing timeout only covered the
  response headers; a provider that stalled mid-stream held the connection — and the
  caller's single-in-flight AI slot on `/ws/ai` — until the process restarted.
- `WS_MAX_CONNECTIONS` (default 500). The `/ws/ai` upgrade handshake is served before
  Express and never passes through the HTTP rate limiter, so nothing previously bounded
  socket memory. Over the limit the handshake gets a 503 rather than a bare reset.

### Fixed

- The backend container's healthcheck used `/api/ready`, a deep check, and that
  healthcheck drives autoheal. A brief database outage therefore restarted the backend,
  which then exits at startup when it cannot reach the database — turning a self-healing
  blip into a `restart: always` crash loop. It now uses `/live`.
- The backend image started via `npm run start`, putting npm and a shell between PID 1
  and `scripts/start.mjs`. Neither reliably forwards SIGTERM, so the graceful shutdown
  that script exists to enable never ran and Docker SIGKILLed the tree instead.
- `index.html`, `sw.js`, `registerSW.js` and `manifest.webmanifest` are served
  `no-cache`, and `/assets/` (content-hashed) `immutable`. Without this a cached
  `index.html` outlives a deploy and requests chunks that no longer exist — a blank page
  until the user hard-refreshes.
- The session cookie's `maxAge` was pinned at 30 minutes while the server expired
  sessions at `SESSION_IDLE_MS`. Raising that value silently did nothing: the browser
  still dropped the cookie on the old schedule.
- `client_max_body_size` in the frontend nginx config was 50m against a 1mb backend
  limit, so oversized bodies were buffered in full before being rejected. Now matched.

### Tooling — `./bazi` CLI

Developer/agent tooling only; the deployed application is untouched.

- A contract test suite for the CLI itself (`tools/cli/test/`, `./bazi test cli`, ~2s).
  It pins the three things every caller depends on and nothing previously guarded:
  exit-code semantics, "`--json` writes exactly one JSON document to stdout", and the
  destructive-command safety gate. It also checks the capability listing is
  self-consistent — every example command and flag in `bazi help --json` must actually
  resolve, and no command-local flag may shadow a global one.
- `bazi help --json` now includes `tree.globalFlags`. It was documented as the single
  source of truth for what the CLI can do, but omitted `--json`, `--quiet`, `--dry-run`,
  `--yes` and `--help` entirely — so a caller reading only the JSON could not discover
  `--yes`, the one flag that resolves an exit 7.
- `--dry-run` no longer requires `--yes` on `db reset` / `db restore`, and no longer
  requires a reachable database. The blocked-command hint told the caller to add
  `--dry-run` to preview, but the confirmation gate rejected that too and returned the
  same hint — a loop whose only exit was the `--yes` the gate exists to withhold.
  The other two gates are unchanged: `NODE_ENV=production` is still refused outright and
  a non-local `DATABASE_URL` still requires `--allow-remote`, dry run or not.
- `bazi <group>` and `bazi <group> --json` returned different exit codes (2 and 0) for
  the same input, and the `--json` form emitted a bare command tree instead of the
  `{ok, command, data}` envelope every other command uses. Both forms now exit 2 and
  share one envelope with `bazi help --json`.
- `bazi test` reports a target whose npm script is missing as `skipped` rather than
  `failed`. Those mean different things to the caller — one is "go install something",
  the other is "go read the code" — and `--fail-on-skip` now covers both.
- `bazi test` gained a `cli` target, first in the default set: if the tool itself is
  broken, every later result is suspect.

## [0.1.0] - 2026-05-19

First tagged release of BaZi Master — codifies the v0.1 reference implementation surface.

### Included

- **Five divination modalities**: BaZi (八字), Tarot (塔罗), I Ching (周易), Western astrology (星座), Zi Wei Dou Shu (紫微斗数)
- **Cross-modality**: Synastry (合盘) chart-pair analysis, daily fortune calendar (personalized when birth-date is supplied)
- **AI features**: AI interpretation for each modality, Soul Portrait (灵魂画像) AI image generation
- **WebSocket AI streaming** at `/ws/ai` (token-by-token)
- **Auth surface**: email signup/login, session tokens, logout, self-serve account deletion, password reset, Google + WeChat OAuth
- **User settings**: language + preference persistence (i18n via react-i18next)
- **History**: per-user record management with client-side search/filter, batch operations, favorites, snapshot saves; duplicate BaZi record detection on save
- **Operational endpoints**: `/live` (liveness), `/health` and `/api/ready` (deep checks), admin `/api/admin/health`
- **Tech stack**: React 18 + Vite + Tailwind frontend, Node 20+ + Express 4 + Prisma ORM + Pino backend
- **Storage**: PostgreSQL (the Prisma provider is `postgresql`; SQLite is not supported)
- **Redis**: sessions, BaZi cache, OAuth state, password-reset tokens. Falls back to in-memory in development; **required in production** — the server refuses to start without `REDIS_URL`
- **Testing**: Node native `test` for backend, Playwright for frontend E2E
- **Discovery**: bilingual SEO keyword block + `llms.txt`

### Notes

This is a **reference / sample project**. Output is generated by language models and astrology libraries — treat as cultural / entertainment, not life advice. Before publishing on any platform (Apple App Store, WeChat Mini Program, etc.) verify the platform's divination-content policy yourself.

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

- **Production Readiness**: Added `/live` (liveness, process-only), `/health` (deep check) and `/api/ready` (readiness) endpoints.
- **Reliability**: Implemented Redis-based session storage and cache mirroring for multi-instance deployments.
- **Testing**: Configured Playwright retries and `data-testid` selectors for robust E2E testing.
- **Tooling**: Added `npm run analyze` for frontend bundle visualization.

## [0.1.0-alpha] - 2025-12-26

### Added

- Core domain modules: BaZi calculation & records, Tarot draw & history, I Ching divination, Zodiac info/horoscope/compatibility/rising, Zi Wei charting, Favorites.
- Authentication: register, login, logout, session token storage, self-delete.
- Health/readiness endpoints and basic rate limiting & CORS controls.
- Frontend React SPA with i18n, routing, and Playwright E2E specs.
- Prisma schema with initial migration targeting PostgreSQL.

[Unreleased]: https://github.com/tytsxai/bazi-master/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/tytsxai/bazi-master/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/tytsxai/bazi-master/releases/tag/v0.1.0
[0.1.0-alpha]: https://github.com/tytsxai/bazi-master/releases/tag/v0.1.0-alpha
