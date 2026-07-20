---
name: bazi-cli
description: bazi-master 仓库的操作入口。当需要在这个项目里准备环境、起停本地开发栈（db/api/web）、跑数据库迁移或重置、跑测试、跑 verify-*.mjs 端到端校验、排查后端起不来或 /health 503 时使用。所有操作都通过仓库根的 ./bazi CLI 完成，不要直接调 npm script 或手动起进程。
---

# bazi-master 操作手册

仓库根有一个程序化 CLI：`./bazi`。**能做什么以 `./bazi help --json` 为准**，这里不重复命令列表——
重复的清单一定会腐化。这份文档只讲 `--help` 讲不了的东西：顺序、坑、约定、边界。

带 `--json` 跑。stdout 保证只有一个 JSON 文档，进度和子进程噪音全在 stderr。

## 退出码就是你的下一步

不要去读人类可读的错误文本猜意图，看退出码：

| 码  | 含义                                       | 你该做什么                            |
| --- | ------------------------------------------ | ------------------------------------- |
| 0   | 成功                                       | 继续                                  |
| 1   | 命令跑通了但结果失败（测试挂了、校验没过） | 去看结果本身，不是修环境              |
| 2   | 用法错                                     | 读 `--help`，别瞎试参数               |
| 3   | 环境未就绪                                 | 照 `next` 字段修，修完原样重试        |
| 4   | 远端拒绝                                   | 改请求内容，不是改环境                |
| 5   | 瞬时失败                                   | 原样重试                              |
| 7   | 命中安全边界                               | **停下来问人。见下面「关于 exit 7」** |

失败的 JSON 里 `next` 一定是一条可以直接复制执行的命令。优先照它做。

## 关于 exit 7：不要自动绕过

破坏性命令（`db reset` / `db restore`）在没有 `--yes` 时会返回 7，并且 `next` 字段会写着
"加 --yes 重跑"。**那句话是给人看的，不是给你看的。**

拿到 exit 7 的正确反应是：把目标库和将要发生的事情告诉用户，等一个明确的"是"，然后才加 `--yes`。
自己补个 `--yes` 重跑一遍等于这道闸从来没存在过。

真正不可逆的场景（`NODE_ENV=production`）CLI 会直接硬拒绝，加什么参数都没用——那是代码里的边界，不是约定。

## 起手式

```
./bazi doctor --json        # 退 3 就照每一项的 fix 修，或者 ./bazi doctor --fix 让它自己修
./bazi stack up --json      # 起 db -> api -> web，幂等，已经在跑的会跳过
./bazi stack status --json  # 任何时候先看这个再动手
```

Agent 在动手改代码前，用 `./bazi stack status --require-ready --json` 做前置断言：未就绪直接退 3，
比跑到一半发现服务没起要省事得多。

## 依赖顺序（最容易踩的坑）

**db → 迁移 → api → web**，中间那步最容易漏。

迁移没跑时，后端进程起得来、端口也通，但 `/health` 会一直返回 503，日志里刷的是
`The table public.User does not exist`。CLI 已经在启动 api 前替你查了迁移状态并直接报
`bazi db migrate`，所以你正常不会撞上。但如果你绕过 CLI 手动 `node server.js`，就会撞上，
而且现象非常像"后端坏了"。

改完 `prisma/schema.prisma` 的完整链路：

```
./bazi db migrate --new <名字>     # 只生成迁移文件，不应用，也不会触发交互式重置
./bazi db migrate                  # 应用
./bazi db generate                 # 重新生成 Prisma Client
./bazi stack restart --only api    # 不重启的话后端还在用旧 Client
```

## 两套数据库，别搞混

| 谁                    | 库                         | 数据目录        |
| --------------------- | -------------------------- | --------------- |
| `./bazi stack` 开发栈 | `.env` 里的 `DATABASE_URL` | `.tmp/cli/pg/`  |
| `./bazi test` 测试    | 脚本自建的临时库           | `.tmp/pg-test/` |

`./bazi test` **刻意不把 `.env` 注入子进程**。因为 `backend/scripts/run-tests-with-db.mjs` 的逻辑是
"`DATABASE_URL` 没设就自己起一个临时库"——一旦把开发库的 URL 灌进去，测试会直接在开发库上执行迁移和重置。
那是数据事故。`--use-dev-db` 能强行打开这个行为，除非用户明确要求，否则不要用。

## foreign：CLI 不碰不是自己起的进程

`stack status` 里 `managedBy` 有三种值：`bazi`（我们起的）、`foreign`（端口被别人占了）、`external`（数据库是别人起的）。

看到 `foreign` 时 CLI 会拒绝接管，也拒绝 kill。这是故意的：按端口去杀进程会误伤用户自己开的终端、
另一个 worktree、或者同事的服务。

正确处理：告诉用户 `4000/3000 端口上有不是 bazi 起的进程`，让他们决定。不要自己去 `kill $(lsof -ti:4000)`。

推论：**不要绕过 CLI 手动起服务**（`npm run dev`、`node server.js`）。那样起的进程 CLI 管不到，
后面 `stack down` 停不掉，`stack status` 只会显示 foreign。

## verify：跑之前栈必须就绪

`frontend/scripts/verify-*.mjs` 全都直接访问 `http://localhost:3000`，它们**自己不会把栈拉起来**。
栈没起时的原始表现是 Playwright 超时后吐一屏无关报错，很容易被误读成"功能坏了"。

CLI 已经加了前置断言（退 3，`next: bazi stack up`），所以走 `./bazi verify` 就不会误判。
清单是扫目录来的，新增一个 `scripts/verify-xxx.mjs` 立刻可用，不需要改 CLI 也不需要改这份文档。

**已知坏件**：`backend/scripts/verify-user-delete-cascade.mjs` 和 `verify-bazi-hard-delete.mjs`
里的建表语句还是 SQLite 语法（`AUTOINCREMENT`），但 schema 早就是 PostgreSQL 了，必然报
`42601 语法错误`。这两个失败与你的改动无关，别去追。

## 排查

```
./bazi stack logs api --tail 60     # 后端日志（pino JSON）
./bazi stack logs db                # PostgreSQL 日志
./bazi stack logs web
```

启动失败时 CLI 会把日志压成一条诊断再返回，不会把几十 KB 原始日志塞进 `hint`。
认得出的失败特征（缺表、连不上库、端口占用、必填环境变量缺失）会直接翻译成下一步命令。

运行态都在 `.tmp/cli/` 下（pidfile、日志、备份、pg 数据目录），已被 `.gitignore` 覆盖，可以整个删掉重来。

## 端口

api `4000`（`.env` 的 `PORT`）、web `3000`、db `5433`（本地 pg_ctl）或 `5432`（docker compose）。
装了 Docker 时 `env init` 默认给 5432 走 compose，没装就给 5433 走 pg_ctl。
