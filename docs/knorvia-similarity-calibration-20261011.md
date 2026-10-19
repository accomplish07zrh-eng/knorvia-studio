# 相似度工具校准报告（M0-8）

2026-10-11 · 工具：`scripts/provenance/similarity.mjs`（行相似度 + 结构相似度） · 对应任务：M0-8（issue #91）

本报告记录 `scripts/provenance/similarity.mjs` 的算法口径、上游树来源与校验方式、结构门槛的校准过程与结果、改名副本验证，以及 439 个历史替换文件的全量复跑结果。**校准后的门槛写入工具常量，此后不再调整**（任务计划书「工具要求」）。

## 1. 比较对象与门槛

- 比较对象：被替换的旧文件（`--old`，可来自指定提交）与整个上游固定提交 `zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521`（`--upstream-dir`，仓库外缓存目录）。
- 只与同类文件比较：`ts/tsx/mts/cts/js/jsx/mjs/cjs` 同属一组，其余按扩展名各自成组。
- 行门槛（与记账同一算法，`docs/knorvia-provenance-bookkeeping-20261010.md` 第 4 节）：
  - 规范化：去首尾空白、丢空行、丢只含 `{ } ( ) [ ] ; ,` 的行、丢以 `import ` / `export * from` / `export {` 开头的行；注释行保留。
  - 包含率 = 某比较文件包含的候选规范化行数 ÷ 候选规范化行数，取最大值。
  - 最长连续相同段用对角线种子扩展法求精确值（同一对角线只从最先出现的候选位置向前延伸一次，并记录结束位置以避免跳段）。
  - 判定：规范化行数 ≥ 10 时需要包含率 < 0.2 且最长段 < 8；< 10 行时包含率必须为 0。
- 结构门槛：TypeScript 词法分析器切 token（标识符 → `I`，字符串 → `S`，数字 → `N`，模板字面量 → `T`，注释与 import/export 声明剔除），winnowing 每 25 个 token 一个哈希、窗口 20；指标 = 候选指纹落在同一个比较文件里的比例，取最大值。
- 输出 JSON：每个候选的行数、最高包含率及对应文件、最长段及对应文件、结构相似度及对应文件、违规项；退出码 0 通过 / 1 违规 / 2 用法错误。

## 2. 上游树来源与完整性校验

上游固定提交的树**不进主仓**，放在仓库外缓存目录（本机：`D:\knorvia studio开发\cache\zcode-872ad960`）。本机另有一个仓库外 bare 对象库 `D:\tools.cache\knorvia-provenance\upstream.git`，本次即由它导出。

校验方式（全部对 `licensing/upstream-baseline.json` 的 6973 条记录做全量比对，不是抽样）：

1. `git --git-dir=<bare> cat-file -t 872ad960…` → `commit`；`ls-tree -r` 得到 **6973** 个路径。
2. 逐条比对 `path` / `mode` / `blob` / `bytes`：**差异 0**（6973/6973 一致）。
3. 把 6973 个 blob 全部送进 `cat-file --batch-check` 校验类型与字节数：**missing 0、类型/大小不符 0**（排除 blobless/partial clone）。
4. 导出后对目录再做一次逐文件 `sha256` 与字节数比对：**missing 0、hashDiff 0、sizeDiff 0、extra 0**，共 72,117,118 字节。

导出方式注意：`git archive` 会按 `eol` 属性改写换行（首次尝试时 4290 个文件因此不一致），所以改用 `git cat-file --batch` 按精确字节写出，再做第 4 步校验。Lead 提到的 `packages/zcode-cua/pip-session.js` 为 11 字节，与 baseline 的 `bytes` 一致，是上游真实内容而不是 stub。

## 3. 校准方法与结果（结构门槛）

候选集合：`licensing/current-files.json` 中 `classification = independent-replacement` 的 **439** 个文件（438 个 `.ts` + 1 个 `.mjs`，全部是脚本文件，无二进制）。

实测结构相似度分布（对上游同类文件的最高值）：

| 区间         | 文件数 |
| ------------ | ------ |
| 0            | 157    |
| (0, 0.05]    | 90     |
| (0.05, 0.10] | 56     |
| (0.10, 0.15] | 35     |
| (0.15, 0.20] | 22     |
| (0.20, 0.25] | 23     |
| (0.25, 0.30] | 16     |
| (0.30, 0.35] | 11     |
| (0.35, 0.40] | 4      |
| (0.40, 0.45] | 4      |
| (0.45, 0.50] | 2      |
| (0.50, 0.55] | 8      |
| (0.60, 0.65] | 1      |
| (0.65, 0.70] | 3      |
| (0.85, 0.90] | 1      |
| (0.90, 0.95] | 2      |
| (1.00, 1.05] | 4      |

- 实测最大值 **1.000**（4 个文件与上游同类文件结构完全一致）。
- 按「取能让 439 个文件全部通过的最小值、向上取到 0.05 的整数倍」得到 1.05；按规则**超过 0.4 取 0.4**，因此结构门槛 = **0.4**，并把这 23 个超过 0.4 的文件列入替换队列。

### 超过 0.4 的历史文件（替换队列，23 个）

| 文件                                                                                          | 结构相似度 | 最相似比较文件                                                  |
| --------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------- |
| `apps/cli/packages/adapters/src/model/retry-budget.ts`                                        | 1.000      | `apps/zcode-cli/packages/adapters/src/model/retry-budget.ts`    |
| `apps/cli/packages/adapters/src/plugins/types.ts`                                             | 1.000      | `apps/zcode-cli/packages/adapters/src/plugins/types.ts`         |
| `apps/cli/packages/adapters/src/storage/session-store/repositories/usage-values.ts`           | 1.000      | `packages/ui/src/lib/uiFontSize.ts`                             |
| `apps/cli/packages/node-repl-host/src/execution-contract.ts`                                  | 1.000      | `apps/zcode-cli/packages/node-repl-host/dist-types/server.d.ts` |
| `apps/cli/packages/adapters/src/plugins/source-errors.ts`                                     | 0.917      | `apps/zcode-cli/packages/adapters/src/plugins/source-errors.ts` |
| `apps/cli/packages/core/src/repl/session-contract.ts`                                         | 0.909      | `apps/zcode-cli/packages/core/src/repl/node-repl-session.ts`    |
| `apps/cli/packages/adapters/src/storage/session-store/repositories/script-workflow-codecs.ts` | 0.899      | 同名上游文件                                                    |
| `apps/cli/packages/adapters/src/mcp/oauth-provider.ts`                                        | 0.680      | 同名上游文件                                                    |
| `apps/cli/packages/adapters/src/mcp/telemetry.ts`                                             | 0.673      | 同名上游文件                                                    |
| `apps/cli/packages/adapters/src/model/model-execution.ts`                                     | 0.657      | 同名上游文件                                                    |
| `apps/cli/packages/adapters/src/exec/execution-adapter-types.ts`                              | 0.622      | 同名上游文件                                                    |
| `apps/cli/packages/core/src/tool/scheduler.ts`                                                | 0.538      | 同名上游文件                                                    |
| `apps/cli/packages/adapters/src/mcp/windows-job-object.ts`                                    | 0.532      | 同名上游文件                                                    |
| `apps/cli/packages/adapters/src/model/runner-runtime.ts`                                      | 0.526      | 同名上游文件                                                    |
| `apps/cli/packages/adapters/src/mcp/oauth.ts`                                                 | 0.500      | 同名上游文件                                                    |
| `apps/cli/packages/contracts/src/interfaces/browser-control.port.ts`                          | 0.500      | 同名上游文件                                                    |
| `apps/cli/packages/core/src/browser-client/playwright-contract.ts`                            | 0.500      | `apps/zcode-cli/packages/core/src/browser-client/playwright.ts` |
| `apps/cli/packages/core/src/tool/input-validation-model-content.ts`                           | 0.500      | 同名上游文件                                                    |
| `apps/cli/packages/core/src/tool/registry.ts`                                                 | 0.500      | 同名上游文件                                                    |
| `apps/cli/packages/adapters/src/mcp/stdio-transport.ts`                                       | 0.455      | 同名上游文件                                                    |
| `apps/cli/packages/core/src/browser-client/facade-contract.ts`                                | 0.451      | `apps/zcode-cli/packages/core/src/browser-client/facade.ts`     |
| `apps/cli/packages/adapters/src/mcp/oauth-shared.ts`                                          | 0.429      | 同名上游文件                                                    |
| `apps/cli/packages/adapters/src/model/runner-record.ts`                                       | 0.412      | 同名上游文件                                                    |

（这些文件是 M0-2 按「隔离作者与验收证据」登记的 historical batch；本报告只按计划书的规则给出结构门槛实测值与替换队列，不改变它们的登记结论。）

## 4. 439 个历史替换文件的全量复跑（两道门槛）

在同一候选集合上跑默认两道门槛（`--gates all`）：

- **行门槛**：136 个通过、303 个不通过。
  - 规范化行数 < 10：14 个，其中 7 个包含率不为 0（按规则不通过）；
  - 包含率 ≥ 0.2：292 个；最长段 ≥ 8：109 个；两者同时超：105 个；
  - 行包含率分布：0 的 8 个、(0,0.1] 37 个、(0.1,0.2] 97 个、(0.2,0.3] 82 个、(0.3,0.4] 85 个、(0.4,0.5] 55 个、(0.5,0.6] 31 个、(0.6,0.7] 20 个、(0.7,0.8] 13 个、(0.8,0.9] 5 个、(0.9,1.0] 6 个；最高 0.966（`apps/cli/packages/adapters/src/storage/session-store/repositories/script-workflow-codecs.ts`）。
- **结构门槛（0.4）**：416 个通过、23 个不通过（即上表替换队列）。

说明：行门槛的 303 个不通过是**既有事实的实测**，不是本次校准要调的东西——门槛按计划书固定为 0.2 / 8 行，不因为历史文件不过而放宽；这些数字供 M0-2 / M0-14 复核时使用。

## 5. 改名副本验证（结构门槛确实能拦住改名照搬）

方法：在 `classification = upstream-modified` 的脚本文件里抽样 80 个（2283 个里等距抽样），先跑一遍找出结构相似度 ≥ 0.4 的（说明仍保留上游结构），再对这些文件做**只改名标识符 token 的机械改名**（用 TypeScript 扫描器只替换 `Identifier`/`PrivateIdentifier`，保留关键字与语法），生成副本后用工具检查：

| 原文件                                                                | 原文件结构 | 改名副本结构 | 改名副本行包含率 | 是否被拦下 |
| --------------------------------------------------------------------- | ---------- | ------------ | ---------------- | ---------- |
| `.vscode/start-electron.mjs`                                          | 1.000      | 1.000        | 0.576            | 是         |
| `apps/cli/packages/bootstrap/src/app/dynamic-workflow-run-journal.ts` | 1.000      | 1.000        | 0.604            | 是         |
| `apps/cli/packages/bootstrap/src/app/paths.ts`                        | 1.000      | 1.000        | 0.045            | 是         |
| `apps/cli/packages/bootstrap/src/app/workflow-driver-escalation.ts`   | 1.000      | 1.000        | 0.694            | 是         |

4/4 被结构门槛拦下；其中 `paths.ts` 的改名副本行包含率只有 0.045（**只靠行门槛会放过**），只有结构门槛能拦住——这正是结构门槛存在的目的。

反例说明（避免误读）：如果把关键字也一起改名（语法被破坏），token 流会变，结构相似度反而降到 0.04 以下；因此“改名照搬”的验证必须只改标识符，报告中的做法即如此。

## 6. 门槛常量（不再调整）

`scripts/provenance/similarity-lines.mjs`：

```js
export const THRESHOLDS = { minLines: 10, containment: 0.2, longestRun: 8, structural: 0.4 };
```

`scripts/provenance/similarity-structural.mjs`：`GRAM = 25`、`WINDOW = 20`。

## 7. 复现命令

```powershell
# 1) 校验仓库外 bare 对象库（path/mode/blob/bytes 全量比对 + 每个 blob 可取）
#    结果：6973/6973 一致，blob missing 0
# 2) 按精确字节导出上游树（不要用 git archive，会按 eol 属性改写换行）
node <cache>\materialize-upstream.mjs <bare-git-dir> 872ad960de7ec172591f7e1952f7849229f94521 <cache>\zcode-872ad960
# 3) 导出后逐文件 sha256/字节数比对 licensing/upstream-baseline.json：missing 0 / hashDiff 0 / sizeDiff 0

# 4) 校准（结构门槛推导）
node scripts/provenance/similarity.mjs --repo . --classification independent-replacement `
  --upstream-dir <cache>\zcode-872ad960 `
  --upstream-rev 872ad960de7ec172591f7e1952f7849229f94521 --calibrate --json calibration.json

# 5) 全量复跑（两道门槛）
node scripts/provenance/similarity.mjs --repo . --classification independent-replacement `
  --upstream-dir <cache>\zcode-872ad960 `
  --upstream-rev 872ad960de7ec172591f7e1952f7849229f94521 --json similarity-run.json
```

单包替换时用法：

```powershell
node scripts/provenance/similarity.mjs --repo . --candidate <新文件> --candidate <新文件> `
  --old <被替换的旧文件> --old-rev <替换前的提交> `
  --upstream-dir <cache>\zcode-872ad960 --upstream-rev 872ad960de7ec172591f7e1952f7849229f94521
```

纯声明文件：加 `--declaration --interface specs/contracts/<包 ID>/interface.md`，先按 interface.md 列出的兼容名字剔除兼容行，再算两道门槛。

## 8. 范围决定与已知限制

- 声明模式的剔除范围 = interface.md 列出的 `interface` / `type` / `class` / `enum` **与 `const` 声明块**（zod schema、`as const` 枚举对象、常量表；只按名字匹配，不做「剔除所有 const」的启发式）。该扩展只影响 `--declaration` 分支：改动前后在**同一仓库状态**上对 492 个 `independent-replacement` 候选全量复跑普通模式，逐文件（行数、包含率与对应文件、最长段与对应文件、结构相似度与对应文件、违规项、结论）**0 差异**，门槛常量 0.2 / 8 / 0.4 未动。
- 声明模式（`--declaration --interface`）按 interface.md 列出的名字定位**整块**声明（`interface` / `type` / `class` / `enum`，含成员行与嵌套）整块剔除，再剔除剩余含兼容名字的行；JSON 报告逐文件给出 `declaration`、`linesBeforeStrip`、`strippedLines`、`residualLines`、`strippedBlocks`。**该改进只影响 `--declaration` 分支：普通模式（不带 `--declaration`）的代码路径与输出未变**——已用第 7 节命令对 439 个 `independent-replacement` 文件全量复跑并与本报告第 3/4 节数值逐候选比对，**0 差异**（439/439，含行数、包含率与对应文件、最长段与对应文件、结构相似度与对应文件、违规项与结论）。门槛常量（0.2 / 8 / 0.4）未动。
- 结构指纹只用于脚本文件（`ts/tsx/mts/cts/js/jsx/mjs/cjs`）；非脚本文本文件只走行门槛，报告里标 `structural=not-a-script`。理由：结构口径按计划书定义在 TypeScript 词法分析器上；本次 439 个校准样本全部是脚本文件，覆盖不受影响。
- 结构相似度是“候选指纹落在同一个比较文件里的比例”，对同一比较文件内的重复指纹只计一次；候选指纹不足 25 个 token（含被声明剔除清空）时按 0 计。
- 二进制文件按计划书跳过两道门槛（报告里标 `binary`），只记录跳过。
- 候选文件若本身位于 `--upstream-dir` 树内，工具不会拿它与自己比较（`--upstream-dir` 一般应指向仓库外的上游缓存，不包含候选）。
- 本报告的全量复跑在 PR 分支上执行；工具与文件内容与合入后一致，合入后如需再跑，用第 7 节命令即可。

## 9. 规范化细化：剔除 SPDX/许可头行（2026-10-11）

计划书选择 13 强制新文件带 `// SPDX-License-Identifier: Apache-2.0`，上游（ZCode）文件普遍也有同一行。桶文件归一化后可能只剩 2 行，其中 1 行就是这行 SPDX：命中上游 → 包含率 0.5 ≠ 0，而「<10 行必须包含率为 0」→ 规则不可满足。裁定与既有规范化规则（去首尾空白、空行、import/re-export、纯分隔符行）同类：SPDX 行是计划书强制的样板，既不是实现也不是可改写文案，两侧文件一视同仁地在规范化阶段剔除，并连带剔除紧随其后的版权行。

影响（439 个 `independent-replacement` 文件全量复跑，与第 3/4 节基准逐候选比对）：

| 指标              | 基准      | 细化后                                          |
| ----------------- | --------- | ----------------------------------------------- |
| 行数变化          | —         | 439/439 都有行被剔除（分母变小）                |
| 行包含率          | —         | **431 个上升**、0 个下降、8 个不变              |
| 最长相同段        | —         | 439 个全部不变                                  |
| 通过 / 不通过     | 136 / 303 | **129 / 310**（7 个 pass→fail，0 个 fail→pass） |
| 结构相似度最大值  | 1.000     | **1.000**（门槛仍按规则取 0.4）                 |
| 超过 0.4 的文件数 | 23        | **23**（替换队列不变）                          |

7 个 pass→fail 的逐条原因（都是分母变小导致，不是放宽门槛；门槛常量未动）：

| 文件                                                                             | 行数      | 包含率        | 失败原因                    |
| -------------------------------------------------------------------------------- | --------- | ------------- | --------------------------- |
| `apps/cli/packages/adapters/src/model/runner-network-headers.ts`                 | 10 → 9    | 0.100 → 0.111 | 掉到 <10 行，包含率必须为 0 |
| `apps/cli/packages/adapters/src/plugins/archive-entry.ts`                        | 47 → 45   | 0.191 → 0.200 | 包含率恰好到 0.2            |
| `apps/cli/packages/adapters/src/storage/session-store/repositories/usage-app.ts` | 147 → 145 | 0.197 → 0.200 | 包含率恰好到 0.2            |
| `apps/cli/packages/cli/src/tui-permission-broker.ts`                             | 21 → 19   | 0.190 → 0.211 | 包含率超过 0.2              |
| `apps/cli/packages/core/src/tool/executor/permission-flow/publication.ts`        | 57 → 55   | 0.193 → 0.200 | 包含率恰好到 0.2            |
| `apps/cli/packages/node-repl-host/src/request-context.ts`                        | 41 → 39   | 0.195 → 0.205 | 包含率超过 0.2              |
| `packages/shared/src/browser-use/nodeReplBroker.ts`                              | 37 → 35   | 0.189 → 0.200 | 包含率恰好到 0.2            |

结论：这次细化让行门槛**更严**（不是放宽），结构门槛的校准结论（0.4、23 个超限文件）完全不变；门槛常量 0.2 / 8 / 0.4 未动。普通模式与声明模式都使用同一套规范化。

## 10. 规范化细化：整条丢弃多行 import / re-export 语句（2026-10-11）

**问题（Lead 在试点 1 复核时发现）**：原实现只按行首前缀丢弃 import / re-export，一条跨多行的语句只丢掉首行，续行（名字列表与 `} from "…";`）仍留在比较集里。旧文件通常有同样的名字列表，于是包含率被无意义地抬高。

实测（`replace/core-hooks` 工作树）：

| 文件                                                | 归一化行数（修复前 → 后） | 其中块续行                                                       |
| --------------------------------------------------- | ------------------------- | ---------------------------------------------------------------- |
| `core/src/hooks/index.ts`                           | 13 → **1**                | 11 行是 `export type { … } from "./types.js"` 的名字列表与收尾行 |
| `core/src/hooks/types.ts`                           | 143 → 129                 | 14 行是 import 块续行                                            |
| `core/src/hooks/configured-runner.ts`               | 142 → 136                 | 6 行                                                             |
| `core/src/hooks/session-mailbox.ts`                 | 71 → 66                   | 5 行                                                             |
| `core/src/hooks/workspace-hook-trust-evaluation.ts` | 101 → 92                  | 9 行                                                             |

**改法**：按语句整条丢弃——从 `import` / `export * (as ns) from` / `export type {` / `export { … } from` 起，连同其续行（括号深度归零且出现语句结束 `;` / 单行 `from "…"`）一起跳过；**动态 `import(…)` 表达式与 `export const|function|class` 属于实现，保留**。完成判定的兜底上限为 40 行，超限则只丢弃首行（不会吞掉后续代码）。

**影响（439 个 `independent-replacement` 文件全量复跑）**：

| 阶段                   | 通过 / 不通过 | 结构最大值 | 结构 > 0.4 的文件                  |
| ---------------------- | ------------- | ---------- | ---------------------------------- |
| 细化前（含 SPDX 剔除） | 129 / 310     | 1.000      | 23                                 |
| **本次细化后**         | **138 / 301** | **1.000**  | **23（同一批文件，逐条核对一致）** |

通过数增加是因为「导入名字列表」不再计入包含率——这是把既有的「丢弃 import 与 re-export 行」口径落实到多行语句，**不是放宽门槛**：结构门槛仍取 0.4（最大值 1.000 未变）、超限文件仍是同一批 23 个、门槛常量 0.2 / 8 / 0.4 未动。工具的 `similarity.test.mjs` 增加了 2 个用例（多行 import / `export type { … } from` 整条丢弃；`export const` / `export function` / 动态 `import(` 保留），共 23 个用例。

## 11. 防刷口径：oxfmt 统一格式 + 去注释只计代码行（2026-10-19）

**背景（用户裁决）**：dynamic-workflow-02 复查发现两种刷法——(1) 把多行代码压成一行（再填空行），使「包含的规范化行数 ÷ 候选规范化行数」做小；(2) 用大段注释填充，稀释分母。计划书「工具要求」的 2026-10-19 条款要求：比对前先用仓库的 oxfmt（与 `pnpm fmt` 同一配置）统一格式；包含率的分子分母都只计代码行。阈值常量 0.2 / 8 / 0.4 / minLines 10 一律不动。

**范围**：只改门禁路径（`scripts/provenance/similarity*.mjs`）。记账路径（`bookkeeping-round2*`）与 `similarity-lines.mjs#normalizeLines` 的语义保持不变（注释保留，供人工抽查）；新口径在新增的 `similarity-normalize.mjs`（`prepareGateText` / `gateLines`）中实现，两者的分工写在文件头注释里。

**管线**（候选、旧文件、上游文件一视同仁）：

1. 读取仓库 `.oxfmtrc.json`，去掉 CLI 专用的 `$schema` 与 `ignorePatterns`，并固定 `objectWrap: "collapse"`。collapse 只用于比较文本：默认 `preserve` 会保留对象/类型字面量原有的多行布局，同一段代码拆行后行数会变；collapse 让布局只由打印宽度决定。该覆盖不修改仓库文件，也不改变 `pnpm fmt` 的行为。
2. 用 oxfmt 进程内格式化（`format(fileName, text, options)`，不落盘、不复制临时目录）。
3. 脚本文件：用 TypeScript 语法树（底层 scanner）收集行注释、块注释、JSDoc 的精确范围，逐个替换为一个空格；字符串、模板字面量、正则与 JSX 文本里的 `//` 不受影响。
4. 再格式化一次，消除替换留下的空格，并按同一规则换行。
5. 送入既有 `normalizeLines`（SPDX/版权行、空行、纯分隔符、多行 import / re-export 等既有过滤规则不变）。

非脚本文件（md/json 等）：oxfmt 支持则格式化，不支持则维持原文后走既有行规范化。格式化失败（语法错误、扩展名不支持）回退原文：候选/旧文件在 JSON 里标 `formatted: false` 与 `formatError`，上游汇总为 `formatFallbacks`，标准输出出现 `format=fallback`。

声明模式：格式化、去注释先做，再按 interface.md 剔除整块声明与兼容行；结构相似度仍用**原始源码**（声明模式下先剔除声明），因为 oxfmt 会补箭头函数参数括号与分号等，改变 token 流。实测 537 个候选的结构值与旧工具逐文件一致（479 个参与结构比较 0 差异，58 个跳过也一致）。

**不变性验证**（`similarity.test.mjs`，共 35 个用例，本次新增 8 个）：

- 压行 / 拆行 / 增删注释三种变换前后，包含率、最长段、结构相似度逐项 `assert.equal`；
- 注释文字改动不影响行结果；
- 字符串、模板与正则里的 `//` 不计为注释；
- 压行样例与凑注释样例相对「逐行相同的旧文件」均判不过；
- 格式化失败回退原文并在报告里标注；
- 门禁读取仓库 `.oxfmtrc.json` 的格式化选项（忽略 `$schema` / `ignorePatterns`）。

既有用例全部保留。唯一改动是 zod 声明样例中依赖对象布局的 `lines=6` 断言：collapse 下该校验链收为 4 个代码行，改为 `lines=4`，用例名由「普通模式不变」改为「普通模式照常计分」；其余断言（不通过、`containment=1.000`、声明模式 `residual-lines=0` / `stripped-blocks=2`）不变。

**性能**：进程内调用 + 并发 8（`FORMAT_CONCURRENCY`）。完整上游树 7060 个文件（93 个二进制）在本机加载约 14.4 秒；4090 个脚本全部格式化成功（0 回退）；2568 个非脚本文本按原规范化（其中 SVG 2306、TXT 209、sourcemap 10，oxfmt 不支持）。537 个候选普通模式 0 个格式化回退。

**2026-10-19 全量复跑（537 个 `independent-replacement`）**：

| 指标                | 旧工具（origin/main） | 新工具（本分支）           |
| ------------------- | --------------------- | -------------------------- |
| 通过 / 不通过       | 384 / 153             | **310 / 227**              |
| 由过变不过          | —                     | **77**                     |
| 由不过变过          | —                     | **3**                      |
| 结论相同但数值变化  | —                     | 305（另 152 个数值不变）   |
| 结构相似度最大值    | 1.000                 | **1.000（逐文件 0 差异）** |
| 结构相似度 > 0.4 的 | 24                    | **24（同一批）**           |

77 个由过变不过全部是脚本文件；按新工具的违规项分类：包含率单独 63、最长段单独 2、两者同时 9、少于 10 行且包含率不为 0 共 3，结构相似度 0。多数文件是压行/换行差异被格式化还原后暴露了与上游相同的代码行（例：`bash-file-output.ts` 包含率 0.182 → 0.537、最长段 3 → 8；`dwf-journal-introspection.ts` 0.115 → 0.330、最长段 2 → 11）。

3 个由不过变过（需要说明，不是放宽规则）：

| 文件                                                                      | 行数    | 包含率        | 最长段 | 原因                                                                |
| ------------------------------------------------------------------------- | ------- | ------------- | ------ | ------------------------------------------------------------------- |
| `apps/cli/packages/core/src/tool/executor/permission-flow/publication.ts` | 55 → 53 | 0.200 → 0.189 | 3 → 3  | 旧口径把同时命中的 JSDoc/中文注释计入分母，去注释后包含率降到门槛下 |
| `apps/cli/packages/core/src/tool/tool-input-validation-issues.ts`         | 59 → 55 | 0.203 → 0.182 | 3 → 3  | 注释不再计入；折行的对象属性被 collapse 成一行对象字面量            |
| `apps/cli/packages/node-repl-host/src/request-context.ts`                 | 39 → 36 | 0.205 → 0.194 | 2 → 2  | JSDoc 与中文注释不再计入；条件对象被 collapse                       |

三者结构相似度与旧工具相同（0.022 / 0.000 / 0.120），没有结构门槛放行。其余 305 个结论相同的候选数值变化主要是行数（格式化与去注释）与包含率，结构值同样 0 差异。

**附：77 个由过变不过的逐文件数值**（行数 old→new、包含率 old→new、最长段 old→new、新工具违规项）：

| 文件                                                                                             | 行数      | 包含率        | 最长段 | 新违规项                                                |
| ------------------------------------------------------------------------------------------------ | --------- | ------------- | ------ | ------------------------------------------------------- |
| `apps/cli/packages/adapters/src/auth/browser.ts`                                                 | 68 → 55   | 0.162 → 0.200 | 5 → 5  | containment 0.200 >= 0.2                                |
| `apps/cli/packages/adapters/src/exec/bash-file-output.ts`                                        | 154 → 149 | 0.182 → 0.537 | 3 → 8  | containment 0.537 >= 0.2; longest identical run 8 >= 8  |
| `apps/cli/packages/adapters/src/exec/bash-output-policy.ts`                                      | 16 → 16   | 0.063 → 0.250 | 1 → 2  | containment 0.250 >= 0.2                                |
| `apps/cli/packages/adapters/src/exec/bash-output-preview.ts`                                     | 27 → 27   | 0.037 → 0.407 | 1 → 6  | containment 0.407 >= 0.2                                |
| `apps/cli/packages/adapters/src/exec/bash-progress-poller.ts`                                    | 44 → 41   | 0.114 → 0.317 | 1 → 4  | containment 0.317 >= 0.2                                |
| `apps/cli/packages/adapters/src/exec/bash-resource-telemetry.ts`                                 | 70 → 68   | 0.157 → 0.456 | 4 → 7  | containment 0.456 >= 0.2                                |
| `apps/cli/packages/adapters/src/exec/bash-shell-provider.ts`                                     | 113 → 113 | 0.115 → 0.265 | 3 → 8  | containment 0.265 >= 0.2; longest identical run 8 >= 8  |
| `apps/cli/packages/adapters/src/exec/bash-startup-script.ts`                                     | 57 → 52   | 0.193 → 0.385 | 3 → 9  | containment 0.385 >= 0.2; longest identical run 9 >= 8  |
| `apps/cli/packages/adapters/src/exec/cwd-capture.ts`                                             | 44 → 43   | 0.114 → 0.488 | 1 → 6  | containment 0.488 >= 0.2                                |
| `apps/cli/packages/adapters/src/exec/node-execution-adapter-base.ts`                             | 165 → 165 | 0.182 → 0.236 | 2 → 5  | containment 0.236 >= 0.2                                |
| `apps/cli/packages/adapters/src/exec/node-execution-adapter-lifecycle.ts`                        | 235 → 234 | 0.179 → 0.295 | 4 → 6  | containment 0.295 >= 0.2                                |
| `apps/cli/packages/adapters/src/exec/node-execution-adapter-process.ts`                          | 201 → 200 | 0.164 → 0.245 | 5 → 5  | containment 0.245 >= 0.2                                |
| `apps/cli/packages/adapters/src/exec/node-execution-adapter.ts`                                  | 35 → 34   | 0.171 → 0.206 | 4 → 4  | containment 0.206 >= 0.2                                |
| `apps/cli/packages/adapters/src/exec/outputEncoding.ts`                                          | 141 → 140 | 0.142 → 0.329 | 3 → 6  | containment 0.329 >= 0.2                                |
| `apps/cli/packages/adapters/src/exec/process-tree.ts`                                            | 68 → 66   | 0.132 → 0.424 | 2 → 4  | containment 0.424 >= 0.2                                |
| `apps/cli/packages/adapters/src/http/index.ts`                                                   | 202 → 166 | 0.198 → 0.241 | 3 → 3  | containment 0.241 >= 0.2                                |
| `apps/cli/packages/adapters/src/http/public-egress-policy.ts`                                    | 97 → 88   | 0.196 → 0.227 | 5 → 5  | containment 0.227 >= 0.2                                |
| `apps/cli/packages/adapters/src/mcp/client-cleanup.ts`                                           | 106 → 80  | 0.198 → 0.263 | 3 → 3  | containment 0.263 >= 0.2                                |
| `apps/cli/packages/adapters/src/mcp/client-lifecycle.ts`                                         | 149 → 116 | 0.195 → 0.250 | 2 → 2  | containment 0.250 >= 0.2                                |
| `apps/cli/packages/adapters/src/mcp/client-official.ts`                                          | 126 → 101 | 0.198 → 0.248 | 4 → 4  | containment 0.248 >= 0.2                                |
| `apps/cli/packages/adapters/src/mcp/client-state.ts`                                             | 87 → 78   | 0.195 → 0.218 | 4 → 4  | containment 0.218 >= 0.2                                |
| `apps/cli/packages/adapters/src/mcp/client-transport.ts`                                         | 71 → 61   | 0.197 → 0.213 | 2 → 2  | containment 0.213 >= 0.2                                |
| `apps/cli/packages/adapters/src/mcp/descriptor.ts`                                               | 62 → 49   | 0.177 → 0.245 | 6 → 6  | containment 0.245 >= 0.2                                |
| `apps/cli/packages/adapters/src/mcp/index.ts`                                                    | 33 → 21   | 0.182 → 0.286 | 2 → 2  | containment 0.286 >= 0.2                                |
| `apps/cli/packages/adapters/src/mcp/network.ts`                                                  | 60 → 51   | 0.183 → 0.216 | 4 → 4  | containment 0.216 >= 0.2                                |
| `apps/cli/packages/adapters/src/mcp/oauth-interactive-transaction.ts`                            | 190 → 169 | 0.195 → 0.219 | 6 → 6  | containment 0.219 >= 0.2                                |
| `apps/cli/packages/adapters/src/mcp/oauth-refresh.ts`                                            | 199 → 166 | 0.196 → 0.241 | 3 → 7  | containment 0.241 >= 0.2                                |
| `apps/cli/packages/adapters/src/mcp/official-auth-response.ts`                                   | 65 → 54   | 0.185 → 0.222 | 2 → 2  | containment 0.222 >= 0.2                                |
| `apps/cli/packages/adapters/src/mcp/pool-identity.ts`                                            | 40 → 32   | 0.175 → 0.219 | 2 → 2  | containment 0.219 >= 0.2                                |
| `apps/cli/packages/adapters/src/mcp/stdio-transport.ts`                                          | 139 → 91  | 0.173 → 0.264 | 6 → 6  | containment 0.264 >= 0.2                                |
| `apps/cli/packages/adapters/src/mcp/timeout.ts`                                                  | 82 → 65   | 0.183 → 0.231 | 4 → 4  | containment 0.231 >= 0.2                                |
| `apps/cli/packages/adapters/src/mcp/windows-job-object.ts`                                       | 148 → 141 | 0.149 → 0.461 | 6 → 12 | containment 0.461 >= 0.2; longest identical run 12 >= 8 |
| `apps/cli/packages/adapters/src/model/runner-debug-redaction.ts`                                 | 16 → 15   | 0.188 → 0.200 | 3 → 3  | containment 0.200 >= 0.2                                |
| `apps/cli/packages/adapters/src/network/http-config.ts`                                          | 163 → 134 | 0.196 → 0.239 | 5 → 5  | containment 0.239 >= 0.2                                |
| `apps/cli/packages/adapters/src/plugins/atomic-protocol.ts`                                      | 79 → 79   | 0.177 → 0.228 | 3 → 4  | containment 0.228 >= 0.2                                |
| `apps/cli/packages/adapters/src/plugins/catalog-describe.ts`                                     | 67 → 63   | 0.164 → 0.254 | 1 → 2  | containment 0.254 >= 0.2                                |
| `apps/cli/packages/adapters/src/plugins/catalog-listing.ts`                                      | 56 → 49   | 0.089 → 0.510 | 2 → 7  | containment 0.510 >= 0.2                                |
| `apps/cli/packages/adapters/src/plugins/catalog-refresh.ts`                                      | 170 → 170 | 0.188 → 0.235 | 3 → 4  | containment 0.235 >= 0.2                                |
| `apps/cli/packages/adapters/src/plugins/catalog-repository.ts`                                   | 84 → 82   | 0.155 → 0.256 | 3 → 5  | containment 0.256 >= 0.2                                |
| `apps/cli/packages/adapters/src/plugins/catalog-validation.ts`                                   | 145 → 139 | 0.172 → 0.338 | 2 → 8  | containment 0.338 >= 0.2; longest identical run 8 >= 8  |
| `apps/cli/packages/adapters/src/plugins/discovery-candidates.ts`                                 | 59 → 57   | 0.169 → 0.351 | 1 → 3  | containment 0.351 >= 0.2                                |
| `apps/cli/packages/adapters/src/plugins/discovery-manifest.ts`                                   | 78 → 75   | 0.192 → 0.307 | 4 → 7  | containment 0.307 >= 0.2                                |
| `apps/cli/packages/adapters/src/plugins/discovery-runtime.ts`                                    | 93 → 92   | 0.161 → 0.315 | 2 → 3  | containment 0.315 >= 0.2                                |
| `apps/cli/packages/adapters/src/plugins/markdown-frontmatter.ts`                                 | 52 → 52   | 0.192 → 0.212 | 2 → 2  | containment 0.212 >= 0.2                                |
| `apps/cli/packages/adapters/src/plugins/mcp-official-auth.ts`                                    | 18 → 18   | 0.167 → 0.389 | 2 → 4  | containment 0.389 >= 0.2                                |
| `apps/cli/packages/adapters/src/plugins/mcp.ts`                                                  | 79 → 79   | 0.165 → 0.215 | 2 → 9  | containment 0.215 >= 0.2; longest identical run 9 >= 8  |
| `apps/cli/packages/adapters/src/plugins/official-marketplace.ts`                                 | 85 → 78   | 0.094 → 0.295 | 1 → 4  | containment 0.295 >= 0.2                                |
| `apps/cli/packages/adapters/src/plugins/plugin-document.ts`                                      | 82 → 79   | 0.098 → 0.203 | 2 → 3  | containment 0.203 >= 0.2                                |
| `apps/cli/packages/adapters/src/plugins/plugin-validation.ts`                                    | 119 → 113 | 0.168 → 0.310 | 3 → 3  | containment 0.310 >= 0.2                                |
| `apps/cli/packages/adapters/src/plugins/source-errors.ts`                                        | 40 → 28   | 0.075 → 0.214 | 1 → 1  | containment 0.214 >= 0.2                                |
| `apps/cli/packages/adapters/src/plugins/source-redaction.ts`                                     | 14 → 13   | 0.143 → 0.231 | 1 → 2  | containment 0.231 >= 0.2                                |
| `apps/cli/packages/adapters/src/plugins/version-compare.ts`                                      | 28 → 25   | 0.036 → 0.560 | 1 → 7  | containment 0.560 >= 0.2                                |
| `apps/cli/packages/adapters/src/storage/index.ts`                                                | 74 → 67   | 0.189 → 0.209 | 5 → 5  | containment 0.209 >= 0.2                                |
| `apps/cli/packages/adapters/src/storage/session-store/json.ts`                                   | 16 → 8    | 0.125 → 0.250 | 1 → 1  | containment 0.250 must be 0 below 10 normalized lines   |
| `apps/cli/packages/adapters/src/storage/session-store/record-projection.ts`                      | 11 → 10   | 0.182 → 0.200 | 1 → 1  | containment 0.200 >= 0.2                                |
| `apps/cli/packages/adapters/src/storage/session-store/repositories/dwf-journal-artifacts.ts`     | 69 → 58   | 0.188 → 0.224 | 4 → 8  | containment 0.224 >= 0.2; longest identical run 8 >= 8  |
| `apps/cli/packages/adapters/src/storage/session-store/repositories/dwf-journal-introspection.ts` | 131 → 115 | 0.115 → 0.330 | 2 → 11 | containment 0.330 >= 0.2; longest identical run 11 >= 8 |
| `apps/cli/packages/adapters/src/storage/session-store/repositories/dwf-journal-run-state.ts`     | 95 → 81   | 0.189 → 0.222 | 5 → 5  | containment 0.222 >= 0.2                                |
| `apps/cli/packages/adapters/src/storage/session-store/repositories/usage-values.ts`              | 12 → 3    | 0.167 → 0.333 | 1 → 1  | containment 0.333 must be 0 below 10 normalized lines   |
| `apps/cli/packages/adapters/src/storage/session-store/repositories/write-transaction.ts`         | 24 → 21   | 0.167 → 0.286 | 1 → 2  | containment 0.286 >= 0.2                                |
| `apps/cli/packages/adapters/src/storage/session-store/session-store-connection.ts`               | 40 → 27   | 0.175 → 0.259 | 2 → 2  | containment 0.259 >= 0.2                                |
| `apps/cli/packages/adapters/src/storage/session-store/shared-context-commit.ts`                  | 85 → 73   | 0.176 → 0.205 | 3 → 3  | containment 0.205 >= 0.2                                |
| `apps/cli/packages/adapters/src/storage/session-target.ts`                                       | 104 → 96  | 0.173 → 0.208 | 6 → 6  | containment 0.208 >= 0.2                                |
| `apps/cli/packages/core/src/browser-client/runtime-installation.ts`                              | 36 → 35   | 0.194 → 0.200 | 4 → 4  | containment 0.200 >= 0.2                                |
| `apps/cli/packages/core/src/runtime/methods/support/event-pipeline.ts`                           | 115 → 98  | 0.174 → 0.204 | 3 → 3  | containment 0.204 >= 0.2                                |
| `apps/cli/packages/core/src/runtime/methods/support/recover-step.ts`                             | 87 → 65   | 0.172 → 0.231 | 5 → 8  | containment 0.231 >= 0.2; longest identical run 8 >= 8  |
| `apps/cli/packages/core/src/runtime/methods/support/sink-notify.ts`                              | 37 → 25   | 0.135 → 0.200 | 1 → 1  | containment 0.200 >= 0.2                                |
| `apps/cli/packages/core/src/runtime/methods/support/status-log-table.ts`                         | 175 → 146 | 0.131 → 0.151 | 2 → 8  | longest identical run 8 >= 8                            |
| `apps/cli/packages/core/src/runtime/methods/support/stream-event-record.ts`                      | 25 → 13   | 0.120 → 0.231 | 1 → 1  | containment 0.231 >= 0.2                                |
| `apps/cli/packages/core/src/tool/executor/display-text.ts`                                       | 11 → 10   | 0.182 → 0.400 | 1 → 4  | containment 0.400 >= 0.2                                |
| `apps/cli/packages/node-repl-host/src/broker-transaction.ts`                                     | 48 → 44   | 0.188 → 0.205 | 2 → 2  | containment 0.205 >= 0.2                                |
| `packages/shared/src/node/nodeSelfResourceTelemetry.ts`                                          | 68 → 51   | 0.103 → 0.216 | 2 → 3  | containment 0.216 >= 0.2                                |
| `packages/shared/src/protocol-v4/profiles.ts`                                                    | 26 → 16   | 0.154 → 0.250 | 1 → 1  | containment 0.250 >= 0.2                                |
| `packages/shared/src/protocol-v4/shared-context-import.ts`                                       | 32 → 21   | 0.188 → 0.286 | 2 → 2  | containment 0.286 >= 0.2                                |
| `packages/shared/src/protocol-v4/wire-codec.ts`                                                  | 209 → 180 | 0.019 → 0.117 | 1 → 9  | longest identical run 9 >= 8                            |
| `packages/shared/src/protocol-v4/workflow-artifact.ts`                                           | 17 → 10   | 0.176 → 0.300 | 1 → 2  | containment 0.300 >= 0.2                                |
| `packages/shared/src/protocol-v4/workflow-runs-lineage.ts`                                       | 13 → 7    | 0.154 → 0.286 | 1 → 1  | containment 0.286 must be 0 below 10 normalized lines   |

**结论**：新口径堵住「压行 + 注释稀释」，同时保持阈值与结构算法不变；相对旧工具整体更严（77 个过→不过，3 个不过→过），且 3 个不过→过均可逐行归因于「注释行不再计分（以及对象折叠）」，不是放宽规则。按计划书要求，上述 77 个文件与结构门槛超过 0.4 的文件在合并后需重新打开返工，返工前不计为完成。
