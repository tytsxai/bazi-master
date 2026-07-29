# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Six new divination engines, and the shared 干支 foundation they sit on.** The engine
  previously covered BaZi and Zi Wei only; the traditional Chinese canon is now largely
  complete. A new `constants/ganzhi.js` + `services/ganzhi.service.js` layer holds what
  all of them share — 纳音 (sexagenary sound-elements), 藏干 (hidden stems with
  primary/middle/residual weights), 十二长生, the full set of stem/branch combinations,
  clashes, punishments, harms and destructions, 五行局 and 旬空. The 60 纳音 entries are
  verified entry-by-entry against `lunar-javascript`'s independent table, so a
  transcription slip cannot survive the test suite.
  - **六爻纳甲 (Liu Yao)** — King Fang stem-branch attachment: hexagram name, palace,
    world/response lines, 六亲, 六神, hidden spirits, 旬空, month/day influence on each
    line, moving lines and the resulting hexagram. Palace membership is _derived_ from the
    seven world-hexagram transformation rules rather than hard-coded as a 64-row table.
  - **大六壬 (Da Liu Ren)** — month-general-over-hour plate construction, stem lodging,
    the four courses, all nine gates of 三传 derivation, and the twelve generals.
  - **奇门遁甲 (Qi Men Dun Jia)** — 拆补法 bureau determination, the earth plate of three
    marvels and six instruments, 值符/值使, and 转盘法 rotation of the nine stars, eight
    gates and eight gods.
  - **八宅 (Ba Zhai)**, **择吉 (almanac)** and **姓名五格 (name grids)**.
- Endpoints: `POST /api/liuyao/chart`, `POST /api/liuren/chart`, `POST /api/qimen/chart`,
  `POST /api/fengshui/bazhai`, `GET /api/fengshui/almanac`, `POST /api/fengshui/name`.
  All are in the OpenAPI contract with their school-of-thought caveats spelled out.
- CLI: `calc liuyao|liuren|qimen|bazhai|almanac|name`, each with `--dry-run` and the
  established exit-code contract.
- BaZi gained an `analysis` layer — hidden-stem-weighted elements, day-master strength,
  favourable/unfavourable elements by the 扶抑 method, 神煞, 纳音, 十二长生, inter-pillar
  relations and 旬空 — plus exact luck-cycle start timing and per-year 流年.

### Changed

- **Established the boundary the whole capability layer follows: structure belongs to the
  engine, interpretation belongs to the caller.** How a chart is _cast_ — 三传, star
  placement, bureau layout, 游年 — has one correct answer and must be exact. How a chart is
  _read_ — 庙旺利陷, Qi Men pattern names, the relative weight of 神煞 — differs sharply
  between schools, and embedding one school's take would hand callers a judgement with no
  traceable provenance. The engine therefore emits every ingredient an interpretation
  needs and stops there. This reframes the long-standing "庙旺 pending a source text" item:
  it is a deliberate boundary, not an outstanding gap. Where a _casting_ rule genuinely
  varies (hidden-stem weights, leap-month handling, 拆补法, 转盘法), the choice is annotated
  in place so switching schools touches one location.

- **The CLI safety boundary now guards `.env` instead of the database.** `exit 7` was
  attached to `db reset` / `db restore`; with those gone the contract would have become
  vestigial. It is re-anchored on `bazi env init --force`, which overwrites the one file
  in the repo holding real API keys. Both gates behave as before — `NODE_ENV=production`
  is a hard refusal, `--dry-run` previews without executing, `--yes` confirms — and
  `tools/cli/test/safety.test.mjs` covers the new target.
- `env.production.template` and `docker-compose.prod.yml` rewritten against what the code
  actually reads. Dropped the postgres service, its volume, the backup cron variables,
  Prisma pool tuning, and every session / OAuth / SMTP / cookie key. `DOCS_PASSWORD` is
  now `${DOCS_PASSWORD:?...}` in compose, matching the server's own startup validation —
  it is the single hard requirement in production. Redis persistence is off (`--save ''`)
  because the only thing in it is a recomputable chart cache.
- `bazi env check` validates per `NODE_ENV` rather than against a fixed list: nothing is
  required in development, and only `DOCS_PASSWORD` in production. Same rule as
  `server.js`, so the two can no longer disagree.
- README, README.en, `llms.txt`, `docs/api.md`, `docs/architecture.md`,
  `docs/development.md`, `docs/faq.md` and `PRODUCTION.md` rewritten around the stateless
  capability layer. The endpoint list is regenerated from the actual routes — the old
  `docs/api.md` documented 60-plus endpoints, more than half of which (auth, records,
  favorites, user settings, media, admin) no longer exist.

- `./bazi stack` manages `db` and `api` only; the `web` component and its vite process
  management are gone. `./bazi setup` drops `--with-frontend`, `./bazi doctor` drops the
  `deps:frontend` / `port:frontend` / `e2e:browsers` checks, and `./bazi test` narrows to
  `cli` / `lint` / `backend` — with `--all` removed, since it no longer selects anything
  the default run does not already cover.
- `./bazi verify` discovers `backend/scripts/verify-*.mjs` only.
- CI drops the frontend install/unit/E2E steps and gains the CLI contract tests, which
  previously ran nowhere.
- `FRONTEND_URL`, `WECHAT_FRONTEND_URL` and `CORS_ALLOWED_ORIGINS` are **kept** and keep
  their behaviour — they are the OAuth callback target, the CORS allow-list, and the
  origin used in outbound email links. Their meaning is now "the origin of the client
  application calling this API" rather than "the UI we ship"; documentation reworded
  accordingly.

### Fixed

- **The I Ching endpoint still served placeholder hexagram names.** Adding real names in the
  Liu Yao work left the repository holding two versions of the same data: the Liu Yao module
  knew 乾为天 while `GET /api/iching/hexagrams` answered `"Heaven over Heaven"` with a
  templated `summary`. The names now live in `data/ichingHexagrams.js` as the single source
  both read; each hexagram carries its Chinese name, King Wen number, and the old directional
  phrasing preserved under `nameEn` for callers that were matching on it.
- **Synastry compared only the _elements_ of the day pillars.** Its own comment admitted it —
  "for now we'll do a basic element check". But element relations cannot express what matters
  most in a compatibility reading: 子 and 丑 are "water generates earth" _and_ a six-combination;
  子 and 午 are "water controls fire" _and_ a clash. The element view sees no difference.
  Rewritten on the ganzhi foundation: day-master ten-gods in both directions (they are not
  symmetric), the spouse palace's six-combination / triple / half / clash / punishment / harm,
  cross-pillar relations labelled by which two pillars, and elemental complement computed from
  hidden-stem weights rather than the coarse count-based percentages. `score` remains, but it is
  now folded from those relations with the weights returned alongside it.
- **The daily-fortune helper kept a second, romanised clash table.** It duplicated the one in
  `constants/ganzhi.js`, and being clash-only it could not see combinations, punishments or
  harms. It now goes through `detectBranchRelations`, and the response carries the objective
  relations next to the score.
- `docs/architecture.md` still listed `birthTime.service`, a file that had been deleted, and had
  not been told about any of the new modules. Its service table, directory tree and
  `llms.txt`'s feature list are back in sync with the code.
- The OpenAPI spec had drifted from what the engine actually returns: `BaziCalculation` was
  missing `analysis`, `chartTime` and `luckStart`; `Hexagram` was missing the real name and
  sequence; synastry and calendar responses were described by a bare `score`.

- **Zi Wei Dou Shu was placing every star incorrectly.** This was not a precision gap; the
  chart was wrong. 紫微 was located by `month branch + (lunar day − 1)`, a formula with no
  basis — the orthodox method derives the 五行局 from the 纳音 of the life-palace's
  stem-branch and positions 紫微 from the bureau number. With the anchor star wrong, all
  fourteen majors followed. Also corrected: 天府 mirrors 紫微 across the 寅–申 axis rather
  than sitting at `+6`; the 紫微 group runs _counter_-clockwise (天机 −1, 太阳 −3, 武曲 −4,
  天同 −5, 廉贞 −8); 破军 is `天府 + 10`, not `+7`; and the eight auxiliary stars follow four
  _different_ rules (昌曲 by hour branch, 辅弼 by lunar month, 魁钺 by year stem) where the
  old code applied a single shared offset. Added 五行局, the six malefics, 大限, 小限 and 流年.
- **True solar time was computed and then ignored.** `trueSolarTime.applied: true` meant
  "the correction was calculated", not "this chart used it" — the pillars were still built
  from wall-clock time. Documentation said as much, which made it a known-but-unfixed
  defect rather than a surprise. The correction now feeds the chart; `chartTime.used`
  reports the instant actually used and `chartTime.trueSolarTime.clockTime` preserves the
  original. In western China the shift exceeds two hours, which moves the hour pillar.
- **The BaZi cache key did not cover every input to the chart.** Once true solar time
  participates, birthplace, minute and timezone are chart inputs; without them in the key,
  two people born at the same clock time in different cities collide on one cached chart.
  The key now appends them, and `SKILL.md` — which had predicted exactly this failure —
  documents the new contract.
- **The sixty-four hexagrams had no real names.** `data/ichingHexagrams.js` generated
  `name: "Heaven over Fire"` and a template `summary` for each of the 64 combinations.
  Chinese names and King Wen sequence numbers are now present, verified by an automated
  check: every non-doubled hexagram's name begins with its upper and lower trigram images
  (坎 over 震 = 水雷屯), which catches any mis-pairing without manual review.
- **`HEAD` could not run `npm test` from a clean checkout.** The earlier
  front-end/account-system removal committed the code deletions but not `backend/package.json`:
  its `test` script still pointed at the deleted `scripts/run-tests-with-db.mjs`, and
  `@prisma/client`, `cookie-parser`, `nodemailer` and `ws` were still listed as
  dependencies. A local run masked this because the old packages were still installed in
  `node_modules`; a fresh worktree surfaced it immediately. CI would have failed on its
  first step.
- CLI output claimed "the correction is advisory, the pillars above use wall-clock time"
  long after that stopped being true. Stale output is worse than no output, because it
  reads as authoritative.

- `scripts/verify-deployment.sh` had three defects that made it structurally incapable of
  passing, on a healthy deployment: its log helpers wrote to stdout, so every
  `$(http_request ...)` capture came back with `[INFO] Attempting GET ...` glued to the
  front of the JSON and **every** `validate_json` call reported "key not found";
  `validate_json` declared `local expected_value=$3` under `set -u`, so any two-argument
  call aborted the entire run; and `"${auth_args[@]}"` on an empty array is an unbound
  variable under bash 3.2 (macOS), killing the OpenAPI check. Logging now goes to stderr,
  the third parameter defaults, and the array expansion is guarded. The script's own
  content was also brought up to date — it no longer asserts that `/api/tarot/cards`
  requires authentication, no longer probes `/api/auth/*`, no longer reads
  `checks.db.ok`, and no longer reports an unconfigured Redis as "connected and
  operational". Six checks, all passing against a live engine.

### Removed

- **Every artifact that documented or operated the deleted storage layer.** Removing the
  database left a trail of files that still described a system that no longer exists —
  the most expensive kind of documentation, because it reads as authoritative. Deleted:
  - `scripts/backup-db.sh`, `restore-db.sh`, `cron-backup.sh`, `install-cron.sh` and
    `failure-simulation.sh` — all of them drove `pg_dump`/`psql` against a database that
    is gone.
  - `docker/postgres-init/`.
  - `docs/production-ready.md`, `docs/production-runbook.md`,
    `docs/backend-reliability.md` and `docs/monitoring-guide.md` — roughly a thousand
    lines whose substance was PostgreSQL backup, restore, migration, connection-pool
    sizing and capacity planning. What survived (health-probe wiring, drain timing,
    `/metrics` alerting) is folded into `PRODUCTION.md`.
  - `./bazi db` and `./bazi verify` command trees, plus `core/prisma.mjs` and
    `helpers/local-pg.mjs`. `bazi doctor` no longer checks for a Prisma Client or a
    reachable PostgreSQL, `bazi setup` no longer generates a client, `bazi stack` manages
    a single `api` component (so `--only` is gone), and `bazi test` drops `--use-dev-db`
    — there is no dev database to protect any more.
  - `OAUTH_FETCH_TIMEOUT_MS` in `backend/utils/http.js`, exported but imported nowhere
    since the OAuth service was deleted.

> earlier in this cycle

- **BREAKING — the bundled React frontend is gone.** The project is a professional
  calculation engine, delivered as a documented HTTP API for applications and AI agents;
  the UI was never the value, and shipping one blurred the boundary of the capability
  layer while costing a full browser toolchain to maintain. Deleted `frontend/` in its
  entirety — the React app, 91 Playwright specs, 19 `verify-*.mjs` browser checks, its
  Dockerfile and `nginx.conf` — 232 files in all. Anyone who was running the bundled UI
  should pin the previous tag or build their own client against `docs/api.md` and
  `docs/openapi.json`; the API itself is unchanged.
- The `frontend` service in `docker-compose.prod.yml`, along with `FRONTEND_BIND_ADDR`
  and the `VITE_*` build args. TLS termination and the public edge now belong entirely
  to a reverse proxy you run yourself.
- Per-source-IP WebSocket limiting went with `frontend/nginx.conf`. `WS_MAX_CONNECTIONS`
  still bounds the process as a whole, but nothing now stops one client from holding
  every slot — configure `limit_conn` at your own edge if that matters to you.
- `docs/performance-audit.md`, which measured frontend bundles and Playwright runs.

## [0.2.0] - 2026-07-28

Production-readiness pass. No API changes — every item below closes a gap that would
have surfaced during a deploy or under real traffic. Two entries do change runtime
behaviour under load rather than merely fixing something: connections beyond
`WS_MAX_CONNECTIONS` globally, or beyond 10 per source IP, are now refused with a 503.
Both were previously unbounded.

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
- `bazi stack up` no longer fails outright on a clean checkout. Starting the web
  component ran `npm run asbuild` whenever `public/wasm/optimized.wasm` was absent, but
  that script — along with the whole AssemblyScript chain — was deleted as dead code
  earlier; only this call site was missed. It had become exactly what that cleanup set
  out to remove: a mandatory build step that could only fail. Worse, it exited 3 and
  advised reinstalling frontend dependencies, which were never the problem.
- The CLI contract suite now also checks that what the CLI _invokes_ exists, not just
  that its command tree is self-consistent: every `bazi test` target must map to a real
  npm script, each target's declared script must match the args it actually runs, and
  any hardcoded `npm run` in the source is verified too. The `asbuild` breakage was
  invisible to the existing tests — the command tree was fine, what it reached for at
  runtime was not.

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

## Pre-0.1.0 开发记录（2025-12）

下面这些改动都已经包含在上面的 [0.1.0] 里 —— 0.1.0 是首个打了 tag 的版本，把 v0.1 的
完整实现面一次性固化了下来。保留这一段只是为了追溯当时的 commit，**不是待发布内容**。

同理，下面的 `0.1.1` 和 `0.1.0-alpha` 是当时用过的编号，仓库里从未打过对应的 tag
（`git tag` 里只有 `v0.1.0` 和 `v0.2.0`），所以它们没有可跳转的比较链接。

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

[0.2.0]: https://github.com/tytsxai/bazi-master/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/tytsxai/bazi-master/releases/tag/v0.1.0
