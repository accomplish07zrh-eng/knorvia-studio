# Knorvia 内核分层状态 UI 波次验收报告（T04 UI）

更新：2026-09-25。对应 `specs/knorvia-kernel-status.md` 的「UI 呈现（T04 UI 波次）」。本报告只记录本轮真实执行的命令与结果；
未执行项、未验证项与阻塞项在下文如实列出，不把待办当作完成。

## 基线与范围

| 项目     | 实际值                                                                                                                                                                                                                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 基线提交 | `c763651`（`main`，任务书 HEAD；后端 `18acac7` 已在基线之上）                                                                                                                                                                                                                                                                                                 |
| 版本     | `0.8.0-preview.2`（根 `package.json`）                                                                                                                                                                                                                                                                                                                        |
| 仓库     | `D:\tools\knorvia-studio`                                                                                                                                                                                                                                                                                                                                     |
| Node     | `v26.3.0`（`mise.toml` 固定 24.14.0，沿用 T00/T04 后端已记录的环境偏差）                                                                                                                                                                                                                                                                                      |
| pnpm     | `10.33.2`                                                                                                                                                                                                                                                                                                                                                     |
| 写入范围 | `specs/knorvia-kernel-status.md`（追加）、`packages/ui/src/studio/agents/**`、`packages/ui/src/settings/LocalDiagnosticsSettings.tsx`、`packages/desktop/src/main/localDiagnostics.ts`、`packages/shared/src/localDiagnostics.ts` + `index.ts`（诊断请求类型加宽）、两个 locale、`packages/ui/test/**` 与 `packages/desktop/test/**`（新增/扩展测试）、本报告 |
| 未触碰   | `packages/services/**`（含 `contract.ts`、`kernelRun.ts`）、`packages/ui/src/studio/runtime/**`、creation/workflow 文件、`.architecture-baseline.json`、任何策略上限                                                                                                                                                                                          |

检出中存在**并行任务**的未提交改动（`scripts/perf-baseline.mjs`、`packages/ui/src/studio/runtime/StudioRunHistory.tsx`、
`packages/ui/src/studio/runtime/studioRunHistoryWindow.ts`、`packages/ui/test/studio-run-history-window.test.ts`）。
它们在本轮开始后出现，本轮验证是在这些改动**同时存在**的工作区上执行的；下文的 `pnpm lint` 失败项已定位到它们，而非 T04 UI 的改动。

## 变更文件

| 文件                                                                         | 行数        | 内容                                                                                                               |
| ---------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `specs/knorvia-kernel-status.md`                                             | 171 → 236   | 追加「UI 呈现（T04 UI 波次）」：动作/界面矩阵、阶段与原因渲染规则、未知与未核验规则、发送前校验与硬性规则、UI 验收 |
| `packages/ui/src/studio/agents/kernelProbeView.ts`                           | 312（新增） | 纯投影：阶段行（状态/代码/原因/耗时/i18n key）、徽标、能力证据行、opt-in 诊断字段、只读登录提示                    |
| `packages/ui/src/studio/agents/kernelSendGate.ts`                            | 155（新增） | 纯发送前校验：拒绝码/文案 id/参数、`StudioSendRefusalError`、i18n 参数解析                                         |
| `packages/ui/src/studio/agents/probeMessages.ts`                             | 147（新增） | 探测词表的中英文案（阶段、状态、25 个代码、能力证据、拒绝、登录提示），拆文件避免单文件越限                        |
| `packages/ui/src/studio/agents/StudioKernelCard.tsx`                         | 92（新增）  | 单内核卡片：分层徽标、配置/管理/重新探测动作（自 `StudioAgentsSection` 拆出）                                      |
| `packages/ui/src/studio/agents/StudioAgentProbeDetails.tsx`                  | 120（新增） | 四段状态摘要 +「查看诊断」展开表 + 只读登录提示                                                                    |
| `packages/ui/src/studio/agents/StudioSendRefusalNotice.tsx`                  | 51（新增）  | 发送被拒提示：可解释原因、按需登录提示、重新探测出口                                                               |
| `packages/ui/src/studio/agents/studioKernelCatalog.ts`                       | 66 → 105    | `reprobe()` 显式 `{ refresh: true }`、单飞合并保留 refresh 语义、`reprobing` 快照字段                              |
| `packages/ui/src/studio/agents/useStudioKernelCatalog.ts`                    | 38 → 40     | 暴露 `reprobe`                                                                                                     |
| `packages/ui/src/studio/agents/StudioAgentsSection.tsx`                      | 322 → 296   | 改用卡片组件，接 `reprobe()`（卡片、管理动作后、保存配置后）                                                       |
| `packages/ui/src/studio/agents/StudioAgentManagementDialog.tsx`              | 140 → 151   | 底部按钮改为绕过缓存的重探，并显示分层探测证据                                                                     |
| `packages/ui/src/studio/agents/StudioAgentStatusDetails.tsx`                 | 67 → 84     | 能力行补证据等级、版本未核验提示，接入探测详情                                                                     |
| `packages/ui/src/studio/agents/StudioExternalChat.tsx`                       | 364 → 395   | 发送走带校验的 `submitStudioChat`，渲染拒绝提示与登录提示                                                          |
| `packages/ui/src/studio/agents/chatSubmission.ts`                            | 23 → 52     | 发送前校验入口：被拒时不发任何命令                                                                                 |
| `packages/ui/src/studio/agents/messages.ts`                                  | 327         | 改为展开 `agentProbeZhCN`/`agentProbeEnUS`                                                                         |
| `packages/ui/src/settings/LocalDiagnosticsSettings.tsx`                      | 132 → 160   | opt-in「包含内核分层探测阶段」勾选与阶段字段投影                                                                   |
| `packages/ui/src/i18n/locales/zh-CN.ts`、`en-US.ts`                          | +3 / +3     | `settings.localDiagnostics.includeProbe`、`includeProbeHint`                                                       |
| `packages/shared/src/localDiagnostics.ts`                                    | 46 → 82     | 诊断请求类型按需加宽：可选 `probe`（四段 + 耗时 + 时刻 + cached），保持 `.strict()`                                |
| `packages/shared/src/index.ts`                                               | +2 导出     | `LOCAL_DIAGNOSTIC_PROBE_STAGES` 与 `LocalDiagnosticProbe*` 类型                                                    |
| `packages/desktop/src/main/localDiagnostics.ts`                              | 244 → 287   | `safeProbeProjection`：阶段字段过凭据脱敏 + 路径归一为 `[path]`，opt-in                                            |
| `packages/ui/test/studio-kernel-probe-view.test.ts`                          | 360（新增） | 8 个用例：分层渲染、未知归一、代码映射、缓存、能力证据、诊断字段、只读登录提示                                     |
| `packages/ui/test/studio-kernel-send-gate.test.ts`                           | 190（新增） | 5 个用例：不支持能力预先拒绝且不发命令、版本未核验、未安装/协议失败/未检测、放行不改写模型与权限                   |
| `packages/ui/test/studio-kernel-catalog.test.ts`                             | +43         | 2 个用例：`reprobe` 传 `{refresh:true}`、在飞期间重探重跑并保留 refresh                                            |
| `packages/desktop/test/local-diagnostics-probe.test.ts`                      | 151（新增） | 2 个用例：阶段字段出现且不泄露路径/凭据、加宽后 schema 仍严格                                                      |
| `packages/ui/test/studio-chat-options.test.ts`、`studio-chat-polish.test.ts` | +28 / +12   | 既有提交语义测试补齐 `permission`/`kernelName`/`status` 必填输入；断言未改                                         |

架构拆分：`messages.ts` 与 `StudioExternalChat.tsx` 在加入新文案/新块后接近 400 行，按「拆文件而不是抬上限」的规则，
把探测词表拆到 `probeMessages.ts`、把发送拒绝块拆到 `StudioSendRefusalNotice.tsx`、把卡片拆到 `StudioKernelCard.tsx`。
架构检查 0 违规，未改基线，未改任何策略上限。

## 命令与真实结果

| 命令                                                                                                                                                                                                                                                                                                                | 结果                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --experimental-test-module-mocks --import tsx --test --test-concurrency=2 packages/ui/test/studio-kernel-probe-view.test.ts studio-kernel-send-gate.test.ts studio-kernel-catalog.test.ts plugin-settings-visibility.test.ts packages/desktop/test/local-diagnostics.test.ts local-diagnostics-probe.test.ts` | 退出 0：`tests 26 / pass 26 / fail 0`                                                                                                                                                                                           |
| 上述 6 个文件**之外的** `packages/ui/test` 全目录（含上述 UI 文件，共 284 个用例）                                                                                                                                                                                                                                  | 退出 0：`tests 284 / pass 284 / fail 0`                                                                                                                                                                                         |
| `packages/desktop/test` 全目录（39 个用例）                                                                                                                                                                                                                                                                         | 退出 0：`tests 39 / pass 39 / fail 0`                                                                                                                                                                                           |
| `packages/shared/test` 全目录                                                                                                                                                                                                                                                                                       | 退出 0：`tests 5 / pass 5 / fail 0`                                                                                                                                                                                             |
| `pnpm i18n:check`                                                                                                                                                                                                                                                                                                   | 退出 0：`[i18n] en-US and zh-CN: 5313 matching keys, validated values and placeholders`（基线 5234）                                                                                                                            |
| `pnpm exec tsc -b packages/ui packages/desktop/tsconfig.main.json`                                                                                                                                                                                                                                                  | 退出 0，无输出                                                                                                                                                                                                                  |
| `node scripts/architecture/architecture-check.mjs check`                                                                                                                                                                                                                                                            | 退出 0：`architecture: OK / violations: 0 / baseline: 0 / new: 0`                                                                                                                                                               |
| `pnpm exec oxfmt <本轮 25 个文件>` 后 `pnpm exec oxfmt --check <同 25 个文件>`                                                                                                                                                                                                                                      | 退出 0：`All matched files use the correct format.`（未执行全仓 `pnpm fmt`，按任务要求）                                                                                                                                        |
| `pnpm lint`（oxlint，2679 文件）                                                                                                                                                                                                                                                                                    | **退出 1**：`Found 3 warnings and 1 error.`，**全部位于 `scripts/perf-baseline.mjs`**（`eslint(max-lines)`：807 行 > 400）。该文件属并行任务的未提交改动（`git diff --stat` 显示 +606/-21，HEAD 版本 281 行），不在本轮写入范围 |
| `pnpm exec oxlint <本轮 38 个文件>`（定位用）                                                                                                                                                                                                                                                                       | 退出 0：`Found 0 warnings and 0 errors.`                                                                                                                                                                                        |

### 未由 `pnpm lint` 覆盖但已确认的项

`pnpm lint` 的退出码为 1，来自并行任务的 `scripts/perf-baseline.mjs`；对本轮全部 38 个文件单独运行 oxlint 为 0 警告 0 错误。
本报告不把这次 `pnpm lint` 记为通过。

## 关键行为验证（真实用例）

- **“程序存在但协议失败”≠“未安装”**：`protocol.mismatch` + `installed:false` + `origin:"external"` 渲染为「已安装但不可用」，
  `locate.missing` + `origin:"missing"` 渲染为「未检测到安装」；两者徽标、阶段行、发送拒绝文案三处都不同（用例断言三处 key 不相等）。
- **未知/未核验如实呈现**：载荷中未知的阶段状态（如 `"finished"`、缺段）归一为 `unknown` 且不计入通过；`probe` 缺失时按旧字段显示徽标，
  并明确写出「此记录没有分层探测证据，不能据此确认可用」；版本低于已核验下限时能力证据显示「版本未核验」，与「不支持」区分。
- **重新探测走 refresh 路径**：`StudioKernelCatalog.reprobe()` 用加宽视图调用 `inspectKernels({ refresh: true })`（用例断言两次调用的实参为 `undefined` 与 `{refresh:true}`）；
  在飞检测期间发起重探会合并为「结束后再跑一轮」并保留 refresh 语义（用例断言两次调用的实参顺序）。
- **发送前校验**：不支持的能力在**没有任何命令被发出**的情况下抛 `StudioSendRefusalError`（用例断言 `commands` 为空数组）；
  放行路径断言 `send` 命令的 `selection` 与传入值深度相等、命令中不携带 `permission`、`kernelConfig`，且调用方对象未被改写。
- **登录提示是只读的**：把 `globalThis.fetch` 换成会抛错的探针后计算提示，调用次数为 0；`auth.not-requested`（默认文案本身含“登录”二字）
  不会触发提示；对模块导出名做白名单断言，确保没有新增任何执行登录的入口。
- **诊断导出**：阶段字段按内核 opt-in——两个内核中只有一个带阶段信息时，`kernels.json` 里 `"probe"` 只出现 1 次（UI 侧勾选默认关闭）；
  原因中的 `C:\Users\alice\.codex\auth.json` 与 `apiKey=sk-…` 在导出内容里分别变为 `[path]` 与 `[redacted]`，断言不含 `alice`/`auth.json`/明文密钥。

## 阻塞与已知缺口

1. **重新探测的缓存绕过在服务层尚未生效（真实缺口，需要 services 的一行改动）**。
   本轮 UI 已按契约调用加宽签名 `inspectKernels({ refresh: true })`，RPC 代理会原样透传实参，但服务端入口
   `packages/services/src/studio-runtime/app/studioRuntimeService.ts` 的

   ```ts
   inspectKernels() {
     return this.lifecycle.run(() => inspectStudioKernels(this.deps));
   }
   ```

   声明了 0 个形参（运行期实测 `StudioRuntimeService.prototype.inspectKernels.length === 0`，
   而 `inspectStudioKernels.length === 2`），因此 `{ refresh: true }` 会被丢弃，协议段仍可能来自 5 分钟缓存。
   本轮写入范围明确排除 `packages/services/**`，无法在界面上补齐。需要的最小改动（建议由 Lead 或 services 所有者执行）：

   ```ts
   inspectKernels(options?: StudioKernelInspectOptions) {
     return this.lifecycle.run(() => inspectStudioKernels(this.deps, options));
   }
   ```

   以及 `contract.ts` 中 `inspectKernels(options?: StudioKernelInspectOptions): Promise<StudioKernelStatus[]>` 的签名加宽（向后兼容）。
   在补齐之前，UI 的「重新探测」会重新执行整轮探测并如实显示结果，但若协议段命中缓存，界面会显式标注「协议段来自缓存」，
   不会把缓存结果伪装成一次新的握手。

2. `auth` 段仍没有执行体（后端本轮只落地“永不自动、需显式 opt-in、否则 skipped”的契约），因此登录提示只能由
   `protocol`/`version`/`locate` 段中指向认证的原因触发，或在宿主未来给出 `auth.failed` 等代码时触发；本轮未新增任何账号探测。
3. 远端（`ssh:`）状态的阶段信息依赖远端主机上报；断线快照会保留上一次的 `probe`，界面按 `remoteWorkspacePath && !installed`
   优先显示「SSH 离线」，但阶段行仍会显示上次探测的内容（与后端「断线只改 installed/error」的既有行为一致）。

## 未执行项

- 未做任何真实 CLI/模型/网络调用：全部使用夹具状态对象与桩命令；`auth` 段没有探测器可跑。
- 未做视觉/桌面交互验证：没有启动 Electron、没有截图、没有 E2E；`packages/ui/test` 无 DOM harness，因此验证的是纯投影/映射模块
  与业务入口（`chatSubmission`、`studioKernelCatalog`），组件渲染本身只做类型检查与 lint。
- 未执行全仓 `pnpm typecheck`（只执行了任务给定的 `tsc -b packages/ui packages/desktop/tsconfig.main.json` 与 `pnpm i18n:check`）。
- 未执行 `pnpm fmt:check`（按任务要求不做全仓格式化）、`pnpm test:studio`、`pnpm build:cli-packages`、`pnpm knip`、`pnpm perf:baseline`、`pnpm verify:pre-push`。
- 未改动 `packages/ui/src/studio/runtime/**`（另一任务所有）；`StudioExternalChat` 仍复用既有的 `StudioTimeline` 呈现。

## 剩余风险

- **缓存绕过缺口**（见上）是唯一未闭环的功能要求；补齐 services 一行改动后需要重跑本报告的 UI 测试集合。
- 发送前校验把「尚未检测」也按失败关闭处理：内核目录首帧尚未完成检测时（`statuses` 为空）发送会被拒绝，界面给出
  「尚未检测…请先重新检测」与「重新探测」按钮。这是有意的诚实行为，但属于相对旧行为的可见变化（旧行为会直接把请求发给服务端再失败）。
- 能力证据等级是对本地版本化矩阵的解读：对 ACP 协商后升级的能力（`resume`/`approval`）显示为「按当前接入声明」而非「已核验」，
  这是刻意不越权声称；若产品希望区分 `advertised`/`adapter` 证据，需要后端把证据一并放进 `StudioKernelStatus`（本轮未加字段）。
- 诊断导出的路径归一 `DIAGNOSTIC_PATH_LIKE` 是保守正则：极端形态（例如不含分隔符的驱动器相对路径）可能不被归一；
  阶段字段本身只有状态/代码/原因/耗时，且仍先过既有凭据脱敏，泄露面有限。
- 桌面端日志导出与阶段字段共用同一份 `kernels.json`，若未来有人把 `probe` 加到预览允许清单之外，需要同步更新本报告的业务断言。

## 回滚

改动是纯增量，无数据迁移与持久化格式变更（诊断请求是逐次构造的请求体，不落盘）：

1. 恢复被修改的 18 个文件（`git checkout -- <files>` 由 Lead 执行即可，本轮未做任何写操作类 git 命令）；
2. 删除本轮新增的 9 个文件：`kernelProbeView.ts`、`kernelSendGate.ts`、`probeMessages.ts`、`StudioKernelCard.tsx`、
   `StudioAgentProbeDetails.tsx`、`StudioSendRefusalNotice.tsx`、`studio-kernel-probe-view.test.ts`、`studio-kernel-send-gate.test.ts`、
   `local-diagnostics-probe.test.ts`、本报告；
3. 回滚后重跑 `pnpm exec tsc -b packages/ui packages/desktop/tsconfig.main.json`、`pnpm i18n:check`、
   `node scripts/architecture/architecture-check.mjs check` 与 UI/desktop 测试集合即可确认回到基线；
4. 回滚不影响任何内核安装、会话或缓存状态（探测缓存仅存在于 Host 进程内）。
