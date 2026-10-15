# core-03 合同验收记录（v1）

## 一、范围与口径

- 计划书分包总表：`apps/cli/packages/core/src` · `.`, `workflow`, `workflow/expert`, `workflow/expert/parsers`, `workflow/scheduler` —— **35 文件 / 4,940 行 / 风险中**。
- 实测（`lead/scope-report.mjs` + `licensing/current-files.json`，继承文件口径）：**35 个继承文件** ✓（`. 1`、`telemetry 1`、`workflow 5`、`workflow/expert 13`、`workflow/expert/parsers 5`、`workflow/scheduler 10`）。
- 排除：`environment.ts` / `output.ts` / `runtime.ts`（后续包）；3 个 `original`（`scheduler/{graph,node-runner-outcome,ready-order}.ts`）。
- 黑盒入口：**包根** `src/index.ts`（190 具名导出；两处类型导出已修）。

## 二、行为覆盖

`behavior.md` 的 B1–B19 全部落在契约测试里（每条至少一个用例），其中：

- 调度循环：完成 / 恢复修复 / 并发上限 / 错误阈值 / 死锁 / 前沿事件去重 / 取消（B1–B7）；
- 事件日志与集合规划（B8–B9）；
- 节点执行与专家命令（B10–B11）；
- 专家阶段、批评回路、重试与失败归类（B12）；
- 子会话事件、解析器、内置定义、只读派生、遥测（B13–B17）；
- 导出面与模块边界（B18–B19）。

## 三、旧门（`gate-old.json`）

| 项            | 结果                                             |
| ------------- | ------------------------------------------------ |
| 源码入口      | 见 `gate-old.json`（运行后填写）                 |
| dist 入口     | 见 `gate-old.json`（运行后填写）                 |
| 桩替换        | 见 `gate-old.json`（运行后填写；要求**全失败**） |
| commit / node | `f777bd58…` / `v24.14.0`                         |

## 四、本包内完成的修复与发现

1. **包根类型当值再导出（两处）**：`ToolExecutor`、`ToolRegistry` → 改为 `export type`；修复后源码入口可加载（190 导出）。详见 `known-differences.md` §1。
2. **死代码候选**：`workflow/scheduler/collection-planner-admission.ts`（`Admission`/`admitCollection`）→ 替换阶段删除并重生成相关哈希基线（`known-differences.md` §4）。

## 五、未覆盖 / 存疑项

- 本包不含 `src/environment.ts` / `src/output.ts` / `src/runtime.ts` 与 `subagent` / `system-reminder` 等区域（别的包负责）；
- `src/index.ts` 中指向别包区域的 `export *` 不改其实现（仅保证再导出的**种类**正确）；
- 哈希基线类测试工件（`apps/cli/packages/core/test/*.json`）不在本包改写范围，删除死代码文件时需同步重生成（已记入 `known-differences.md`）。

旧门脚本：`node specs/contracts/core-03/tests/run-old-gate.mjs`（自动替换桩 → 重跑 → 还原，证据写入 `gate-old.json`）。

## 六、计分模式记录（替换阶段）

- **普通模式**（默认）：实现文件。
- **声明模式**（`--declaration --interface specs/contracts/core-03/interface.md`）：**声明占主体的文件**。
  - 已使用者：`workflow/expert/types.ts`（106 行、22 个声明块、85 行声明、**residual-lines 0** ⇒ 0.000 PASS）；`workflow/scheduler/types.ts`（144 行、17 个声明块、116 行声明、**residual-lines 0** ⇒ 0.000 PASS）。
  - 判定口径：文件中值导出/实现语句占比极低（本文件为 0），声明模式剥离后无残留可比较行。
- 其余文件（含所有实现模块）一律普通模式；两模式**不得混用于同一文件**。

## 七、替换验收记录（replace/core-03 断点续做，2026-10-14）

### 7.1 干净构建复现（不采信旧日志）

- `turbo run build --cwd apps/cli --force`（0 cached / 15 任务）与 `toolchain/pnpm24.ps1 build:cli-packages`（Node **v24.14.0**）各一次，均 15/15 成功、`error TS` 0。
- 干净构建后三个 safety 用例**原样复现 CI 红**（tests 3 / pass 0 / fail 3），确认此前「本地 82/82」为旧构建误绿。

### 7.2 三个失败用例的根因与修法（只改实现，未动测试与金样）

1. `workflow-phase-runner-safety.test.mjs:192`：子会话联动写回的活动对象与 `workflow_session_linked` 负载里 `model` 键落在末尾（旧实现紧随 `kind` / `activityId`）→ 改成按旧键位条件插入。
2. `workflow-run-loop-safety.test.mjs:162`：`assert.equal("reportPath" in result, false)` 实得 `true` —— 失败（取消/暂停）路径的命令结果带了 `reportPath`（旧实现只在成功路径带）→ 拆成 `commandResult`（成功）与不带 `reportPath` 的中止结果。同用例后续断言继续暴露：取消路径旧实现**不把已中止的 signal** 传给 `writeSnapshot` / `appendGraphRecord` / `appendEvent`（`trace` 断言最后一次写入 `args.length === 0`，语义上修复快照必须落盘）→ 一并对齐。
3. `workflow-runtime-context-safety.test.mjs:89`：初始快照字段表与 meta 图记录的键序与旧录制金样不一致 → 按旧键序重排字段表分组与 meta 记录字面量。

自查（对照 `origin/main` 旧实现）追加修复：

- `lifecycle-cancel.ts` / `lifecycle-resume.ts` 算出了 `phases` 却没写回快照 ⇒ 取消/恢复不再重置相位状态的**功能回归**；补 `withPhases` 投影（用例 2 中 `phases[2] === "cancelled"` 的判据正是它）。
- `phase-runner-settle.ts` 失败结算的时钟取样少一次（相位补丁与活动记录共用一个时间戳）→ 拆成两次取样，`clock` 计数与旧实现一致。
- `runtime-context-events.ts` 事件对象键序改为旧序 `kind, message, nodeId, payload, phase, runId, timestamp, type`。

### 7.3 干净构建后的验证

| 项                                                                                   | 结果                                                                                                                 |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 三个 safety 用例（修复前 → 修复后）                                                  | **0/3 → 3/3** ✓                                                                                                      |
| 合同套件 `specs/contracts/core-03/tests` 源码入口                                    | **16/16** ✓                                                                                                          |
| 合同套件 dist 入口（`KNORVIA_CORE_03_ENTRY=dist/index.js`）                          | **16/16** ✓                                                                                                          |
| 全仓合同 `specs/contracts/*/tests`（Lead 裁决 #150：合同测试未被 CI 收录，须本地跑） | **277/277** ✓                                                                                                        |
| `pnpm test:studio`（Node v24.14.0，887 文件）                                        | 8728 例：**8719 pass / 2 fail / 2 cancelled / 5 skipped**；失败与取消的 4 例见 7.6，均非本包（3 个原失败用例在内 ✓） |

### 7.4 两道相似度实测（本次改动涉及的四组候选，`--old-rev origin/main` + 上游固定提交 872ad960）

| 组（候选数）          | 最大 containment | 最长同段 | 最大 structural | 判定 |
| --------------------- | ---------------- | -------- | --------------- | ---- |
| phase-runner（4）     | 0.155            | 2        | 0.146           | PASS |
| runtime-context（10） | 0.191            | 5        | 0.118           | PASS |
| run-loop（4）         | 0.159            | 4        | 0.333           | PASS |
| lifecycle（6）        | 0.196            | 5        | 0.109           | PASS |

门槛（containment < 0.20、最长同段 < 8、structural < 0.40）未调整；四组合计 24 个候选全部 PASS。

### 7.5 门禁输出摘要（Node v24.14.0，`toolchain/pnpm24.ps1`）

| 门禁                                               | 结果                                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm typecheck` / `pnpm --dir apps/cli typecheck` | **0 / 0** ✓                                                                                  |
| `pnpm lint`                                        | **0 errors**（411 warnings，与改动前一致） ✓                                                 |
| `pnpm fmt:check`                                   | **0** ✓                                                                                      |
| `pnpm architecture:check`（全量）                  | **0** ✓                                                                                      |
| `pnpm build:cli-packages`                          | **15/15 successful，exit 0** ✓                                                               |
| `pnpm test:studio`                                 | 见 7.3（4 例环境失败，非本包）                                                               |
| `pnpm knip`                                        | exit 1；与改动前基线逐行 diff **唯一差异是 3 个既有条目的行号漂移** ⇒ 未新增未使用文件或导出 |
| `pnpm provenance:report` / `provenance:check`      | **reviewProblems 0 / missingReviews []**，两门 exit 0 ✓                                      |
| 两道相似度门槛                                     | 见 7.4 全 PASS ✓                                                                             |
| 远端 CI（Linux + Windows）                         | 见 PR #147                                                                                   |

### 7.6 未覆盖 / 环境说明

- **Node 版本**：本机 PATH 是 Node v26.3.0（mise 未安装），`mise.toml` 钉定 **24.14.0**；须用 `D:\knorvia studio开发\toolchain\pnpm24.ps1` 跑门禁。Node 26 下 `adapters`/`services` 有 19 个用例因「require Node 24 / 存储 / 锁 / 超时」失败，Node 24 下通过。
- **4 个本地失败（CI 双平台均绿，均非本包）**：
  - `device-fs-runtime-contract` source/dist：用例自带 60s 上限，本机多执行线并发时超时；
  - `official-plugin-staging.test.mjs`：本机进程以 0xC0000409 崩溃，**`git stash` 还原本包改动后原样复现** ⇒ 改动前即失败，与本包无关；
  - `studio-workspace-runtime-health`：`io.recover` 与进程退出的竞态（多次运行 21–46s 波动）。
- `pnpm perf:baseline` 需要本机 Chrome 与空闲负载，结果见 PR 描述的门禁表。
- 本包不覆盖 `environment.ts` / `output.ts` / `runtime.ts` 与 `subagent` / `system-reminder` 等区域；`scheduler/collection-planner-admission.ts` 零引用死代码按 §四/`known-differences.md` 保留。
