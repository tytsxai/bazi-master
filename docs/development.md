# BaZi Master - 开发指南

> 版本: v0.2.0 | 更新: 2026-07-29

BaZi Master 是一个无状态的算法能力层：Express 提供 HTTP 接口，算法逻辑全在
`backend/services/`，没有数据库，没有前端。本文面向本地开发、二次开发和自部署前的验证。

## 前置要求

- Node.js >= 20（CI 覆盖 20.x 和 22.x）
- npm >= 9

就这两项。**不需要 Docker，不需要 PostgreSQL，不需要 Redis** —— 引擎是纯计算，
Redis 只在你想验证多实例缓存共享时才用得上。

跑 `./bazi doctor` 会逐项检查环境，并对每个失败项给出可直接执行的修复命令。

## 安装与运行

### 推荐：用 `./bazi` CLI

```bash
./bazi setup          # 装依赖 + 生成 .env
./bazi doctor         # 环境体检，每项失败都带可执行的修复命令
./bazi stack up       # 起引擎
./bazi stack status   # 看当前状态
./bazi stack down     # 停掉
```

所有命令支持 `--json`；`./bazi help --json` 是能力清单的唯一真源。
注意：手动 `node server.js` 起的进程 CLI 管不到，之后也停不掉。

### 手动步骤

```bash
npm install
npm -C backend install
NODE_ENV=development npm -C backend run dev   # http://127.0.0.1:4000
```

想验证 Redis 缓存共享时，再起一个本地 Redis：

```bash
docker compose up -d redis   # docker-compose.yml 里只有这一个服务
```

## 环境变量

- 开发模板：[.env.example](../.env.example)
- 生产模板：[env.production.template](../env.production.template)
- **后端进程本身不引入 dotenv**：`node server.js` 只读取真实环境变量。
- 用 `./bazi` 启动时，CLI 会解析仓库根的 `.env` 并注入子进程；真实 `process.env`
  优先级高于文件（见 `tools/cli/src/core/context.mjs` 的 `buildEnv`）。
- 手动启动或生产部署时，请在 shell 中导出，或用进程管理器/部署平台注入。

开发环境**一个变量都不必填**，全部有默认值。生产环境唯一的硬性必填项是
`DOCS_PASSWORD` —— 缺了它 `server.js` 启动即退出。`./bazi env check` 按当前
`NODE_ENV` 校验这一点，跟服务端启动校验是同一套口径。

## 测试

```bash
./bazi test              # 全部目标：cli + lint + backend
./bazi test backend      # 只跑后端
./bazi test --fail-on-skip --json   # CI 用：有目标被跳过就退 3

npm -C backend test      # 后端 Node.js test runner
npm run test:cli         # CLI 自身的契约测试
```

测试不需要任何外部服务。`./bazi test` 刻意**不**把 `.env` 注入测试进程 ——
测试看到的环境应该尽量接近 CI 里那个干净的环境，否则「本机能过、CI 过不了」很难查。

> `bazi test` 的目标未就绪时会记 `skipped` 并**照样返回 0**。永远读 `summary.skipped`，
> 别只看退出码；要让「什么都没跑」变成硬失败就加 `--fail-on-skip`。

## 常用脚本

| 命令                                      | 作用                                 |
| ----------------------------------------- | ------------------------------------ |
| `npm -C backend run generate:openapi`     | 重新生成 `docs/openapi.json`         |
| `npm run lint`                            | 根级 ESLint                          |
| `npm run format` / `npm run format:check` | Prettier                             |
| `./scripts/check-env-template.sh`         | 校验生产模板覆盖了代码读取的每个变量 |
| `./scripts/check-repo-artifacts.sh`       | 防止构建产物/大文件被提交            |

改了 `backend/services/apiSchema.service.js` 之后**必须**重新生成 OpenAPI 快照，
否则 CI 会因为 `git diff --exit-code -- docs/openapi.json` 失败。

## 代码结构提示

- 算法与业务逻辑集中在 `backend/services/*.service.js`
- HTTP 入口在 `backend/routes/*`，只做参数编解码
- 对外接口契约在 `docs/openapi.json`，由 `apiSchema.service.js` 生成，运行时挂在 `/api-docs`
- 架构与模块分工见 [architecture.md](architecture.md)
- **算法语义边界**（真太阳时、晚子时、闰月、节气交接）见
  [.claude/skills/bazi-cli/SKILL.md](../.claude/skills/bazi-cli/SKILL.md) ——
  那里每一条都是「错了不会报错」的坑，改算法之前先读

## 开发约定

- 默认 CORS 白名单取自 `CORS_ALLOWED_ORIGINS`；开发环境额外放行 `localhost:3000`
- 服务端到服务端、Agent 调用不带 Origin 头，不受 CORS 影响
- AI Provider 根据密钥自动选择；无密钥时为 `mock`
- 修改/新增 API 时同步更新 `docs/api.md` 和 OpenAPI 快照

## 调试

```bash
curl http://localhost:4000/live                  # 只看进程
curl http://localhost:4000/health                # 含依赖
curl http://localhost:4000/api/ready             # 就绪
curl http://localhost:4000/api/system/cache-status
./bazi stack logs --tail 60                      # 引擎日志（pino JSON）
```

运行态都在 `.tmp/cli/` 下（pidfile、日志），已被 `.gitignore` 覆盖，可以整个删掉重来。

## 常见问题

### 引擎起不来

先看 `./bazi stack logs --tail 60`。CLI 在启动失败时会把日志压成一条诊断返回，
认得出的失败特征（端口占用、生产模式缺 `DOCS_PASSWORD`、依赖缺失）会直接翻译成下一步命令。

### 端口 4000 被占用

`./bazi stack status` 会报 `foreign` —— 端口上有进程，但不是 bazi 起的。
CLI 刻意拒绝接管也拒绝 kill，因为按端口杀进程会误伤别的终端或另一个 worktree。

### Redis 连不上

开发环境不配 Redis 完全没问题，排盘缓存退化成进程内缓存，结果一样。
配了但连不上时 `./bazi doctor` 会报 fail，把 `.env` 里的 `REDIS_URL` 清空即可。

### AI 功能返回 mock 数据

检查 `OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY` 是否配置。未配置时 provider 为 `mock`。
`GET /api/ai/providers` 能看到当前生效的是哪个。

## 贡献

- 遵循现有代码风格与目录划分
- 变更需附带测试或说明
- 改 CLI 本身时先读 [.claude/skills/bazi-cli/SKILL.md](../.claude/skills/bazi-cli/SKILL.md)
  的「要改 CLI 本身的时候」那一节 —— 那里列的不是风格建议，是契约测试会当场拦下来的硬约束
