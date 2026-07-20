# bazi-master

## 用 ./bazi，不要手搓命令

仓库根有一个面向 Agent 调用的程序化 CLI。环境准备、起停本地栈、数据库迁移、测试、端到端校验
都走它，不要直接调 npm script 或手动 `node server.js`——手动起的进程 CLI 管不到，之后停不掉。

```
./bazi help --json          # 完整能力清单（唯一真源，不要照抄进任何文档）
./bazi doctor --json        # 环境体检，每项都带可执行的修复命令
./bazi stack status --json  # 动手之前先看这个
```

所有命令都支持 `--json`：stdout 只有一个 JSON 文档，进度和噪音走 stderr。
退出码是契约：`0` 成功 / `1` 结果失败 / `2` 用法错 / `3` 环境未就绪 / `4` 远端拒绝 / `5` 可重试 / `7` 命中安全边界。

工作流顺序、要避的坑、项目约定见 [.claude/skills/bazi-cli/SKILL.md](.claude/skills/bazi-cli/SKILL.md)。
CLI 源码在 [tools/cli/](tools/cli/)。
