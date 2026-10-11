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
