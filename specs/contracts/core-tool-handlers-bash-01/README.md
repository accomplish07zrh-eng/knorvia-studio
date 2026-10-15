# core-tool-handlers-bash-01 合同（v1）

版本 **v1**（2026-10-15）。`apps/cli/packages/core/src/tool/handlers` 下 **bash 执行 + 只读策略规则表** 的替换合同：38 个继承文件。计划书「每包流程」第二步的产物，按 M1 复盘「handlers 重切为 ≤40 继承文件包、每轮一簇」的裁决（issue #158）执行。

- 分支：`contract/core-tool-handlers-bash-01`（检出点 origin/main `1ebaa2bc`）
- 状态：**合同完成（v1）**。旧门 `scripts/contract-gate.mjs`：源码入口 43/43、dist 入口 43/43，38 桩替换后 0/43 通过（`gate-old.json`）。

## 范围与边界

**在范围**（重写与删除范围 = `licensing/current-files.json` 里分类为继承的 38 个文件 / 6,231 行，实测）：

- `apps/cli/packages/core/src/tool/handlers/bash.ts`、`tool-perf.ts`
- `bash-*.ts`（bash 执行簇，18 文件）：`bash-{background-lifecycle,background-policy,command-parser,command-permission-policy,command-rule-evaluator,cwd-policy,gh-rate-limit,git-runtime-safety,image-output,metadata,model-content,output,prompt,read-file-sources,read-file-state,semantics}.ts`
- `bash-readonly-policy*.ts`（只读规则表簇，20 文件）：`bash-readonly-policy{,-types,-commands,-flags,-flags-file,-flags-git,-flags-process,-flags-text,-argv,-argv-direct,-argv-flags,-argv-git,-argv-io,-callbacks,-git-callbacks,-git-subcommands-core,-git-subcommands-history,-multiword-core,-multiword-gh,-simple-commands}.ts`

继承分类实测：`upstream-modified` 13 / 2,259 行，`upstream-unchanged` 25 / 3,972 行（无 unreviewed / original / independent-replacement）。**无无用代码可删**：38 文件经 `pnpm dep:refs` 全部经 `handlers/index.ts` 桶（→ `builtInTools`）与包内互引用可达，无 knip 确认无用的文件或孤立导出，故本包不含删除提交。

**不在范围的相邻文件**（归其它 handlers 包，勿动）：

- `index.ts`（barrel，导入全部 handler，耦合全目录）→ 归**最后一个** handlers 替换包。
- AskUserQuestion 2（`ask-user-question{,-result}.ts`）、工作流修订 20（`create/amend/save/eval-workflow*` + `workflow-{drafts,path-source,script-analysis,script-notes,script-path,analysis-display,run-introspection}.ts`）→ `core-tool-handlers-workflow-01`。
- 工作流运行/发现 11（`get-workflow-run*`、`list-workflow-runs`、`list-saved-workflows`、`list-models`、`resume-workflow-run`、`resolve-workflow-question`）→ `core-tool-handlers-workflow-runs-01`。
- `saved-workflows/**`（4）与其余 handler（read/write/webfetch/websearch/glob/grep/todo/plan-mode/edit/agent/collaboration/cron/off-skill/task-output/task-stop/escalate/send-message/respond-to-coordinator/submit-result/file-search/model-reference/read-session-context 等）→ `core-tool-handlers-02`（及后续包）。
- `generated/bash-command-registry.ts`（Fig 生成数据，ISC 第三方）→ 不重写，走第三方核实登记；`node-repl*.ts`（independent-replacement）与 20 个 original 文件不动。

向上依赖仅已替换包（core-tool-01 ✓ / core-01 ✓）：`../types`、`../path-normalization`、`../path-policy`、`../bash-timeout-policy`、`../../permission/rule-matching` 等；同目录仅依赖 bash 兄弟 + tool-perf。**无对 -02 / workflow 包的依赖。**

## 完成度

| 产物                                                                         | 状态 |
| ---------------------------------------------------------------------------- | ---- |
| 选包与边界（继承 38 文件 / 6,231 行；无用代码 0）                            | 完成 |
| `interface.md`（38 模块、209 导出，机器生成；大型规则表只列名不贴字面量）    | 完成 |
| `callers.md`（覆盖 `dep:refs` 全部结果：209 导出、19 包外引用点）            | 完成 |
| `stubs/`（38 桩，import 即抛 `not implemented: core-tool-handlers-bash-01`） | 完成 |
| `behavior.md`（B-ro-1..18 + B-ex-1..39）                                     | 完成 |
| `tests/`（5 文件、43 例；源码 + dist 双入口各 43/43）                        | 完成 |
| `fixtures/`（`read-only-baseline.json`，由 `fixtures.test.ts` 读取）         | 完成 |
| `known-differences.md`（K-ro-1..3，各有对应用例）                            | 完成 |
| `acceptance.md` / `gate-old.json`（contract-gate 两入口 + 38 桩全失败）      | 完成 |

## 运行契约测试（两个入口）

```text
# 前置：Node 24.14.0（mise.toml）；构建 @knorvia/core 及其依赖
$env:TSX_TSCONFIG_PATH = "<repo>/packages/ui/tsconfig.json"
$env:KNORVIA_ENV = "test"

# 统一旧门（源码 + dist + 桩替换，写 gate-old.json）
node <node24> scripts/contract-gate.mjs --contract specs/contracts/core-tool-handlers-bash-01 \
  --env KNORVIA_ENV=test --env TSX_TSCONFIG_PATH=<abs>/packages/ui/tsconfig.json \
  --dist-loader specs/contracts/core-tool-handlers-bash-01/dist-entry-loader.mjs \
  --stub-root specs/contracts/core-tool-handlers-bash-01/stubs \
  --stub-targets specs/contracts/core-tool-handlers-bash-01/stubs/targets.txt
```

当前结果（旧实现，v1 旧门 2026-10-15）：源码入口 43/43、dist 入口 43/43；38 桩替换后 0/43 通过（`allFail=true`）；预登记差异 0 条。

## 注意事项

1. **只读规则表按选择 9。** `bash-readonly-policy*` 20 文件是规则表；合同只给判定结果样例（`tests/bash-readonly.test.ts` 90 条 + `fixtures/read-only-baseline.json` 30 条），实现阶段依各命令公开文档重建，不照搬旧表结构与顺序。
2. **K-ro-1..3 不要顺手改。** `:` 判非只读、`git clean -n` 判非只读、`top` 判非只读而 `ps` 判只读——三条公开文档与旧判定不一致处，合同保留旧判定（`known-differences.md`）。
3. **`scripts/contract-gate.mjs` 的 Windows 修复。** 本包旧门在 Windows 上跑 dist 入口时发现：`--dist-loader` 把绝对路径直接传给 `node --import`，Windows 上裸 `D:\…` 会被当作裸包名（`ERR_UNSUPPORTED_ESM_URL_SCHEME`），导致 dist 入口无法在 Windows 生成。本分支把该路径改用 `pathToFileURL(...).href`（`file://` URL，Windows 与 Linux 均为 node 官方支持形式），属**工具缺陷修复**，不改任何测试断言或产品代码。合入后所有包的 dist 旧门在 Windows 可用。
4. **时序断言。** `getGhRateLimitHint`（B-ex-21）有模块级冷却时间戳，用「首命中→紧接抑制」的事件序列断言，不用 sleep。
5. **IO 重的执行路径不黑盒覆盖**（真实 spawn、写文件、读 FS、executionPort 能力判定），见 `behavior.md`「未覆盖」节；其模块路径与导出仍在 `interface.md`，接口默认不可变。

## 条目 → 测试对照表

| 条目       | 测试                                                                                                                            | 状态 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ---- |
| B-ro-1..15 | `bash-readonly.test.ts`「B-ro-1..15 isRuntimeReadOnlyBashCommand reproduces the recorded judgment baseline」                    | 通过 |
| B-ro-16    | `bash-readonly.test.ts`「B-ro-16 judgment oracle is total and boolean across every sample」                                     | 通过 |
| B-ro-17    | `bash-readonly.test.ts`「B-ro-17 isSedInPlaceBashCommand flags only sed -i」                                                    | 通过 |
| B-ro-18    | `fixtures.test.ts`「B-ro-18 extended fixture baseline reproduces every recorded read-only judgment」                            | 通过 |
| B-ex-1     | `bash-exec-semantics.test.ts`「B-ex-1 isSilentBashCommand flags only the silent command set」                                   | 通过 |
| B-ex-2     | `bash-exec-semantics.test.ts`「B-ex-2 isSilentBashCommand aggregates pipelines and skips \|\| fallbacks」                       | 通过 |
| B-ex-3     | `bash-exec-semantics.test.ts`「B-ex-3 isSilentBashCommand rejects unparseable input」                                           | 通过 |
| B-ex-4     | `bash-exec-semantics.test.ts`「B-ex-4 interpretBashReturnCode maps terminal statuses」                                          | 通过 |
| B-ex-5     | `bash-exec-semantics.test.ts`「B-ex-5 interpretBashReturnCode gives semantic non-error readings for exit 1」                    | 通过 |
| B-ex-6     | `bash-exec-semantics.test.ts`「B-ex-6 interpretBashReturnCode falls back to the exit code and signal」                          | 通过 |
| B-ex-7     | `bash-exec-semantics.test.ts`「B-ex-7 isBashProviderErrorStatus treats only failed non-zero non-semantic as errors」            | 通过 |
| B-ex-8     | `bash-exec-semantics.test.ts`「B-ex-8 analyzeBashCommand splits a pipeline into named invocations」                             | 通过 |
| B-ex-9     | `bash-exec-semantics.test.ts`「B-ex-9 analyzeBashCommand records output redirection」                                           | 通过 |
| B-ex-10    | `bash-exec-semantics.test.ts`「B-ex-10 analyzeBashCommand detects dynamic words and operators」                                 | 通过 |
| B-ex-11    | `bash-exec-semantics.test.ts`「B-ex-11 analyzeBashCommand flags a parse error on unterminated quotes」                          | 通过 |
| B-ex-12    | `bash-exec-semantics.test.ts`「B-ex-12 isBashCommandPermissionSafe rejects dynamic and subshell analyses」                      | 通过 |
| B-ex-13    | `bash-exec-semantics.test.ts`「B-ex-13 evaluateBashRules allows on empty rules or an exact command match」                      | 通过 |
| B-ex-14    | `bash-exec-semantics.test.ts`「B-ex-14 evaluateBashRules honours deny rules and safe prefix matching」                          | 通过 |
| B-ex-15    | `bash-exec-semantics.test.ts`「B-ex-15 decideBashCwdPolicy drops the decision unless a main-scope completed run moved the cwd」 | 通过 |
| B-ex-16    | `bash-exec-semantics.test.ts`「B-ex-16 decideBashCwdPolicy keeps an in-workspace cwd and resets an escaping one」               | 通过 |
| B-ex-17    | `bash-exec-semantics.test.ts`「B-ex-17 appendBashCwdStderrSuffix joins, replaces empty stderr and no-ops」                      | 通过 |
| B-ex-18    | `bash-exec-semantics.test.ts`「B-ex-18 analysisContainsGitCommand recognizes git incl. command wrappers」                       | 通过 |
| B-ex-19    | `bash-exec-semantics.test.ts`「B-ex-19 analysisContainsGitAndDirectoryChange requires both git and a cd」                       | 通过 |
| B-ex-20    | `bash-exec-semantics.test.ts`「B-ex-20 isGitRuntimeContextUnsafe keys off a resolvable working directory」                      | 通过 |
| B-ex-21    | `bash-exec-semantics.test.ts`「B-ex-21 getGhRateLimitHint fires once per cooldown and only for gh rate-limit output」           | 通过 |
| B-ex-22    | `bash-exec-pipeline.test.ts`「B-ex-22 bash metadata describers project a command input」                                        | 通过 |
| B-ex-23    | `bash-exec-pipeline.test.ts`「B-ex-23 bash metadata describers stay total on absent input」                                     | 通过 |
| B-ex-24    | `bash-exec-pipeline.test.ts`「B-ex-24 readStringProperty reads only string-valued keys」                                        | 通过 |
| B-ex-25    | `bash-exec-pipeline.test.ts`「B-ex-25 isBashOutputProviderError mirrors the failed/non-zero/semantic rule」                     | 通过 |
| B-ex-26    | `bash-exec-pipeline.test.ts`「B-ex-26 formatBashModelContent renders the command output as text」                               | 通过 |
| B-ex-27    | `bash-exec-pipeline.test.ts`「B-ex-27 createEmptyBashPerformanceTelemetry builds an empty command span」                        | 通过 |
| B-ex-28    | `bash-exec-pipeline.test.ts`「B-ex-28 createBashBackgroundPerformanceTelemetry marks a backgrounded command」                   | 通过 |
| B-ex-29    | `bash-exec-pipeline.test.ts`「B-ex-29 createBashProviderDescription states the bash contract」                                  | 通过 |
| B-ex-30    | `bash-exec-pipeline.test.ts`「B-ex-30 isBashAutoBackgroundEligible keys off the invocation shape」                              | 通过 |
| B-ex-31    | `bash-exec-entry-perf.test.ts`「B-ex-31 bashToolEntry declares a high-risk, approval-gated, non-read-only tool」                | 通过 |
| B-ex-32    | `bash-exec-entry-perf.test.ts`「B-ex-32 classifyCommand buckets well-known command families」                                   | 通过 |
| B-ex-33    | `bash-exec-entry-perf.test.ts`「B-ex-33 classifySafeCommandIdentity collapses an invocation to a safe identity」                | 通过 |
| B-ex-34    | `bash-exec-entry-perf.test.ts`「B-ex-34 commandHash is deterministic for the same command」                                     | 通过 |
| B-ex-35    | `bash-exec-entry-perf.test.ts`「B-ex-35 roundNonNegativeMs clamps negatives and floors values」                                 | 通过 |
| B-ex-36    | `bash-exec-entry-perf.test.ts`「B-ex-36 elapsedMsSince yields a non-negative number」                                           | 通过 |
| B-ex-37    | `bash-exec-entry-perf.test.ts`「B-ex-37 fileByteCount counts UTF-8 bytes」                                                      | 通过 |
| B-ex-38    | `bash-exec-entry-perf.test.ts`「B-ex-38 readToolExecutionTelemetry returns undefined for a plain object」                       | 通过 |
| B-ex-39    | `bash-exec-entry-perf.test.ts`「B-ex-39 workspaceKind reports local for a local context」                                       | 通过 |

共 57 条行为（B-ro-1..18、B-ex-1..39）、41 行对照，每行都有对应用例（无空行）。
