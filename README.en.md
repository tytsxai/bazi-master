# BaZi Master — Open-Source Divination Calculation API

[![Release](https://img.shields.io/github/v/release/tytsxai/bazi-master)](https://github.com/tytsxai/bazi-master/releases) · [简体中文 README](README.md) · [llms.txt](llms.txt) · [API Docs](docs/api.md) · [Architecture](docs/architecture.md) · [Changelog](CHANGELOG.md) · [Issues](https://github.com/tytsxai/bazi-master/issues)

**BaZi Master is an open-source, self-hostable calculation engine for Chinese metaphysics and
astrology**, exposed as a documented HTTP API and an agent-callable CLI. It covers the traditional
Chinese canon — BaZi (八字排盘), Zi Wei Dou Shu (紫微斗数), Liu Yao stem-branch attachment
(六爻纳甲), Da Liu Ren (大六壬), Qi Men Dun Jia (奇门遁甲), Ba Zhai feng shui (八宅), almanac
day-selection (择吉) and name grids (姓名五格) — plus Tarot draws, I Ching divination (周易起卦),
Zodiac / Ascendant calculations, Synastry analysis (合盘), and AI-assisted interpretation.

It is a **capability layer**, not a web app: no UI, no accounts, no end-user product. The engine is
**stateless pure calculation** — no database, no sessions, no file writes. Consume it from whatever
client you build, or wire it into an AI agent as a tool.

> This is an English summary of the [Simplified Chinese README](README.md), which is the
> authoritative documentation.

## Project snapshot

| Field               | Answer                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Project type        | Open-source divination / astrology **calculation capability layer**, delivered as a self-hosted HTTP API + CLI                |
| Problem solved      | Turns the silent-failure edge cases of these algorithms into a tested, contract-backed, callable capability                   |
| Who it is for       | Backend developers adding metaphysics calculation to their own product; teams giving an AI agent a real tool                  |
| Runtime shape       | **Stateless pure calculation** — no database, no accounts, no sessions, no file writes                                        |
| Only dependency     | Redis, and it is an **optional pure cache** (affects cross-instance hit rate only, never correctness)                         |
| Tech stack          | Node.js 20+, Express 4, Node.js test runner                                                                                   |
| Local prerequisites | Node.js 20+ and npm. No Docker, no database                                                                                   |
| AI capability       | mock / OpenAI / Anthropic text interpretation, overridable per request; charting works without any key                        |
| How you consume it  | Call the HTTP API, run `./bazi calc` / `./bazi cast`, or register it as an agent tool                                         |
| Dev entry point     | `./bazi`, a programmatic CLI for capability calls and repo operations — every command supports `--json`                       |
| Main entry points   | API routes in `backend/routes`, algorithms in `backend/services`                                                              |
| API contract        | OpenAPI in [docs/openapi.json](docs/openapi.json), served at `/api-docs`, snapshot guarded in CI                              |
| License             | MIT — fork, modify, self-host, and use commercially (compliance and disclaimers are yours)                                    |
| Key limitation      | Output is for entertainment, cultural research, or product prototyping only — never medical, legal, financial, or life advice |

### What it is not

- Not a web application. The repository contains no frontend code and no hosted instance.
- Not a hosted online fortune-telling service.
- Not an npm library; the algorithms are services behind HTTP and the CLI, not a published package.
- Not a backend scaffold with accounts. Registration, login, OAuth, history, and favorites **were
  removed from the project** — they belong to the caller.
- Not a scientific endorsement of divination or astrology.
- Not a turnkey commercial compliance package.

## Core capabilities

- **BaZi charting** — four pillars, hidden-stem weighted elements, ten gods, strength, useful-god
  analysis, shensha, nayin, twelve life stages, inter-pillar clashes/combinations, void branches;
  luck cycles carry their start instant and a year-by-year breakdown. True solar time participates
  in charting; results are cached behind an `x-bazi-cache` response header.
- **Zi Wei Dou Shu** — lunar conversion, the five-element bureau, twelve palaces, fourteen major
  stars, auspicious/inauspicious stars, four transformations, decade and annual periods. Star
  placement follows the orthodox chain: bureau from the life-palace nayin → Zi Wei → Tian Fu →
  the rest. Leap months follow the "fold into the base month" school.
- **Liu Yao (六爻纳甲)** — King Fang stem-branch attachment: palace membership, world/response
  lines, stem-branch pairs, six relatives, six gods, hidden spirits, void branches, month/day
  influence on each line, moving lines and the resulting hexagram. Palace membership is derived
  from the seven world-hexagram transformation rules, not a hard-coded 64-row table.
- **Da Liu Ren (大六壬)** — month general over hour to build the heaven/earth plates, stem
  lodging, the four courses, all nine gates of three-transmission derivation, twelve generals.
  The month general is the six-combination of the month branch, switching on the mid-qi.
- **Qi Men Dun Jia (奇门遁甲)** — bureau by the 拆补 (chai-bu) method, earth plate of three marvels and
  six instruments, duty-chief and duty-envoy, rotating-plate placement of the nine stars,
  eight gates and eight gods.
- **Ba Zhai feng shui (八宅)** — life trigram (bounded by 立春) and the eight directional
  wandering stars, derived by line transformation rather than table lookup.
- **Almanac (择吉)** — the twelve day-officers, the twenty-eight mansions and their luck,
  auspicious/inauspicious spirits, Peng Zu taboos.
- **Name grids (姓名五格)** — heaven/human/earth/outer/total grids and the three-talent
  configuration. Stroke counts are supplied by the caller.
- **Tarot** — full deck, SingleCard / ThreeCard / CelticCross spreads.
- **I Ching** — all 64 hexagrams with their Chinese names and King Wen numbers, number-based
  (deterministic) and time-based divination.
- **Zodiac** — sign profiles, horoscopes, ascendant calculation, compatibility.
- **Synastry** — chart-pair analysis for two sets of birth data.
- **AI interpretation** — for BaZi, Tarot, and I Ching, via mock / OpenAI / Anthropic, with a
  concurrency gate and a stream idle timeout.
- **Operations** — `/live`, `/health`, `/api/ready`, `/metrics` (Prometheus), Pino JSON logs,
  OpenAPI / Swagger UI, graceful shutdown with a drain window.
- **Programmatic CLI** — `./bazi` wraps both the algorithms and repo operations; every command
  supports `--json` and a documented exit-code contract, which makes it directly agent-callable.

### One boundary running through every capability: casting belongs to the engine, interpretation to the caller

How a chart is _cast_ — three transmissions, star placement, bureau layout, wandering stars —
has exactly one correct answer, and the engine must get it right. How a chart is _read_ —
Zi Wei's temple/fall gradings, Qi Men pattern names, the relative weight of a given shensha —
varies sharply between schools; embedding one school's take would hand callers a judgement
with no traceable provenance.

So the engine emits every ingredient an interpretation needs (each palace's star, gate, god and
stem; each line's relatives and gods; each pillar's hidden stems and ten gods) and stops there.
Where a _casting_ rule genuinely varies (hidden-stem weights, leap-month handling, the chai-bu
bureau method, rotating-plate placement), the choice is annotated in place, so switching schools
touches one location.

## Quick start

Prerequisites: **Node.js 20+ and npm**. No Docker, no database, no Redis.

```bash
git clone https://github.com/tytsxai/bazi-master.git
cd bazi-master

./bazi setup     # install dependencies, generate .env
./bazi doctor    # environment check; every failure prints an executable fix
./bazi stack up  # start the engine
./bazi test      # cli + lint + backend
```

`./bazi help --json` is the single source of truth for the command list — this document
deliberately does not duplicate it.

Manual path:

```bash
npm install && npm -C backend install
NODE_ENV=development npm -C backend run dev   # http://127.0.0.1:4000
```

The backend does not bundle dotenv: `node server.js` reads real environment variables only. The
`./bazi` CLI parses the repo-root `.env` and injects it into child processes, with real
`process.env` taking precedence.

## Usage examples

```bash
curl -X POST http://127.0.0.1:4000/api/bazi/calculate \
  -H "Content-Type: application/json" \
  -d '{"birthYear":1990,"birthMonth":5,"birthDay":20,"birthHour":14,"gender":"male",
       "birthLocation":"Beijing","timezone":"Asia/Shanghai"}'

curl -X POST http://127.0.0.1:4000/api/tarot/draw \
  -H "Content-Type: application/json" -d '{"spreadType":"ThreeCard"}'
```

The same capabilities through the CLI:

```bash
./bazi calc bazi --birth 1990-05-20T14:30 --gender male --json
./bazi cast tarot --spread ThreeCard --json
```

Full endpoint list: [docs/api.md](docs/api.md). Swagger UI at `/api-docs`, OpenAPI JSON at
`/api-docs.json`. Every business endpoint is public — there is no authentication to wire up.

## Configuration

See [.env.example](.env.example) for development and
[env.production.template](env.production.template) for production.

**Development needs no configuration at all** — every variable has a default. In production:

- `DOCS_PASSWORD` — the **only hard requirement**. Without it the process exits at startup.
- `CORS_ALLOWED_ORIGINS` — browser client origins. Server-to-server and agent callers send no
  Origin header and are unaffected.
- `BACKEND_BASE_URL` — base URL advertised in the OpenAPI document.
- `TRUST_PROXY` — set to the **hop count** (`1` for a single nginx). Setting it to `true` trusts any
  `X-Forwarded-For`, which makes rate limiting bypassable with a forged header.
- `REDIS_URL` — optional; cross-instance chart cache only.
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — optional; without them `AI_PROVIDER` falls back to `mock`.
- `METRICS_TOKEN` — bearer token for `/metrics`; left empty the endpoint returns 404 in production.
- `SHUTDOWN_DRAIN_MS` — drain window; size it against your load balancer's probe cadence (the
  template has a lookup table).

## Testing

```bash
./bazi test                        # cli + lint + backend
./bazi test --fail-on-skip --json  # for CI: a skipped target becomes a hard failure
```

**Tests need no external services** — no database to provision, no containers to start. That is a
direct consequence of the stateless design.

## Production notes

- Stateless: scaling out is just more processes. No sticky sessions, no coordination.
- Binds to `127.0.0.1:4000` by default (`BACKEND_BIND_ADDR`); TLS termination belongs to your
  reverse proxy.
- Startup validates production config: a missing `DOCS_PASSWORD` blocks boot; everything else warns.
- Graceful shutdown drains before closing the listener — `SHUTDOWN_DRAIN_MS` must stay below the
  orchestrator's stop grace period.
- Read [PRODUCTION.md](PRODUCTION.md) before deploying.

## Limitations

- A reference implementation. No hosted service, no accuracy guarantee.
- Output suits entertainment, cultural research, prototyping, and code study — not professional advice.
- The algorithms make school-specific choices (late-Zi hour does not roll the day, leap months fold
  into the base month, true solar time is computed but not applied to the chart). These are
  documented one by one in [.claude/skills/bazi-cli/SKILL.md](.claude/skills/bazi-cli/SKILL.md).
- AI interpretation depends on provider model quality, keys, rate limits, and prompts.
- Reverse proxy, domains, certificates, and jurisdictional compliance are the deployer's responsibility.

## License

MIT License. See [LICENSE](LICENSE).
