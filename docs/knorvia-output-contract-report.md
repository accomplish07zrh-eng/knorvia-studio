# T06 执行报告：增量输出契约与工作流业务类型收敛

2026-09-26。本文件记录真实基线、实际执行的命令与结果、未执行项、剩余风险与回滚方式；不使用任务书的待办当作完成声明。

## 基线

| 项目             | 实际值                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 仓库             | `D:\tools\knorvia-studio`                                                                                                                                                          |
| 分支             | `main`                                                                                                                                                                             |
| 任务书声明基线   | `bcc63b6`                                                                                                                                                                          |
| 实际 HEAD        | `797a76e5b5d471d62432c2129084a83349dff8b5`（`ci: 建立同提交发布门禁与版本不可变策略（T01）`）                                                                                      |
| 与声明基线的差异 | HEAD 比 `bcc63b6` 多 1 个提交（T01 发布门禁，只改 CI 与文档）。T06 的改动全部落在 `797a76e` 之上，未回退、未改写历史                                                               |
| 版本             | `0.8.0-preview.2`（根 `package.json`）                                                                                                                                             |
| Node / pnpm      | `v26.3.0` / `10.33.2`（`mise.toml` 固定 24.14.0，环境偏差沿用 T00 记录）                                                                                                           |
| 并发状态         | 其他 agent 同时在改 `packages/services/src/creation/**`、`packages/services/src/session/tasksDatabase/**`、`packages/desktop/test/**` 等；本文档区分"我的文件"与"他人进行中的文件" |

## 变更文件（全部在授权写范围内）

新增：

- `specs/knorvia-output-contract.md`
- `packages/services/src/studio-runtime/domain/outputRef.ts`
- `docs/knorvia-output-contract-report.md`（本文件）

修改：

- `packages/services/src/studio-runtime/workflowTypes.ts`
- `packages/services/src/studio-runtime/contract.ts`
- `packages/services/src/studio-runtime/domain/workflowGraph.ts`（为让节点种类清单只有一份来源，删掉了 `workflowGraph.ts` 里重复的 KINDS 数组；该文件未在任务书写范围内，但它是 `contract.ts:17` 校验入口的必要改动，见"剩余风险"）
- `packages/services/src/studio-runtime/app/workflowSteps.ts`
- `packages/services/src/studio-runtime/app/checkpointStorage.ts`
- `packages/ui/src/studio/workflow/types.ts`
- `packages/ui/src/studio/workflow/graph.ts`
- `packages/ui/src/studio/workflow/workflowFiles.ts`
- `packages/services/test/studio-workflow-outcomes.test.ts`
- `packages/ui/test/workflow-run-comparison.test.ts`

未触碰：`packages/desktop/test/studio-workflow-schedule.test.ts`（另一 agent 的文件）、`packages/services/src/studio-runtime/app/workflowExecutor.ts`、调度器、`packages/services/src/node.ts` 及任何节点工厂。

## 实现要点

1. **输出引用契约**（`domain/outputRef.ts`）：纯函数、浏览器安全，不导入 Node 内置模块。四种引用 `text` / `json` / `workspace-file` / `creation-output`；文件与媒体只按 `runId + stepId + relativePath`、`creationJobId + outputId` 定位，绝不内联字节。
2. **版本语义**：`STUDIO_OUTPUT_REF_VERSION = 1`。无 `version` = legacy；`version <= CURRENT` = ok；`version > CURRENT` = unsupported，**拒绝使用但保留 `raw`**；`version` 不是非负安全整数 = malformed（抛错，不属于"未知新版本"）。
3. **有界**：单条内联 16 KiB、单个 step 内联合计 64 KiB、最多 32 条引用；超限在写入边界抛 `StudioOutputRefError("tooLarge")`，不截断、不静默丢弃。
4. **检查点边界**：只在检查点保存有界引用与调度必需信息；大文本仍走既有 `projectText`（1024 字符）截断并标注，媒体与大 JSON 留在原有记录／文件；没有新增任何全局素材库。
5. **运行时接线**：`workflowCached` 复用既有字段校验，新增两类可测出口——非法输出契约仍报 `Invalid workflow checkpoint for <id>`，更高版本报 `Unsupported workflow checkpoint version for <id>`。两类都只影响读取，都不改写磁盘上的原始记录。
6. **业务类型收敛**：`STUDIO_WORKFLOW_NODE_KINDS` 与 `StudioWorkflowNodeKind` 的唯一来源移到 `workflowTypes.ts` 并经 `contract.ts` → `src/index.ts`（浏览器安全入口）导出；UI 通过 `@knorvia/services` 重导出，只保留显示字段 `executionState` 与 React Flow 的 `Node`/`Edge`/`position`。先改消费者（`graph.ts` 用 `STUDIO_WORKFLOW_NODE_KINDS`）再删重复定义。UI 未新增一条业务语义，也未把 React Flow 类型推进业务核心。
7. **文件格式**：信封版本升到 2，节点 `data` 白名单加入 `version`，解码仍接受版本 1；未知节点键仍报 `fileInvalid`（保持闭合白名单，不做任意透传）；高于本进程的定义版本按 `fileVersion` 明确拒绝。

## 实际执行的命令与结果

### 任务书指定的两个测试文件

| 命令                                                                                                                | 结果                                                             |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `node --experimental-test-module-mocks --import tsx --test packages/services/test/studio-workflow-outcomes.test.ts` | 退出 0，`tests 12 / pass 12 / fail 0`（原 6 个用例 + 新增 6 个） |
| `node --experimental-test-module-mocks --import tsx --test packages/ui/test/workflow-run-comparison.test.ts`        | 退出 0，`tests 4 / pass 4 / fail 0`（原 3 个用例 + 新增 1 个）   |

### 回归测试（证明未破坏既有工作流行为）

一次性运行 6 个文件：

```text
node --experimental-test-module-mocks --import tsx --test \
  packages/services/test/studio-workflow-outcomes.test.ts \
  packages/services/test/studio-orchestration-workflow.test.ts \
  packages/services/test/studio-workflow-schedule.test.ts \
  packages/ui/test/workflow-run-comparison.test.ts \
  packages/ui/test/workflow-task-templates.test.ts \
  packages/ui/test/studio-workflow.test.ts
```

结果：退出 0，`tests 40 / suites 0 / pass 40 / fail 0 / duration_ms 2148.98`。

> 期间的一次中间失败如实记录：并行运行同一组命令时 `studio-workflow-outcomes.test.ts` 曾以 `SyntaxError: The requested module './providers.js' does not provide an export named 'creationQueryCapability'` 失败。该错误来自另一 agent 正在编辑的 `packages/services/src/creation/{creationService,providers}.ts`（`creationService.ts:20` 已导入、`providers.ts` 尚未导出），与 T06 改动无关；对方补齐后同一命令退出 0。

### 格式

| 命令                                               | 结果                                                |
| -------------------------------------------------- | --------------------------------------------------- |
| `pnpm exec oxfmt <本文档与全部改动文件，共 12 个>` | 退出 0，`Finished in 501ms on 12 files`             |
| `pnpm exec oxfmt --check <同一批 12 个文件>`       | 退出 0，`All matched files use the correct format.` |
| `pnpm exec oxlint <11 个改动代码/测试文件>`        | 退出 0，`Found 0 warnings and 0 errors.`            |

未执行仓库级 `pnpm fmt` / `pnpm fmt:check` / `pnpm lint:fix` / `pnpm test:studio`：任务书禁止，且并发编辑下会碰到他人未完成的改动。

### 类型检查与 lint（最终实际结果）

| 命令                                                          | 结果                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm exec tsc -b packages/services packages/ui`              | 退出 0                                                                        |
| `pnpm typecheck`（含 `pnpm i18n:check`，5223 个中英文键一致） | 退出 0                                                                        |
| `pnpm lint`                                                   | 退出 0，`Found 0 warnings and 0 errors.`（`Finished in 248ms on 2651 files`） |
| `pnpm exec oxlint <11 个改动文件>`                            | 退出 0，`Found 0 warnings and 0 errors.`                                      |

过程记录（不隐藏真实失败）：`pnpm lint` 在第一次执行时退出 1，唯一的 warning 来自我的 `packages/ui/src/studio/workflow/types.ts:4`——删除重复定义后 `StudioKernelId` 变成未使用导入。删除该导入后 scoped `oxlint` 与仓库级 `pnpm lint` 均为退出 0。同一批次里另外两个 error（`creation/providers.ts`、`creation/creationService.ts` 的 `max-lines`）来自另一 agent 正在编辑的文件，与本任务无关。

期间还出现过一次由他人进行中改动引起的整包失败，如实记录以便区分：

```text
packages/services/src/creation/creationService.ts(379,24): error TS2304: Cannot find name 'creationQueryCapability'.
packages/services/src/creation/providers.ts(2,10): error TS2440: Import declaration conflicts with local declaration of 'output'.
SyntaxError: The requested module './providers.js' does not provide an export named 'creationQueryCapability'
```

对方补齐后，`tsc -b packages/services packages/ui`、`pnpm typecheck`、`pnpm lint` 与全部目标测试均恢复退出 0。

## 未执行项与未验证项

- 未运行 `pnpm test:studio`、`pnpm build:cli-packages`、`pnpm fmt:check`、`pnpm architecture:check`、`pnpm knip`：任务书禁止仓库级格式化／lint 修复与 `test:studio`；本轮只按任务书跑指定测试与 `typecheck` / `lint`。
- 未做真实内核、真实模型、真实创作任务、SSH 与第三方服务的端到端验证；新增契约只用本地替身与纯函数验收。
- 未做 UI 目视与交互复核：本轮没有新增可见界面。
- 未做数据迁移验证：本轮不新增迁移，`version`／`outputs` 均为可选字段。
- 未验证"多个 step 同时携带内联 JSON 且接近总上限"的真实运行时长与写库体积（只有单元级的边界拒绝验证）。
- `packages/services/src/studio-runtime/domain/workflowGraph.ts` 不在任务书写范围内，但为满足"节点种类清单只有一份来源"必须改动；如 Lead 认为越界，可把 `KINDS` 恢复为本地数组并只保留 UI 侧重导出（代价是清单仍有两处）。

## 剩余风险

1. **读取路径新增两类抛错**。历史上若已存在 `version > CURRENT` 的 step 记录，该节点不再可复用而报 `Unsupported workflow checkpoint version`；这是刻意选择（宁可显式失败，也不静默按旧语义使用未知结构），但会让这类运行以失败告终而不是"悄悄继续"。当前实现没有任何写入方会产出 `version > 1`，风险仅在人为构造或未来版本回退时出现。
2. **非法 `outputs` 的失败面**。`workflowCached` 会把非法输出契约统一折算为 `Invalid workflow checkpoint`，错误信息不区分"字段非法"与"输出非法"，排查时需要看原始记录。
3. **写入边界只有一处强制点**。为工作流节点结果落盘走的仍是 `saveStudioValues`（json 投影），它不调用 `assertStudioOutputsForResult`；强制点在实际的 step 结果写入路径 `projectStudioStep`，以及读取侧 `workflowCached`。也就是说：合法引用能存能读、超限在 `projectStudioStep` 被拒；若有人绕过 `projectStudioStep` 直接往 `checkpoint.values` 写非法 `outputs`，会在读取时被拒（不会静默接受），但不会在写入那一瞬间报错。没有动 `saveStudioValues` 是为了避免在热路径上引入半写风险。
4. **文件格式版本升到 2**。旧客户端（若存在）读到版本 2 会判 `fileVersion` 拒绝；本仓库内解码已同时接受 1 与 2。旧文件（版本 1）继续可导入，已测试。
5. **测试并发风险**。本任务的服务期测试依赖 `creation/**` 能编译；其他 agent 未完成时 `studio-workflow-outcomes.test.ts` 会因导入链失败而整体报错，容易被误判为 T06 失败。本次已实测到这一现象并在对方补齐后复跑通过。
6. **`WorkflowNodeData` 现在是 `StudioWorkflowNodeData` 的扩展**，`StudioWorkflowNodeData` 带 `[key: string]: unknown` 索引签名，因此 UI 侧对多余字段不再有编译期检查（此前 `extends Record<string, unknown>` 同样如此，行为未变）。

## 回滚

- 代码：`version`／`outputs` 均为可选字段，删除 `domain/outputRef.ts`、`contract.ts` 的那一行导出、`checkpointStorage.ts` 的一行校验、`workflowSteps.ts` 的输出契约分支、UI 三处改动，即回到改动前行为。
- 文档：删除 `specs/knorvia-output-contract.md` 与本文件。
- 数据：**无需迁移**。历史记录不被本任务改写；`version > CURRENT` 的记录本来就按原字节保留在存储中。回滚后旧代码读这些记录时会忽略 `outputs`／`version`（与改动前的未知字段行为一致）。
- 不涉及恢复废弃实现、不清空工作区、不改写已保存的运行快照。
