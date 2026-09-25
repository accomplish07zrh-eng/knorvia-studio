# Knorvia Studio 测试稳定性与 Windows 回归定位

2026-09-25。依据《Knorvia Studio 开发任务书与迭代路线》T02 编写；本规格先于实现。仓库版本 `0.8.0-preview.2`。任务书给出的基线为 `bcc63b6`，本机实际检出的基线为 `797a76e5b5d471d62432c2129084a83349dff8b5`（T01 提交），下文所有实测均在该 SHA 上进行。

## 背景与现状（已核对源码与实测）

- **历史“6 个 Windows 失败”在本机不可复现。** 任务书点名的三个文件在 `797a76e`、Node v26.3.0 上连续各跑 3 次，结果全绿且 `skipped 0`：`office-plugin-assets.test.mjs` 1/1、`studio-workflow-schedule.test.ts` 3/3、`creation-polish.test.ts` 10/10。因此本规格**不声称修复了无法复现的失败**，只处理下列已确认的健壮性与诊断缺陷。[S01]
- **缺陷 A：Python 解释器解析不确定，失败无诊断。** `packages/desktop/test/office-plugin-assets.test.mjs` 按 `process.platform` 在 `python`/`python3` 之间硬选，然后 `assert.ifError(result.error)` + `assert.equal(result.status, 0, result.stderr || result.stdout)`。当解释器缺失（`ENOENT`）或 PATH 命中 Microsoft Store 占位程序时，失败信息不可用。本机实测：`python` → `C:\Users\17018\AppData\Local\Programs\Python\Python313\python.exe`，`status 0`，输出 `Python 3.13.14`；`python3` → `C:\Users\17018\AppData\Local\Microsoft\WindowsApps\python3.exe`（Store 占位），`status 9009`，**stdout 与 stderr 均为空字符串**。因为占位程序不产出任何字节，现有断言的消息参数 `result.stderr || result.stdout` 求值为空串，断言失败时看不到任何原因。[S02]
- **缺陷 B：`terminal()` 超时诊断缺失且分类粗糙。** `packages/services/test/creation-polish.test.ts` 的 `terminal()` 轮询 `getJob` 100 次 × 10ms，超时后抛 `fixture did not settle`，不含 taskId、最后状态与已观察事件，无法区分“结果明确失败”“结果未知”“用户取消”三类语义。任务书要求超时输出 taskId、最后观察到的状态与观察事件，并按三类语义区分，而不是笼统重试。[S03]
- **缺陷 C：计划工作流测试依赖真实时钟与固定 `sleep`。** `packages/desktop/test/studio-workflow-schedule.test.ts` 在 `:63-67` 注入 `now: Date.now`、`delay: sleep`，并在 `:145` 使用固定 `await sleep(40)`、`until()` 使用真实 5s 截止时间（`:20-26`）。固定 `sleep` 只是“等状态推进”的近似，机器越忙越不可靠；任务书要求到期、取消、重启、重复触发用可注入时钟确定性驱动。[S04]
- **缺陷 D：runner 无子进程超时。** `scripts/test-studio.mjs` 用 `spawn` 启动 `--test` 子进程，未设置任何超时，测试挂起时整轮无界等待。[S05]
- **环境差异（风险，不修改）。** `mise.toml` 固定 Node `24.14.0`，本机为 `v26.3.0`；三套件在 v26.3.0 上全绿，但 v24.14.0 未在本机复验。
- **不在范围内的已知限制：** `StudioScheduleOutcomeObserver` 在 `packages/desktop/src/host/studioScheduleOutcome.ts:43` 硬编码 `setInterval(..., 30_000)` 且无注入点，该文件不在本次写入范围，因此不修改，仅在本规格与报告中记录为剩余风险。[S06]

## 术语

- **确定性解释器解析**：不依赖 PATH 中平台的默认命名，而是按固定候选顺序探测，并以“能真正运行目标脚本”的可判定证据作为选择依据。
- **Store 占位程序**：Windows 上 `%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe` / `python3.exe`，未安装真实 Python 时存在的名存实亡的可执行文件，退出码非 0 且通常无输出。
- **诚实预算**：不通过放大超时上限来掩盖未解决的状态推进问题；预算数值须显式命名并说明依据。
- **结果分类**：`definite failure`（状态 `failed`，结果明确失败）、`unknown result`（状态 `interrupted`，可能已计费/仍在运行，结果未知）、`user cancel`（状态 `cancelled`，用户取消）。

## 规则

1. **R1 解释器解析与诊断。** office 插件资源测试必须通过一个可单测的纯解析函数选择解释器，不得再按平台硬编码单个命令名。
   - 候选顺序：POSIX 为 `python3`、`python`；Windows 为 `python`、`python3`。任务书要求 POSIX 优先可用 `python3`。
   - 允许 `KNORVIA_TEST_PYTHON` 环境变量显式指定解释器（绝对路径或命令名），存在时必须优先且**只**使用它；它不可用时报错指出该变量值。
   - 每个候选必须实际探测（`--version`）并满足：`error` 未定义、无信号终止、退出码为 0、输出匹配 Python 3 主版本。仅当全部候选都不满足时才失败。
   - 全部候选失败时必须抛出/断言一条明确消息，至少包含：已尝试的候选及其各自失败原因（`ENOENT`、退出码、stderr 摘要）、Windows 上 Store 占位程序的判据（退出码 9009 / WindowsApps 路径）、以及要求的环境（安装 Python 3 后 `python --version` 输出 `Python 3.x`，或用 `KNORVIA_TEST_PYTHON` 指定绝对路径）。
   - **不得因解释器缺失而 `skip`**：跳过会把环境缺失伪装成通过。找到解释器后仍须运行真实 Python 套件 `python -B scripts/office-plugin-assets.test.py`。
2. **R2 资源测试仍跑真脚本。** 解析成功后执行 `-B scripts/office-plugin-assets.test.py`，退出码非 0 时失败并附 stdout/stderr 摘要；保留 30s 的 `spawnSync` 超时。
3. **R3 创建任务等待诊断。** `terminal()` 保留显式命名的轮询预算（1000ms，10ms 间隔；与修复前一致，**不通过放大超时解决问题**），超时抛出携带以下字段的错误：
   - `taskId`（即 job id）；若从未读到记录则为显式“记录缺失”说明；
   - 最后观察到的状态；
   - 观察到的状态事件序列（去重后的 `状态@已用毫秒`，含首次观察）；
   - 结果分类：`failed` → definite failure，`interrupted` → unknown result，`cancelled` → user cancel，`queued`/`running` → 超时未定；分类必须以可断言文本出现在消息中。
     同时新增一个针对诊断内容本身的回归测试：验证成功路径返回终态、超时路径消息包含 taskId/最后状态/事件/分类。
4. **R4 计划工作流用可注入时钟。** `studio-workflow-schedule.test.ts` 必须注入一个可控时钟（`StudioClock` 语义：`now()`/`id()`/`delay()`），由测试显式推进时间，确定性覆盖：到期调度、取消、重启后不重放已完成节点、重复触发幂等。删除作为“状态推进近似”的固定 `sleep(40)`；仅允许保留一处**有界且带注释**的真实等待作为最后的逃生口（例如观察者订阅回调，其 30s 定时器不可注入，见 S06），并说明为何不能改为虚拟时钟。
   - **id 必须跨实例唯一**：多个 runtime 实例共用同一个 sqlite 文件，若每个实例的 `id()` 都从 1 重新计数，运行/回合 id 会互相覆盖，使“重启后不重放已完成节点”出现**假通过**（节点被误判为已执行）。确定性前缀（如 `rt1-`、`rt2-`）即可，无需随机数。
   - **到期推进不得硬编码实现的租约常量**：租约时长 `LEASE_MS` 定义在 `studioDatabase.ts`，测试应以“远超任何合理租约时长”的虚拟推进量表达“租约一定已到期”，避免该常量调整后测试失效。
   - 驱动循环必须有轮数上限，超限抛出带条件的诊断；等待状态推进只用事件循环让步（`setImmediate`），不读真实时间。
5. **R5 runner 有界超时且不掩盖失败。** 如为 `scripts/test-studio.mjs` 引入子进程超时，必须：超时后终止子进程、打印含存活测试文件/已用时间的诊断、以非 0 退出码结束；**禁止**把超时转换为通过，也禁止把失败重跑成通过。

## 判定表：解释器候选

| 候选探测结果                                           | 选择     | 说明                                   |
| ------------------------------------------------------ | -------- | -------------------------------------- |
| `KNORVIA_TEST_PYTHON` 已设置且探测通过                 | 该值     | 显式指定优先，不再探测其他候选         |
| `KNORVIA_TEST_PYTHON` 已设置但探测失败                 | 失败     | 报错指出变量值与失败原因，不回退       |
| 退出码 0 且输出匹配 `Python 3.`                        | 该候选   | 正常路径                               |
| `error.code === "ENOENT"`                              | 下一个   | 命令不存在                             |
| 退出码非 0 且无任何输出（Store 占位特征，通常为 9009） | 下一个   | Store 占位程序                         |
| 输出匹配 `Python 2.`                                   | 下一个   | 不满足 Python 3 要求                   |
| 全部候选失败                                           | 断言失败 | 消息含候选、原因、Store 判据与环境要求 |

## 验收场景

1. 三套件（office 资源、计划工作流、创作打磨）各自连续 3 次运行全部通过，`fail 0`、`skipped 0`、`cancelled 0`，并记录 pass 计数。
2. 解释器解析函数有单测覆盖：POSIX 优先 `python3`、Windows 候选顺序、`ENOENT` 回退、Store 占位（9009 且空输出）回退、`KNORVIA_TEST_PYTHON` 覆盖与失败不回退、全失败时的消息含环境要求。这些单测在修复前会失败（旧实现没有该函数）。
3. 解释器缺失时测试**失败**并给出可执行的环境要求，绝不 `skip`。
4. `terminal()` 超时消息包含 taskId、最后状态、去重状态事件与三类结果分类之一，且有回归测试断言这些内容。
5. 计划工作流测试中不含作为状态推进近似的固定 `sleep`；到期/取消/重启/重复触发由可控时钟驱动，重复运行结果稳定。
6. 如实报告：未复现的历史失败、未运行的命令（含全量 `pnpm test:studio`、`pnpm typecheck`、`pnpm lint`）、Node 版本差异与 S06 定时器限制。
