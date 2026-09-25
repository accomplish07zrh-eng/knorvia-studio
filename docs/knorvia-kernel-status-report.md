# Knorvia 内核分层状态与真实能力验收报告（T04，后端）

更新：2026-09-25。对应 `specs/knorvia-kernel-status.md`。本报告只记录本轮真实执行的命令与结果；未执行、未验证与已知风险在下文如实列出，不把待办当作完成。

## 基线与范围

| 项目     | 实际值                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| 基线提交 | `d142571b673aad0370df03aac0645542dfffe7da`（`main`，任务书 HEAD）                                                  |
| 版本     | `0.8.0-preview.2`（根 `package.json`）                                                                             |
| 仓库     | `D:\tools\knorvia-studio`                                                                                          |
| Node     | `v26.3.0`（`mise.toml` 固定 24.14.0，属环境偏差，与 T00 记录一致）                                                 |
| pnpm     | `10.33.2`                                                                                                          |
| 写入范围 | 仅 `specs/knorvia-kernel-status.md`、`docs/knorvia-kernel-status-report.md`、下列 services 源码与测试              |
| 未触碰   | `contract.ts`（另一任务所有）、`packages/ui/**`、全部 locale、`kernelRun.ts`、`executable.ts`、`managedKernels.ts` |

检出中存在其它并行任务的未提交改动（`app/runOutcomeProjection.ts`（新增，未跟踪）、`app/runtimeProjections.ts`、`app/ports.ts`、`app/workspaceReview.ts`、`adapters/workspaceApply.ts`、`adapters/workspaceManager.ts`、`contract.ts`、`types.ts`、`packages/ui` 多个文件与 locale）。本轮验证是在这些改动**同时存在**的工作区上执行的；下文的失败项已定位到它们，而非 T04 的改动。

## 变更文件

| 文件                                                                                     | 行数        | 内容                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specs/knorvia-kernel-status.md`                                                         | 171（新增） | 分层探测契约、状态/原因词表、缓存键与 TTL、能力矩阵规则、账号段规则、验收场景                                                                      |
| `adapters/kernels/probeResult.ts`                                                        | 235（新增） | `ProbeStage`/状态/`ProbeStageResult`/`StudioKernelProbe`/`ProbeError`、代码归一与摘要、环境指纹与五元组缓存键、有界 TTL `ProbeCache`（浏览器安全） |
| `adapters/kernels/kernelInspection.ts`                                                   | 235（新增） | 分层探测执行者：四段独立捕获、协议缓存读写、失败代码归类、附加动作（更新入口/清理）独立捕获                                                        |
| `domain/capabilityMatrix.ts`                                                             | 264（新增） | 版本化能力矩阵（kernel/家族 + `verifiedFrom`）、证据等级、`assessKernelCapabilities`、`mergeAdvertisedCapabilities`、版本区间判定                  |
| `kernelTypes.ts`                                                                         | 169→185     | 唯一新增字段 `probe?: StudioKernelProbe`、`StudioKernelInspectOptions`，底部通配再导出 probeResult 与 capabilityMatrix（进入公开 API）             |
| `adapters/kernels/kernelRegistry.ts`                                                     | 318→291     | 只保留在飞去重 `running`、运行租约、生命周期；`inspect` 支持 `{refresh}`，`manage`/`dispose` 失效缓存                                              |
| `adapters/kernels/processTransport.ts`                                                   | 293→313     | 取消/超时/输出异常/退出/启动错误抛带码 `ProbeError`；`captureVersion` 增加可配期限 `VERSION_PROBE_TIMEOUT_MS`                                      |
| `adapters/kernels/acpProbe.ts`                                                           | 53→64       | 取消抛 `protocol.cancelled`；能力升级改走能力矩阵，只允许 `resume`/`approval`                                                                      |
| `adapters/kernels/acpProtocol.ts`                                                        | 181→183     | 协议版本不符抛 `ProbeError("protocol.mismatch")`（消息保持原文）                                                                                   |
| `domain/kernelPolicy.ts`                                                                 | 80→100      | `kernelCapabilities(id, version?)` 委托矩阵；`assertKernelPermission(id, permission, options?)` 支持版本化收紧与用户显式例外                       |
| `app/kernelOperations.ts`                                                                | 63→82       | `inspectStudioKernels(deps, {refresh})` 显式重探贯通（端口本身未改，用加宽视图）                                                                   |
| `test/kernel-probe-stages.test.ts`                                                       | 614（新增） | 分层探测、缓存、能力矩阵、旧字段回归共 14 个用例                                                                                                   |
| `test/studio-kernels-probe-lifecycle.test.ts`、`-transport.test.ts`、`-versions.test.ts` | +34/+4/+13  | 扩展：取消/超时不同代码、握手超时代码、分层证据与旧字段                                                                                            |

架构拆分说明：分层探测逻辑使 `kernelRegistry.ts` 一度达到 448 行，超过 `architecture-policy.yaml` 的 `maxFileLines: 400`。按“拆文件而不是抬上限/改基线”的规则，把探测执行、缓存与失败归类移入新文件 `adapters/kernels/kernelInspection.ts`，`kernelRegistry.ts` 只保留注册表职责；架构检查为 0 违规（含 0 新违规），未改基线。

## 命令与真实结果

| 命令                                                                                                                                                                                                                          | 结果                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/services/test/studio-kernels-*.test.ts studio-acp-discovery.test.ts studio-antigravity-protocol.test.ts kernel-probe-stages.test.ts` | 退出 0：`tests 86 / pass 86 / fail 0`（约 31.5 s）                                       |
| `pnpm exec tsc -b packages/services`                                                                                                                                                                                          | 退出 0，无输出                                                                           |
| `pnpm typecheck`（i18n 校验 + 全部 project references，含 ui/web/desktop host+main）                                                                                                                                          | 退出 0；`[i18n] en-US and zh-CN: 5234 matching keys, validated values and placeholders`  |
| `pnpm lint`（oxlint，2657 文件）                                                                                                                                                                                              | 退出 0，`Found 0 warnings and 0 errors.`                                                 |
| `node scripts/architecture/architecture-check.mjs check`                                                                                                                                                                      | 退出 0：`architecture: OK / violations: 0 / baseline: 0 / new: 0`                        |
| `pnpm exec oxfmt <本轮 15 个文件>` 后 `pnpm exec oxfmt --check <同 15 个文件>`                                                                                                                                                | 退出 0：`All matched files use the correct format.`（未执行全仓 `pnpm fmt`，按任务要求） |
| （额外自查）`packages/services/test` 全部 59 个测试文件并行运行                                                                                                                                                               | 86+ 通过；2 个失败，均已定位为非 T04 原因（见下）                                        |

### 观察到的、与 T04 无关的失败

| 测试                                                    | 现象                                                                                                       | 判定依据                                                                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `studio-interaction-history.test.ts`                    | `TypeError: Cannot read properties of undefined (reading 'steps')`，栈在 `app/runOutcomeProjection.ts:130` | 该文件在本基线提交中不存在（`git log` 无记录、`git status` 显示未跟踪），由并行任务新增；`runtimeProjections.ts:69` 由同一任务修改。单独运行同样失败，与内核状态改动无关 |
| `studio-delivery-summary.test.ts`（仅并行整目录运行时） | `ReferenceError: mkdirSync is not defined`（该文件第 2 行确有该导入）                                      | 单独运行 12/12 通过；同一文件在 59 文件并行运行下报出，属并行运行/模块状态干扰，未涉及内核模块                                                                           |

对本轮点名的测试集合（`studio-kernels-*`、`studio-acp-discovery`、`studio-antigravity-protocol`、`kernel-probe-stages`）没有失败。

## 关键行为验证（真实用例）

- 程序存在但协议失败 ≠ 未安装：协议失败时 `installed:false`、`origin:"external"`、`version` 与 `executablePath` 保留、`probe.stages.protocol.code === "protocol.mismatch"`；未安装时 `origin:"missing"`、`probe.stages.locate.code === "locate.missing"`、`version`/`protocol` 段为 `stage.not-reached`。
- 取消与超时：`version.cancelled` 与 `version.timeout` 是不同代码（真实进程挂起 + 60 ms 期限用例）；注册表 `dispose()` 中断的在飞探测保留定位证据并记 `cancelled`。
- 非致命附加动作：注入 `externalUpdatePlan` 抛错与 `isolation.close()` 抛错后，状态仍为 `installed:true`、`origin:"external"`、`version:"1.2.3"`、`error: undefined`。
- 缓存：同键第二次探测 `probe.cached === true` 且夹具 `initialize` 只出现一次；`refresh: true` 重新握手；`invalidate()` 后重新握手；可执行文件路径或版本变化自然未命中；隔离探测每次新建的临时 HOME 经 `<isolated>` 归一后仍然命中。
- 能力矩阵：17 个内核 id 的五能力与替换前的硬编码分支逐一相等（旧行为零回归）；`codex@0.151.0` 只读证据为 `verified`，`codex@0.100.0` 降级为 `unverified` 且布尔值 false，`codex`（未知版本）保持 `declared`；`assertKernelPermission` 在未核验版本与明确不支持的内核上拒绝只读，用户例外只在显式传入时生效；原生声明只升级 `resume`/`approval`。
- 账号段：所有自动探测路径下 `auth` 为 `skipped`/`auth.not-requested`；本轮新增代码中不存在任何登录调用（既有 `grokAuth.ts` 同样只提示用户自行登录）。

## 未执行项

- 未做任何真实 CLI/模型/网络调用：全部使用临时目录夹具与依赖注入桩；`test:studio` 与 `build:cli-packages` 未运行（本轮按任务给定的测试集合验证）。
- 未实现账号探测（auth）的执行体：本轮只落地“永不自动、需显式 opt-in、否则 skipped”的契约与代码路径，宿主尚未提供探测器，因此“账号可用”从不会被断言。
- 未改 UI/桌面/i18n（本轮明确不在范围）：新增的 `probe` 与证据等级尚未在界面呈现。
- 未执行全仓 `pnpm fmt:check`、`pnpm knip`、`pnpm perf:baseline`、`pnpm verify:pre-push`。
- 未做版本化能力矩阵在运行层（`kernelRun.ts`）的接入：该文件不在本轮写入范围。

## 剩余风险

- 运行层权限断言仍无版本上下文：`kernelRun.ts:126` 调用 `assertKernelPermission(kernel, permission)` 时不传版本，因此“已知但未核验版本”的收紧只在发现层生效；发现层的 `capabilities.readOnly=false` 与运行层放行之间存在显示与执行的轻微不一致（下一 wave 传入版本即可收敛，接口已预留）。
- 定位段细分代码依赖既有错误文本归类（`locate.missing`/`locate.path-invalid`/`locate.launcher-unresolved`/`locate.manager-unavailable`）：`executable.ts`、`managedKernels.ts` 不在写入范围，尚未抛 `ProbeError`；原文始终保留在 `reason`，归类变化只影响代码粒度。
- 缓存在 TTL（5 分钟）内信任“同路径 + 同版本 + 同环境指纹”的握手结论；受管安装的收据与完整性每次定位都重新校验，但外部安装若在 TTL 内被原地替换为同版本内容，探测结果仍可能来自缓存。`refresh` 与 `manage` 可立即失效。
- 运行租约释放失败仍会把一次成功探测变成失败（`probe()` 的 `finally` 未加保护，与旧行为一致）：释放失败意味着管理锁状态不确定，本轮有意保持其可见性。
- SSH 远端状态在连接断开时沿用上一次探测的 `probe`/`version`（`kernelOperations.ts` 只改 `installed`/`error`），属既有行为的延伸，后续可在断开映射中一并清理。
- ACP 内核的 `fullAccess` 在发现层仍为 false（虽协议层支持模式切换）：本轮坚持“不静默升级”，未改变既有取值。

## 回滚

改动是纯增量与内部重构，无数据迁移、无持久化格式变更、无 UI/i18n 变更：

1. 恢复 `kernelTypes.ts`、`kernelRegistry.ts`、`processTransport.ts`、`acpProbe.ts`、`acpProtocol.ts`、`kernelPolicy.ts`、`kernelOperations.ts` 与三个被扩展测试文件的改动；
2. 删除新增文件 `adapters/kernels/probeResult.ts`、`adapters/kernels/kernelInspection.ts`、`domain/capabilityMatrix.ts`、`test/kernel-probe-stages.test.ts`、`specs/knorvia-kernel-status.md`、`docs/knorvia-kernel-status-report.md`；
3. 回滚后不需要清理缓存或磁盘状态（缓存仅在进程内），重新执行 `pnpm exec tsc -b packages/services`、`pnpm lint`、`node scripts/architecture/architecture-check.mjs check` 即可确认回到基线。
