---
name: bazi-cli
description: bazi-master 仓库的操作入口。当需要在这个项目里准备环境、起停本地开发栈（db/api）、跑数据库迁移或重置、跑测试、跑 verify-*.mjs 端到端校验、排查 API 起不来或 /health 503 时使用。所有操作都通过仓库根的 ./bazi CLI 完成，不要直接调 npm script 或手动起进程。
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

破坏性命令（`db reset` / `db restore`）在没有 `--yes` 时会返回 7。**不要自己补一个 `--yes` 重跑**——
那等于这道闸从来没存在过。

拿到 exit 7 的正确流程是：

```
./bazi db reset --dry-run --json    # 安全：只说明会动哪个库，不执行，不需要 --yes
```

把 dry-run 的结论告诉用户，等一个明确的"是"，然后才加 `--yes`。

`--dry-run` 只能越过"确认"这一道闸。另外两道它一样拦：`NODE_ENV=production` 直接硬拒绝，
非本地 `DATABASE_URL` 必须显式 `--allow-remote`。加什么参数都绕不过——那是代码里的边界，不是约定。

## --dry-run：动手之前先问它

几乎所有会改东西的命令都支持 `--dry-run`：`setup` / `db reset` / `db restore` / `db backup` /
`db migrate` / `env init` / `env set` / `stack up` / `stack down` / `stack restart` / `test` /
`verify` / `doctor --fix`。它打印"会做什么"然后返回 0，不执行。

它是全局标志，`bazi help --json` 的 `tree.globalFlags` 里能查到（`--json` / `--quiet` /
`--dry-run` / `--yes` / `--help` 都在那里，不在每条命令自己的 `flags` 里）。

## 起手式

```
./bazi doctor --json        # 退 3 就照每一项的 fix 修，或者 ./bazi doctor --fix 让它自己修
./bazi stack up --json      # 起 db -> api，幂等，已经在跑的会跳过
./bazi stack status --json  # 任何时候先看这个再动手
```

Agent 在动手改代码前，用 `./bazi stack status --require-ready --json` 做前置断言：未就绪直接退 3，
比跑到一半发现服务没起要省事得多。

## 依赖顺序（最容易踩的坑）

**db → 迁移 → api**，中间那步最容易漏。

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

## 测试：skipped 不等于 passed

`bazi test` 的目标未就绪时会记 `skipped` 并**照样返回 0**。未就绪有两种：依赖没装，或者
对应的 npm script 不存在。这是给本地开发用的，但它意味着一次"什么都没跑"也会报成功：

```
summary: {"passed": 1, "failed": 0, "skipped": 2}   # exit 0，但 lint/backend 根本没跑
```

**永远读 `summary.skipped`，别只看退出码。** 要让"什么都没跑"变成硬失败（CI、或者你需要一次
可信的全量），加 `--fail-on-skip`：有跳过就退 3（环境未就绪，去装依赖，不是去查代码）。

```
./bazi test --fail-on-skip --json
```

三个目标是 `cli` / `lint` / `backend`，不带参数就全跑。`cli` 排在最前面是它自己的契约测试
（退出码语义、`--json` 单文档、安全闸不可绕），两秒跑完：它挂了说明你正在用的这个工具本身
坏了，后面两个目标的结论都不再可信。

## foreign：CLI 不碰不是自己起的进程

`stack status` 里每个组件都有 `managedBy`，**api 和 db 的取值不是一套**：

| 组件 | 取值                                   | 含义                         |
| ---- | -------------------------------------- | ---------------------------- |
| api  | `bazi`                                 | CLI 起的，能停               |
|      | `foreign`                              | 端口被别的进程占了，CLI 不碰 |
|      | `null`                                 | 没在跑                       |
| db   | `pg_ctl` / `docker-compose` / `remote` | CLI 起的（值就是启动方式）   |
|      | `external`                             | 库是活的，但不是 CLI 起的    |
|      | `null`                                 | 连不上                       |

所以**不要用 `managedBy === 'bazi'` 判断归属**——db 永远不会是 `bazi`。要判断"这个组件是不是我们管的"，
看它是不是 `foreign` / `external` / `null` 更可靠。

看到 `foreign` 时 CLI 会拒绝接管，也拒绝 kill。这是故意的：按端口去杀进程会误伤用户自己开的终端、
另一个 worktree、或者同事的服务。

正确处理：告诉用户 `4000 端口上有不是 bazi 起的进程`，让他们决定。不要自己去 `kill $(lsof -ti:4000)`。

推论：**不要绕过 CLI 手动起服务**（`npm run dev`、`node server.js`）。那样起的进程 CLI 管不到，
后面 `stack down` 停不掉，`stack status` 只会显示 foreign。

## verify：跑之前栈必须就绪

`backend/scripts/verify-*.mjs` 直连数据库做真实的删除/级联校验，它们**自己不会把栈拉起来**。
栈没起时的原始表现是一屏连接超时的无关报错，很容易被误读成"功能坏了"。

CLI 已经加了前置断言（退 3，`next: bazi stack up`），所以走 `./bazi verify` 就不会误判。
清单是扫目录来的，新增一个 `backend/scripts/verify-xxx.mjs` 立刻可用，不需要改 CLI 也不需要
改这份文档。

**校验脚本不要自己写建表 DDL**。`prisma/schema.prisma` 的 provider 是 postgresql，而手写的
`CREATE TABLE` 很容易顺手写成 SQLite 方言（`AUTOINCREMENT` / `DATETIME` / `INSERT OR IGNORE`），
一跑就是 `42601 语法错误`。另外 PostgreSQL 里不加引号的 `BaziRecordTrash` 会被折成小写而找不到表——
这种错误常常被 `try/catch` 吞成一条 warn，看起来"跑过了"，其实什么都没删。

正确做法：建表复用 `backend/services/schema.service.js` 的 `ensureSoftDeleteTables` /
`ensureBaziRecordTrashTable`（它们已经按 provider 分好方言），增删查一律走 Prisma Client
（`prisma.baziRecordTrash.upsert/count/deleteMany`）而不是 `$queryRaw`。绕不开裸 SQL 时，
表名和驼峰列名必须加双引号。

## 排查

```
./bazi stack logs api --tail 60     # 后端日志（pino JSON）
./bazi stack logs db                # PostgreSQL 日志
```

启动失败时 CLI 会把日志压成一条诊断再返回，不会把几十 KB 原始日志塞进 `hint`。
认得出的失败特征（缺表、连不上库、端口占用、必填环境变量缺失）会直接翻译成下一步命令。

运行态都在 `.tmp/cli/` 下（pidfile、日志、备份、pg 数据目录），已被 `.gitignore` 覆盖，可以整个删掉重来。

## 端口

api `4000`（`.env` 的 `PORT`）、db `5433`（本地 pg_ctl）或 `5432`（docker compose）。
装了 Docker 时 `env init` 默认给 5432 走 compose，没装就给 5433 走 pg_ctl。

## 要改 CLI 本身的时候

源码在 `tools/cli/`，契约测试在 `tools/cli/test/`，`./bazi test cli` 两秒跑完。

下面这些不是风格建议，是测试会当场拦下来的硬约束：

- **失败一律抛 `CliError`**，带 `exit` / `hint` / `next`。`next` 必须是一条真能跑的 `bazi` 命令——
  测试会拿 `help --json` 的命令树去验证它解析得出来。
- **`--json` 模式下 stdout 只能有一个 JSON 文档。** 想给人打东西用 `out.render`（json 模式自动跳过），
  想说进度用 `out.step` / `out.warn`（走 stderr，同时进 `payload.notes`）。子进程一律用 `out.childStdio`。
- **命令自己的 flag 不能和全局 flag 重名**，否则会被 `flagSpecFor` 的查找顺序静默吃掉。
- **`examples` 里的命令和选项必须真实存在**，测试会逐条解析。
- **破坏性命令要 `destructive: true`**，并且过 `assertDestructiveAllowed`。Agent 靠这个标记
  在动手前识别"这条得先问人"。
- json 和文本两种模式的**退出码必须一致**。

新增一条命令：在 `src/commands/` 下写好，挂进 `src/main.mjs` 的 `rootCommand.commands`。
`help --json` 会自动带上它，SKILL.md 和 README 都不需要改——这是刻意的，抄命令清单一定会腐化。
