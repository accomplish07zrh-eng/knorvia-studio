# Knorvia Studio 测试稳定性报告（T02）

对应规格：[specs/knorvia-test-stability.md](../specs/knorvia-test-stability.md)。本报告只记录**实际执行过**的命令与真实结果；未执行的项在「未执行的检查」一节逐条列出。

## 1. 结论摘要

| 项                              | 结论                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| 任务书所称「6 个 Windows 失败」 | **在本机不可复现**。三个文件在修复前后的基线状态即全绿（详见第 3 节），未声称修复该失败。  |
| 缺陷 A：Python 解释器解析不确定 | 已修复并新增回归测试（含单测 + 真实失败路径验证）。                                        |
| 缺陷 B：`terminal()` 超时无诊断 | 已修复并新增回归测试（断言 taskId/最后状态/事件序列/结果分类）。                           |
| 缺陷 C：真实时钟 + 固定 `sleep` | 已修复：改为可注入虚拟时钟，新增到期/取消两个确定性用例，删除固定 `sleep`。                |
| 缺陷 D：runner 无子进程超时     | **未修改**（见第 7 节说明与理由）。                                                        |
| 三套件连续 3 次运行             | office 2/2、schedule 5/5、creation 11/11，`fail 0`、`skipped 0`、`cancelled 0`，退出码 0。 |
| 生产代码改动                    | **无**。改动全部位于测试与文档，运行时风险为零。                                           |

## 2. 基线与环境

- 仓库：`D:\tools\knorvia-studio`，版本 `0.8.0-preview.2`。
- **实际检出基线：`797a76e5b5d471d62432c2129084a83349dff8b5`**（`git rev-parse HEAD`；提交信息为 T01「建立同提交发布门禁与版本不可变策略」，提交时间 2026-09-25 16:45:20 +0800）。
  任务书给出的基线 `bcc63b6` 与本次实际检出的 HEAD 不一致，本报告以实测 SHA 为准。
- Node：本机 `v26.3.0`；`mise.toml` 固定 `24.14.0`（**差异未消除**，见第 7 节）。
- 平台：Windows（`win32`）。
- 其他：工作树在第 9 节所列文件上存在**其他并行 agent 的未提交改动**。

## 3. 历史「Windows 6 个失败」的复核

在 `797a76e`、Node v26.3.0 上，对任务书点名的三个文件各自连续执行 3 次（修复前状态，即 HEAD 原文件），结果全部通过：

| 文件                                                     | 每次结果                                | 退出码 |
| -------------------------------------------------------- | --------------------------------------- | ------ |
| `packages/desktop/test/office-plugin-assets.test.mjs`    | 1 test / 1 pass / 0 fail / 0 skipped    | 0      |
| `packages/desktop/test/studio-workflow-schedule.test.ts` | 3 tests / 3 pass / 0 fail / 0 skipped   | 0      |
| `packages/services/test/creation-polish.test.ts`         | 10 tests / 10 pass / 0 fail / 0 skipped | 0      |

结论：任务书描述的「6 个 Windows 失败」在本次环境中**不可复现**，因此本轮不把它当作已修复的缺陷；本轮修复对象仅为下列已确认的健壮性与诊断缺陷。

## 4. 已确认缺陷与修复内容

### 4.1 缺陷 A：Python 解释器解析不确定，失败无诊断（office 插件资源套件）

**实测证据（本机，真实命令输出）**

| 命令                  | 解析结果                                                                       | `--version` 行为                          |
| --------------------- | ------------------------------------------------------------------------------ | ----------------------------------------- |
| `Get-Command python`  | `C:\Users\17018\AppData\Local\Programs\Python\Python313\python.exe`            | 退出码 0，输出 `Python 3.13.14`           |
| `Get-Command python3` | `C:\Users\17018\AppData\Local\Microsoft\WindowsApps\python3.exe`（Store 占位） | 退出码 **9009**，stdout/stderr **均为空** |

旧实现按平台硬选单个命令名，并在失败时用 `result.stderr || result.stdout` 作为断言消息。Store 占位程序不写任何字节，因此该消息是**空串**：`assert.equal(0, 9009, "")` —— 现场只剩一个没有任何原因的失败。

**修复**（`packages/desktop/test/office-plugin-assets.test.mjs`）

- 新增纯函数 `pythonCandidates(platform)`：POSIX 为 `python3, python`；Windows 为 `python, python3`。
- 新增纯函数 `classifyProbe(probe)`：区分 `ENOENT`、信号终止、退出码非 0（9009 或无输出判为 Store 占位）、输出不可识别、Python 2、可用 Python 3。
- 新增 `resolvePythonInterpreter({ platform, env, probe })`：按候选顺序探测，命中即返回；全部失败时抛出含「候选清单 + 每项失败原因 + Store 判据 + 环境要求」的诊断。
- 支持 `KNORVIA_TEST_PYTHON` 显式指定解释器：设置后**只**使用它，不可用时明确失败且不回退。
- 解释器缺失时**失败而不是 skip**；找到后仍运行真实 Python 套件 `python -B scripts/office-plugin-assets.test.py`（保留 30s `spawnSync` 超时），退出码非 0 时输出解释器、退出码、信号与 stdout/stderr 摘要。

**强制失败路径的真实输出**（`KNORVIA_TEST_PYTHON` 指向 Store 占位程序）：

```
ℹ pass 1 / ℹ fail 1 / ℹ skipped 0   exit=1
AssertionError: 未找到可用的 Python 3 解释器，office 插件资源离线测试无法运行。
已尝试：C:\Users\17018\AppData\Local\Microsoft\WindowsApps\python3.exe
  - ...\python3.exe：退出码 9009 且无任何输出：这是 Microsoft Store 占位程序（通常位于 %LOCALAPPDATA%\Microsoft\WindowsApps），不是真实解释器
KNORVIA_TEST_PYTHON 已设置但不可用；不会回退到其他解释器。
Windows 上若 %LOCALAPPDATA%\Microsoft\WindowsApps\python.exe 存在，那是商店占位程序而非解释器。
请安装 Python 3 并确认 `python --version` 输出 `Python 3.x`，或设置 KNORVIA_TEST_PYTHON 指向解释器的绝对路径（例如 KNORVIA_TEST_PYTHON=C:\Python313\python.exe）。
```

### 4.2 缺陷 B：`terminal()` 超时无诊断且分类粗糙（创作打磨套件）

**修复**（`packages/services/test/creation-polish.test.ts`）

- **预算保持诚实**：`TERMINAL_BUDGET_MS = 1000`、`TERMINAL_POLL_MS = 10`，与修复前（100 次 × 10ms）一致，**没有通过放大超时来掩盖问题**；并在回归测试中断言这两个常量，防止后续再用「调大超时」当修法。
- 新增纯函数 `classifyTerminalStatus(status)`：`failed` → `definite failure`（允许一键重试）；`interrupted` → `unknown result`（禁止自动重试）；`cancelled` → `user cancel`（禁止重试）；`succeeded`/其他 → 对应终态或 `still pending`。
- 新增纯函数 `terminalTimeoutDiagnostic(taskId, lastStatus, events, budgetMs)`，超时消息包含：taskId、最后观察到的状态（从未读到记录时显式说明「记录缺失」）、去重的状态事件序列 `状态@已用毫秒`、结果分类与重试语义、三类语义对照。
- `terminal()` 改为按显式预算轮询，只在状态变化时记录事件；新增可选的 `budgetMs`/`pollMs` 仅用于测试缩短等待，默认行为不变。

**真实超时诊断样例**（测试实际抛出的错误文本）：

```
fixture did not settle：任务 job-stuck 在 30ms 轮询预算内未进入终态。
最后观察到的状态：running
结果分类：still pending（一键重试：禁止）
观察到的状态事件：queued@1ms → running@4ms
语义对照：definite failure=结果明确失败；unknown result=结果未知，可能仍在运行或已计费；user cancel=用户取消。
```

### 4.3 缺陷 C：计划工作流套件依赖真实时钟与固定 `sleep`

**修复**（`packages/desktop/test/studio-workflow-schedule.test.ts`）

- 用注入 `StudioRuntimeDependencies.clock` 的**虚拟时钟**（`now()`/`id()`/`delay()`）替换原 `now: Date.now` 与 `delay: sleep`；时间只由 `clock.advance()` 前进，`delay` 只在推进时兑现。
- 删除模拟状态推进的固定 `sleep(40)`、`sleep(10)`；等待状态推进改为有界事件循环让步（`setImmediate`），不再读真实时间。
- 新增两个确定性用例：
  - **租约到期（due-time）**：租约有效时 `tick()` 只续租、运行保持 `running`；虚拟时间推过租约后 `tick()` 重新获取租约并恢复，因存在 running 的 turn 而判为 `interrupted`（`resultKnown=false`，错误含「结果不确定」），且不会被静默重新排队重放，迟到的内核结果也无法覆盖该结论。
  - **运行中取消**：内核受控挂起时发起 `cancel` 命令并由 `tick()` 触发中止，内核即使随后返回成功也不得覆盖 `cancelled` 终态。
- 原有覆盖保留：保存定义、重启后不重放已完成节点、重复触发幂等、项目变更/工作流删除/无效图拒绝、以及两个结果观察者用例。
- 实现中修正的两处坑（已写入规格 R4）：**跨 runtime 实例的 `id()` 必须唯一**（共用同一 sqlite 时计数器从头开始会让运行/回合 id 互相覆盖，使「重启不重放」假通过——本次调试中确实先踩到并修正）；**到期推进不硬编码 `LEASE_MS`**，改用「远超任何合理租约时长」的推进量。
- 仅保留一处**有界真实等待**作为逃生口：`StudioScheduleOutcomeObserver` 的投递不经过可注入时钟（S06），观察者用例使用 2000ms 上限的 `untilRealDelivery`；「已销毁观察者不得写入」用例使用 50ms 有界等待以证明否定。二者均有注释说明为何无法虚拟化。

## 5. 精确命令与真实结果

以下命令均在仓库根目录、Node v26.3.0 下执行。命令为实际执行内容（PowerShell 中 `node ...`）。

### 5.1 修复前基线（HEAD 原文件，各连续 3 次）

| 命令                                                                                                               | 3 次结果                             | 退出码 |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ------ |
| `node --experimental-test-module-mocks --import tsx --test packages/desktop/test/office-plugin-assets.test.mjs`    | 1 pass / 0 fail / 0 skipped（每次）  | 0,0,0  |
| `node --experimental-test-module-mocks --import tsx --test packages/desktop/test/studio-workflow-schedule.test.ts` | 3 pass / 0 fail / 0 skipped（每次）  | 0,0,0  |
| `node --experimental-test-module-mocks --import tsx --test packages/services/test/creation-polish.test.ts`         | 10 pass / 0 fail / 0 skipped（每次） | 0,0,0  |

### 5.2 修复后（最终文件状态，各连续 3 次，三个套件并发执行以引入竞争）

| 命令                                                                                                               | tests | pass     | fail | skipped | cancelled | 退出码 |
| ------------------------------------------------------------------------------------------------------------------ | ----- | -------- | ---- | ------- | --------- | ------ |
| `node --experimental-test-module-mocks --import tsx --test packages/desktop/test/office-plugin-assets.test.mjs`    | 2     | 2,2,2    | 0    | 0       | 0         | 0,0,0  |
| `node --experimental-test-module-mocks --import tsx --test packages/desktop/test/studio-workflow-schedule.test.ts` | 5     | 5,5,5    | 0    | 0       | 0         | 0,0,0  |
| `node --experimental-test-module-mocks --import tsx --test packages/services/test/creation-polish.test.ts`         | 11    | 11,11,11 | 0    | 0       | 0         | 0,0,0  |

### 5.3 其他已执行命令

| 命令                                                                                                                                                                                                                                                            | 结果                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KNORVIA_TEST_PYTHON=<WindowsApps 下 Store 占位 python3> node --experimental-test-module-mocks --import tsx --test packages/desktop/test/office-plugin-assets.test.mjs`                                                                                         | 1 pass / 1 fail / 0 skipped，**退出码 1**；失败消息为上述可执行诊断（预期行为，验证「不得 skip、必须给原因」）                                                                    |
| `pnpm exec oxfmt --check packages/desktop/test/office-plugin-assets.test.mjs packages/services/test/creation-polish.test.ts packages/desktop/test/studio-workflow-schedule.test.ts specs/knorvia-test-stability.md`                                             | `All matched files use the correct format.`，退出码 0                                                                                                                             |
| `pnpm exec oxfmt <上述 4 个文件>`                                                                                                                                                                                                                               | 退出码 0（仅格式化本次触碰的文件，未执行仓库级 `pnpm fmt`）                                                                                                                       |
| `pnpm exec tsc --noEmit --skipLibCheck --strict --target es2023 --lib es2023,dom,dom.iterable --module nodenext --moduleResolution nodenext --types node packages/services/test/creation-polish.test.ts packages/desktop/test/studio-workflow-schedule.test.ts` | **我改动的两个文件无任何类型错误**（输出中的报错全部来自其他文件与本次临时编译参数，例如 `lib` 未含 es2023、缺少 `node-forge` 声明）。这是辅助检查，**不能替代** `pnpm typecheck` |

### 5.4 变更文件

生产代码 0 处。改动/新增：

| 文件                                                     | 类型 | 说明                                             |
| -------------------------------------------------------- | ---- | ------------------------------------------------ |
| `specs/knorvia-test-stability.md`                        | 新增 | 先于实现的规格（含 R1–R5 规则与验收场景）        |
| `docs/knorvia-test-stability-report.md`                  | 新增 | 本报告                                           |
| `packages/desktop/test/office-plugin-assets.test.mjs`    | 修改 | 解释器解析 + 诊断 + 单测（1 → 2 个测试）         |
| `packages/services/test/creation-polish.test.ts`         | 修改 | 超时诊断 + 结果分类 + 回归测试（10 → 11 个测试） |
| `packages/desktop/test/studio-workflow-schedule.test.ts` | 修改 | 可注入时钟 + 到期/取消用例（3 → 5 个测试）       |

`scripts/test-studio.mjs` **未改动**（理由见第 7 节）。

## 6. 未执行的检查（如实声明）

- `pnpm test:studio`（仓库级离线回归）——按任务约束禁止执行；因此本轮**没有**验证 `scripts/test-studio.mjs` 汇总入口下的整轮行为。
- `pnpm typecheck`、`pnpm lint`、`pnpm fmt:check`——仓库级命令，按约束未执行；改动文件仅做了作用域内的 `oxfmt --check` 与辅助性 `tsc`（见 5.3）。
- `pnpm build:cli-packages`、`pnpm architecture:check`、`pnpm knip`、`pnpm i18n:check`、`pnpm perf:baseline`——未执行。
- `pnpm verify:pre-push`（Lint 与架构检查）——未执行。
- **Node 24.14.0**（`mise.toml` 固定版本）——本机未安装/未切换，未复验。
- Linux / macOS——未执行；POSIX 路径仅通过单测（注入 `platform: "linux"`）覆盖，未在真实 POSIX 环境运行。
- 未执行任何 `git` 写操作（无 add/commit/checkout/stash/reset），仅用过 `git status`/`git diff --stat` 只读查询。

## 7. 剩余已知风险与限制

1. **结果观察者的定时器不可注入（S06，未修改）**：`packages/desktop/src/host/studioScheduleOutcome.ts:43` 是硬编码 `setInterval(..., 30_000)`，无注入点，且该文件不在本次写入范围。因此观察者用例保留**有界**真实等待（2000ms / 50ms）作为逃生口，而不是虚拟时钟。这是本轮遗留的设计限制。
2. **runner 仍无子进程超时（缺陷 D，未修改）**：`scripts/test-studio.mjs:53-68` 的 `spawn` 没有超时，测试挂起时整轮无界等待。未修改的理由：(a) 任务书把它列为条件项（「若引入超时，必须…」）；(b) 在允许的命令集合内**无法端到端验证**该超时路径——验证它必须实际运行被禁止的整轮 `pnpm test:studio` 或为其开测试后门；(c) 该脚本是所有人共用的测试入口，一个未验证的 timeout/kill（尤其 Windows 上需杀进程树）可能把挂起变成误杀或静默 no-op，风险高于收益。规格 R5 已记录「若引入超时」的强制要求，建议由具备整轮运行权限的一轮单独实施并验证。
3. **Node 版本差异**：仓库固定 `24.14.0`，本机 `v26.3.0`。三套件在 v26.3.0 上全绿，但 v24.14.0 未复验；`node --test` 的行为差异（模块 mock、并发调度、`import.meta.dirname`）未在固定版本上验证。
4. **与并行改动的耦合**：工作树中其他 agent 正在修改 `packages/services/src/creation/*`（含 `contract.ts`、`creationService.ts`、`providers.ts`）与 `packages/services/src/studio-runtime/adapters/studioDatabase.ts` 等文件，本报告的测试结果仅对**运行时的文件状态**成立。其中：
   - `studioDatabase.ts` 的 `LEASE_MS` 若被调整，本测试已刻意解耦（不硬编码常量）；但若 `StudioRuntimeService.recover()` 的语义被改（例如引入 turn 检查点续跑，不再把有 running turn 的运行判为 `interrupted`），租约用例需同步更新。
   - `creation/contract.ts` 若改动 `CreationJobStatus` 或 `creationReferenceSlots`，creation 套件需同步更新。
5. **Store 占位程序的判定是启发式**：以「退出码非 0 且 stdout/stderr 均为空（或退出码 9009）」判定，未解析 `Get-Command` 的真实路径（`spawnSync` 不返回解析后的路径）。真正缺失 `python3` 的 Windows 环境同样会命中该分支，提示文案因此把两种情形都提示为 Store 占位，但环境要求是一致的、可执行的。
6. **虚拟时钟的 `delay()` 不会自动兑现**：若生产代码将来在计划工作流路径上新增 `clock.delay()` 等待，驱动循环会在轮数上限处抛出含「仍挂在虚拟延时上的等待数」的诊断（有界失败），而不会永久挂起。这是有意的取舍。

## 8. 回滚说明

改动**仅涉及测试与文档**，无生产代码、无数据库/协议/配置变更，回滚不会影响运行时行为。

- 回滚三个测试文件（由 Lead 执行；本轮按约束未执行任何 git 写操作）：

  ```powershell
  git checkout -- packages/desktop/test/office-plugin-assets.test.mjs packages/services/test/creation-polish.test.ts packages/desktop/test/studio-workflow-schedule.test.ts
  ```

  回滚后恢复到本轮之前的测试集合：office 1 个、schedule 3 个、creation 10 个测试（即第 5.1 节基线）。

- 新增文件 `specs/knorvia-test-stability.md` 与 `docs/knorvia-test-stability-report.md` 可直接删除。
- 无部分回滚的隐患：三个测试文件互不依赖，可单独回滚。
- 注意：回滚会同时撤销新增的回归测试（解释器解析、超时诊断、到期/取消确定性用例），即失去本轮新增的诊断与确定性保障。

## 9. 并行工作树说明

执行期间工作树中存在其他 agent 的未提交改动（`git status --porcelain` 只读观察），与本轮无关，**本报告未修改也未被其影响**的前提下，仅列出以便 Lead 判断提交范围：`packages/services/src/creation/{contract,creationJobs,creationService,creationStorage,providers}.ts`、`packages/services/src/session/tasksDatabase/{migrations,startup}.ts`、`packages/services/src/studio-runtime/**`、`packages/ui/src/studio/workflow/**`、`specs/knorvia-creation.md` 等，以及新增的 `specs/knorvia-output-contract.md`、`specs/knorvia-upgrade-protection.md`、`docs/knorvia-taskbook-execution-record.md`、`packages/services/test/creation-provenance.test.ts` 等。提交时请只包含本轮 5 个文件。
