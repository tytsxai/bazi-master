# BaZi Master — Open-Source Divination Calculation API

[![Release](https://img.shields.io/github/v/release/tytsxai/bazi-master)](https://github.com/tytsxai/bazi-master/releases) · [简体中文 README](README.md) · [llms.txt](llms.txt) · [API Docs](docs/api.md) · [Architecture](docs/architecture.md) · [Changelog](CHANGELOG.md) · [Issues](https://github.com/tytsxai/bazi-master/issues)

**BaZi Master is an open-source, self-hostable calculation engine for Chinese metaphysics and
astrology**, exposed as a documented HTTP API. It implements BaZi charting (八字排盘), Tarot draws,
I Ching divination (周易起卦), Zodiac / Ascendant calculations, Zi Wei Dou Shu charting (紫微斗数),
Synastry analysis (合盘), and AI-assisted interpretation on an Express + Prisma + PostgreSQL stack.

It ships no UI of its own. Consume it from whatever client you build — web, mobile, mini-program —
or wire it into an AI agent as a tool. It is meant to be forked and self-hosted, not consumed as a
hosted SaaS.

> This is an English summary of the [Simplified Chinese README](README.md), which is the
> authoritative documentation.

## Project snapshot

| Field              | Answer                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Project type       | Open-source divination / astrology calculation engine, delivered as a self-hosted HTTP API (no UI)                                        |
| Problem solved     | Gives a runnable code skeleton covering BaZi, Tarot, I Ching, Zodiac, Zi Wei, AI interpretation, auth, history, favorites, and deployment |
| Who it is for      | Backend / full-stack developers adding metaphysics calculation to their own product, and teams giving an AI agent a real calculation tool |
| Tech stack         | Node.js 20+, Express 4, Prisma, PostgreSQL, Redis, Node.js test runner                                                                    |
| Local dependencies | Prisma schema targets PostgreSQL; `docker-compose.yml` provides local PostgreSQL + Redis                                                  |
| AI capability      | mock / OpenAI / Anthropic text interpretation; Soul Portrait image generation via OpenAI or a mock placeholder                            |
| How you consume it | Call the HTTP API directly, register it as an agent tool, or put your own frontend in front of it                                         |
| Dev entry point    | `./bazi`, a programmatic CLI for setup, local stack lifecycle, migrations, tests, and E2E verification — every command supports `--json`  |
| Main entry points  | API routes in `backend/routes`, calculations in `backend/services`, data model in `prisma/schema.prisma`                                  |
| Key limitation     | Output is for entertainment, cultural research, or product prototyping only — never medical, legal, financial, or life advice             |
| License            | MIT — fork, modify, self-host, and use commercially; compliance and disclaimers are the deployer's responsibility                         |

### What it is not

- Not a web application — the repository contains no frontend code and ships no public instance.
- Not a hosted online fortune-telling service.
- Not a standalone npm BaZi algorithm library; the calculation lives inside the service and is reached over HTTP.
- Not a scientific endorsement of divination or astrology accuracy.
- Not a turnkey compliance package for app stores, WeChat, payments, ads, or local regulations.

## Core features

- **BaZi charting** — four pillars, five elements, ten gods, and luck cycles from birth date/time,
  with true-solar-time metadata, caching, and duplicate-record detection.
- **AI interpretation** — authenticated users can request BaZi readings or full analyses; without a
  real API key the mock provider is used.
- **Tarot** — single-card, three-card, and Celtic Cross spreads, with a public draw endpoint plus
  authenticated AI interpretation and history.
- **I Ching** — numeric and time-based hexagram casting, 64-hexagram data, changing lines, AI reading.
- **Zodiac / astrology** — sign profiles, daily horoscopes, ascendant calculation, compatibility.
- **Zi Wei Dou Shu** — authenticated charting with saved history, twelve palaces, major/minor stars,
  and the four transformations.
- **Synastry** — basic compatibility analysis across two sets of birth data.
- **User flows** — email signup/login, session tokens, cookies, Google / WeChat OAuth, password
  reset, self-service account deletion.
- **History and favorites** — records for BaZi, Tarot, I Ching, and Zi Wei with bulk operations,
  favorites, and snapshots.
- **Operations** — `/live`, `/health`, `/api/ready`, `/metrics` (Prometheus), admin health check,
  Pino JSON logs, OpenAPI / Swagger UI, and WebSocket AI streaming at `/ws/ai`.
- **Programmatic CLI** — `./bazi` wraps setup, local stack lifecycle, migrations, tests, and E2E
  verification behind `--json` output and documented exit codes, so scripts and AI agents can drive it.

## Quick start

Prerequisites: Node.js 20+, npm, and a local PostgreSQL. `./bazi stack up` picks the database path
automatically: `docker-compose.yml` when Docker is available on the default port 5432, otherwise a
locally installed PostgreSQL via `initdb` / `pg_ctl`. Redis is optional locally. The manual setup
path below does require Docker.

About environment variables: the backend does not bundle dotenv — `node server.js` reads real
environment variables only. When you start through `./bazi`, the CLI parses the repo-root `.env` and
injects it into child processes (a real `process.env` value still wins). For manual starts and
production, inject variables via your shell, process manager, or platform.

### Using the `./bazi` CLI (recommended)

```bash
git clone https://github.com/tytsxai/bazi-master.git
cd bazi-master

./bazi setup     # install deps + generate .env + generate Prisma Client
./bazi doctor    # environment health check; each failure prints a fix command
./bazi stack up  # start db + api
./bazi test      # run tests (cli + lint + backend)
```

Every command supports `--json` and uses documented exit codes, which makes it script- and
agent-friendly. Full command list: `./bazi help --json`.

### Manual setup

```bash
npm install
npm -C backend install

docker compose up -d postgres redis          # local PostgreSQL + Redis
npm -C backend run prisma:migrate:deploy     # apply migrations
NODE_ENV=development npm -C backend run dev  # API on http://127.0.0.1:4000
```

Health checks: `curl http://127.0.0.1:4000/live`, `/health`, `/api/ready`, `/api/ai/providers`.

See the [Chinese README quick start](README.md#快速开始--quick-start) for the fully annotated steps.

## Usage examples

Public BaZi calculation endpoint:

```bash
curl -X POST http://127.0.0.1:4000/api/bazi/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "birthYear": 1990,
    "birthMonth": 1,
    "birthDay": 1,
    "birthHour": 8,
    "gender": "male",
    "birthLocation": "beijing",
    "timezone": "Asia/Shanghai"
  }'
```

Public Tarot draw endpoint:

```bash
curl -X POST http://127.0.0.1:4000/api/tarot/draw \
  -H "Content-Type: application/json" \
  -d '{ "spreadType": "ThreeCard" }'
```

Once running: Swagger UI at `http://127.0.0.1:4000/api-docs`, OpenAPI JSON at
`http://127.0.0.1:4000/api-docs.json`. Full reference: [docs/api.md](docs/api.md).

Public (no auth): BaZi calculation, Tarot draw, I Ching casting, zodiac info, ascendant,
compatibility, synastry, location search. Authenticated: AI interpretation, history, favorites,
Zi Wei records, Soul Portrait, user settings, admin endpoints.

## Use cases

- Adding a metaphysics calculation backend to an existing product, with the UI entirely your own.
- Giving an AI agent a real charting algorithm to call instead of having the model invent results.
- Bootstrapping a self-hosted prototype for a divination / astrology / entertainment AI product.
- Studying how Express + Prisma + PostgreSQL + Redis organize auth, history, favorites, health
  checks, and OpenAPI documentation.
- Validating product paths for AI interpretation, WebSocket streaming, OAuth, password reset, and
  account deletion.

## Configuration

Local development: [.env.example](.env.example). Production: [env.production.template](env.production.template).
`./bazi setup` generates `.env` from the template; `./bazi env show|check|set` inspects, validates, and updates it.

Key variables:

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_TOKEN_SECRET` — must be a 32+ character random string in production
- `FRONTEND_URL` / `CORS_ALLOWED_ORIGINS` — the **origin of your client app**: CORS allow-list,
  OAuth callback redirect target, and links in outbound email. This service has no UI of its own
- `BACKEND_BASE_URL` — OpenAPI base URL
- `REDIS_URL` — optional locally, required for production / multi-instance deployments
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — optional; `AI_PROVIDER=mock` without them
- `TRUST_PROXY` — set to the **hop count** (`1` for a single nginx layer). Setting `true` trusts all
  proxies, which lets a client-controlled `X-Forwarded-For` bypass rate limiting
- `DOCS_USER` / `DOCS_PASSWORD` — protect `/api-docs` in production

## Testing

```bash
./bazi test                            # fast set: lint + typecheck + unit + backend, on an isolated temp DB
./bazi test backend                    # just one target
npm -C backend test                    # backend tests (prepares a local test PostgreSQL if needed)
npm run test:cli                       # CLI contract tests
npm test                               # combined
```

## Limitations and disclaimer

- This is a reference implementation. It is not a hosted service, and it makes no claim about the
  accuracy of any divination or astrology output.
- BaZi, Zi Wei, Tarot, I Ching, and zodiac results are suitable for entertainment, cultural research,
  product prototyping, and code learning — not professional advice.
- AI interpretation quality depends on the external model, API key, rate limits, and prompts; the
  mock provider is for development and demos only.
- OAuth, SMTP, Sentry, reverse proxy, domain, certificates, and platform compliance must be
  configured and verified by the deployer.
- Production requires your own PostgreSQL, Redis, HTTPS, strong `SESSION_TOKEN_SECRET`, SMTP, OAuth,
  backups, and monitoring. Start from [PRODUCTION.md](PRODUCTION.md) and
  [docs/production-ready.md](docs/production-ready.md).

## Documentation

- [docs/api.md](docs/api.md) — HTTP API overview
- [docs/architecture.md](docs/architecture.md) — system architecture and module map
- [docs/development.md](docs/development.md) — local development guide
- [docs/faq.md](docs/faq.md) — FAQ for developers and AI search engines
- [docs/production-ready.md](docs/production-ready.md) — production readiness checklist
- [llms.txt](llms.txt) — structured summary for AI search engines and coding agents

## License

MIT License. See [LICENSE](LICENSE).

---

**Search keywords**: open-source BaZi chart API, BaZi charting engine, Chinese astrology API,
Zi Wei Dou Shu chart open source, Tarot draw API, I Ching divination API, synastry compatibility API,
Express Prisma PostgreSQL calculation engine, AI fortune-telling backend, agent tools, self-hosted divination API.
