# core-tool-handlers-bash-01 合同验收（acceptance.md）

版本 v1。记录本包合同阶段的范围、旧门结果、预登记差异与覆盖情况。替换阶段的两道相似度实测（行/结构）在 `replace/core-tool-handlers-bash-01` 阶段补入。

## 范围

- 38 个继承文件 / 6,231 行（`licensing/current-files.json` 实测：upstream-modified 13、upstream-unchanged 25）。
- 边界与「不在范围」见 `README.md`；无用代码 0（`dep:refs` 确认全部可达）。
- 接口面 38 模块 / 209 导出（`interface.md`）；调用方覆盖 `dep:refs` 全部结果（`callers.md`）。

## 旧门（`scripts/contract-gate.mjs`，2026-10-15，commit `1ebaa2bc` 基线）

| 入口                                                             | 用例 | 通过 | 失败 | 结果                       |
| ---------------------------------------------------------------- | ---- | ---- | ---- | -------------------------- |
| 源码（tsx 加载 `src/tool/handlers/**`）                          | 43   | 43   | 0    | pass                       |
| dist（`dist-entry-loader.mjs` 重定向到 `dist/tool/handlers/**`） | 43   | 43   | 0    | pass                       |
| 桩替换（38 桩覆盖后重跑源码）                                    | 43   | 0    | 43   | `allFail=true`（应全失败） |

Node 24.14.0；`KNORVIA_ENV=test`；`TSX_TSCONFIG_PATH=packages/ui/tsconfig.json`。报告 `gate-old.json`。

## 预登记差异

`known-differences.md` K-ro-1..3（`:` 判非只读、`git clean -n` 判非只读、`top` 判非只读而 `ps` 判只读）。三条均为选择 9 只读规则表的既存事实，合同保留旧判定；各有对应用例（`bash-readonly.test.ts` B-ro-2/11/15）。**无其它预登记差异**（源码/dist 两入口 0 失败）。

## 覆盖

- **只读规则表簇**（20 文件）：`tests/bash-readonly.test.ts` 90 条判定样例 + `fixtures/read-only-baseline.json` 30 条边界（git/gh/docker 多词、管道组合）。选择 9：只给判定结果样例，不贴旧表结构。
- **bash 执行簇**（18 文件）：`bash-exec-semantics/pipeline/entry-perf.test.ts` 39 条行为（B-ex-1..39），覆盖解析、权限安全、规则求值、cwd 策略、git 运行时安全、gh 限流、元数据/模型内容/输出投影、入口元数据与性能助手。期望值均为旧实现**实测记录**。
- **未覆盖（IO 重，见 `behavior.md`）**：真实 spawn 执行（`createBashToolEntry` handler、`toBashOutput`）、`bash-image-output`（写文件）、`bash-read-file-sources/-state`（读 FS/状态表）、`bash-background-lifecycle`（executionPort 能力判定）、`resolveBashPermissionRulePolicy`（核心求值 `evaluateBashRules` 已由 B-ex-13/14 覆盖）。这些模块路径与导出仍在 `interface.md`，接口默认不可变；替换阶段以端口替身 + 包内单元测试补齐。

## 平台

路径/cwd/git-runtime-safety 断言取结构（是否重置/是否不安全），不钉死宿主分隔符串；`fileByteCount`/UTF-8、命令名判定与平台无关。源码与 dist 双入口均在 Windows 实测通过；Linux 由远端 CI 复核。

## 工具缺陷修复（随本分支）

`scripts/contract-gate.mjs` 的 `--dist-loader` 在 Windows 把绝对路径直接传给 `node --import`（裸 `D:\…` 被当作裸包名，`ERR_UNSUPPORTED_ESM_URL_SCHEME`），dist 旧门无法在 Windows 生成。本分支改用 `pathToFileURL(...).href`（`file://` URL），为 node 官方支持形式，Windows/Linux 通用。属工具缺陷修复，不改测试断言、不改产品代码。
