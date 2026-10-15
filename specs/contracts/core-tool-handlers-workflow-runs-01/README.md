# core-tool-handlers-workflow-runs-01 合同（v1）

版本 **v1**（2026-10-15）。`apps/cli/packages/core/src/tool/handlers` 下 **工作流运行/发现 11 个继承文件** 的替换合同：单 run 内省（快照/摘要/情势三块/活动行）、运行与保存定义列表、模型目录、run 恢复与问题应答两件执行入口。计划书「每包流程」第二步的产物，按 issue #158 的 handlers 分包裁决顺序执行（bash-01 已合并 → workflow-01 替换进行中 → **本包** → -02）。

- 分支：`contract/core-tool-handlers-workflow-runs-01`（检出点 origin/main `5f878295`）
- 状态：**合同完成（v1）**。旧门 `scripts/contract-gate.mjs`：源码入口 n/n、dist 入口 n/n，11 桩替换后 0/n 通过（`gate-old.json`）。

## 范围与边界

**在范围**（重写范围 = `licensing/current-files.json` 里分类为继承的 11 个文件 / 1,618 行，实测）：

- **单 run 内省（6）**：`get-workflow-run.ts`（handler + ToolEntry）、`get-workflow-run-summary.ts`（确定性 `<summary>`）、`get-workflow-run-roster-output.ts`（端口视图→契约投影）、`get-workflow-run-format.ts`（模型面骨架）、`get-workflow-run-format-roster.ts`（`<health>`/`<phases>`/`<subagents>`/`<log_tail>`）、`get-workflow-run-activity-program.ts`（花名册活动行）
- **列表（3）**：`list-workflow-runs.ts`（run 历史，单行属性式）、`list-saved-workflows.ts`（保存定义清单，块式）、`list-models.ts`（宿主模型目录）
- **执行入口（2）**：`resume-workflow-run.ts`（恢复 stopped run，失败码 11–17）、`resolve-workflow-question.ts`（回答 actor 升级问题，失败码 21–24）

继承分类实测：`upstream-modified` 10 / `unreviewed` 1（`get-workflow-run-activity-program.ts`）。**无无用代码可删**：11 文件经 `dep:refs` 同源分析全部有引用（无零引用文件或导出）。

**不在范围的相邻文件**（归其它包，勿动）：

- `get-workflow-run-output-fields.ts`、`get-workflow-run-snapshot-fields.ts`、`get-workflow-run-summary-clauses.ts`、`list-models-projection.ts`、`list-saved-workflows-model-renderer.ts`、`list-workflow-runs-operation.ts`（**original**，已独立）→ 本包经公开入口消费，路径与导出不变。
- `workflow-run-introspection.ts`（内省格式基件）→ `core-tool-handlers-workflow-01` 22 件（替换进行中）；本包依赖其公开导出（前向依赖）。
- `index.ts`（barrel）→ 归**最后一个** handlers 替换包；`saved-workflows/**`（4）与 `model-reference*.ts` → `core-tool-handlers-02`。
- 其余 handler（read/write/webfetch/…/submit-result 等）→ -02 / -03。

向上依赖仅已替换/冻结面：`@knorvia/contracts`（工具 schema、失败面、`GET_WORKFLOW_RUN_ROSTER_LIMITS`/`GET_WORKFLOW_RUN_SUMMARY_MAX_CHARS`/`SAVED_WORKFLOW_PROJECT_DIR` 常量）、`../types`（ToolEntry/ToolHandler）、`../executor/workflow-artifact`（`serializeWorkflowArtifact`）、`../executor/workflow-published-artifacts`（`WORKFLOW_ARTIFACTS_INTROSPECTION_MAX_LINES`/`formatPublishedArtifactLine`）、`../../runtime-task/notification`（`formatWorkflowProviderStopError`）。

## 完成度

| 产物                                                                    | 状态 |
| ----------------------------------------------------------------------- | ---- |
| 选包与边界（继承 11 文件 / 1,618 行；无用代码 0）                       | 完成 |
| `interface.md`（11 模块导出面，机器生成 `tests/build-interface.mjs`）   | 完成 |
| `callers.md`（`dep:refs` 覆盖）                                         | 完成 |
| `stubs/`（11 桩 + targets.txt，import 即抛 `not implemented: …`）       | 完成 |
| `behavior.md`（B 条目，九项字段；语义常量/超时/预算/失败码表/文案显式） | 完成 |
| `tests/`（事件序列断言 + 金样往返；源码 + dist 双入口）                 | 完成 |
| `fixtures/`（运行记录/恢复面金样：旧实现录制真值）                      | 完成 |
| `known-differences.md` / `acceptance.md` / `gate-old.json`              | 完成 |

## 运行契约测试（两个入口）

```text
# 前置：Node 24.14.0（mise.toml）；先 pnpm build:cli-packages 构建 @knorvia/core 及其依赖
$env:TSX_TSCONFIG_PATH = "<repo>/packages/ui/tsconfig.json"
$env:KNORVIA_ENV = "test"

# 统一旧门（源码 + dist + 桩替换，写 gate-old.json）
node <node24> scripts/contract-gate.mjs --contract specs/contracts/core-tool-handlers-workflow-runs-01 \
  --env KNORVIA_ENV=test --env TSX_TSCONFIG_PATH=<abs>/packages/ui/tsconfig.json \
  --dist-loader specs/contracts/core-tool-handlers-workflow-runs-01/dist-entry-loader.mjs \
  --stub-root specs/contracts/core-tool-handlers-workflow-runs-01/stubs \
  --stub-targets specs/contracts/core-tool-handlers-workflow-runs-01/stubs/targets.txt
```
