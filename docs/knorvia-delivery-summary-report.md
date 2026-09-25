# T05 执行报告：可信交付小结、批量复核与验收记录

2026-09-26。本文件记录真实基线、实际执行的命令与结果、未执行项、剩余风险与回滚方式；不使用任务书的待办当作完成声明。

## 基线

| 项目           | 实际值                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 仓库           | `D:\tools\knorvia-studio`                                                                                                           |
| 任务书声明基线 | `d142571`（`fix: 工作流文件信封接受版本 1/2，未知新版本仍拒绝（T06 后续）`）                                                        |
| 实际 HEAD      | `89db36d24d96fc8dc7f7881fee441c8a3d54acc0`（`docs: 批次验收与便携包交付记录（T13 首次交付）`，由 Lead 在我工作期间提交）            |
| 版本           | `0.8.0-preview.2`（根 `package.json`）                                                                                              |
| 并发状态       | 另一工作流（T04 内核分层）同时改 `adapters/kernels/**`、`kernelTypes.ts`、`domain/capabilityMatrix.ts` 等；本报告只声明我自己的文件 |

我开工时 HEAD 为 `d142571`；`89db36d` 是 Lead 在我实现期间提交的文档提交。我的改动全部落在工作区、未提交（不执行任何状态变更的 git 命令）。

## 变更文件（全部在授权写范围内）

新增：

- `specs/knorvia-delivery-summary.md`
- `packages/services/src/studio-runtime/app/runOutcomeProjection.ts`
- `packages/services/test/studio-delivery-summary.test.ts`
- `docs/knorvia-delivery-summary-report.md`（本文件）

修改：

- `packages/services/src/studio-runtime/types.ts`（增量交付类型 + `StudioRun.outcome?`）
- `packages/services/src/studio-runtime/contract.ts`
- `packages/services/src/studio-runtime/app/ports.ts`
- `packages/services/src/studio-runtime/app/runtimeProjections.ts`
- `packages/services/src/studio-runtime/app/workspaceReview.ts`
- `packages/services/src/studio-runtime/adapters/workspaceApply.ts`
- `packages/services/src/studio-runtime/adapters/workspaceManager.ts`
- `packages/ui/src/studio/runtime/StudioRunHistory.tsx`
- `packages/ui/src/studio/runtime/StudioWorkspaceReviewCard.tsx`
- `packages/ui/src/studio/runtime/studioRunHistoryActions.ts`
- `packages/ui/src/studio/runtime/studioWorkspaceDiff.ts`
- `packages/ui/src/i18n/locales/zh-CN.ts`、`packages/ui/src/i18n/locales/en-US.ts`
- `packages/ui/test/studio-run-history-actions.test.ts`（扩展）
- `packages/ui/test/studio-workspace-diff.test.ts`（扩展）

未触碰：`adapters/kernels/**`、`kernelTypes.ts`、`domain/capabilityMatrix.ts`、`creation/**`、`workflow/**`、`app/studioRuntimeService.ts`、`app/runQueries.ts`（无需改动）、任何节点工厂与调度器。

## 实现要点

1. **交付结论是只读投影**（`app/runOutcomeProjection.ts`，纯函数、无 IO）：`readStudioRunOutcome` 由既有账户记录派生 `produced / checked / unverified / unknown` 与证据列表；`runOutcomeProjection.ts:1-20` 明确"结论不落库、不写状态"。
2. **证据优先级**：`host-hash`（Host 重读 + apply journal）> `creation-record`（`creation-output` 引用，带 `sha256` 才升级到 `checked`）> `kernel-tool-state`（`message kind=tool`）> `model-claim`（步骤散文）。模型文字与工具状态在代码里**从不参与**结论升级判定（`stepOutcome` 只读 acceptance/creation/head），模型写着"测试全部通过"仍得到 `unverified`。
3. **验收记录**（`app/workspaceReview.ts`）：成功应用后写 `StudioRepository` 新 kind `apply-acceptance`，字段与规格一致（`runId/stepId/projectKey/operationId/acceptedAt/paths/fileVersions[{path,afterHash}]/creation/confirmation/result/journalState`）。它只是辅助证据，永不作为任务终态被读回。
4. **应用顺序**：复核 → 加锁（含 `phase`）→ 应用（取 Host 回执）→ `versions()` 独立重读核验 → **同一事务**写验收记录并释放锁。核验抛错时不写任何验收行，并保留 `recoveryRequired` 锁（`applied && !accepted → recoveryRequired = true`），错误信息明确写出"新内容已写入项目，但验收核验失败：…"。
5. **操作 id**：`StudioWorkspacePort.apply` 返回 `StudioApplyReceipt`（`operationId` = `workspaceApply.ts` 的 `randomUUID`，与 `apply-<uuid>.json` 同名；有测试断言同名）。契约里 `apply` 类型是 `Promise<StudioApplyReceipt | void>`，旧的测试替身继续返回 `void` 也不会编译失败；`void` 时代码不会伪造操作 id、也不写"已核验"。
6. **远端路径**：`applyAgentWorkspaceChanges` 的契约改为 `Promise<StudioApplyReceipt | void>`，本地 Host 拿到远端摘要时仍**永不**标记为已核验——写入 `confirmation: "remote-returned"`、`result: "remote-unverified"`。今天远端实现仍返回 `void`，因此远端记录只有"远端未返回摘要"这一事实（见"剩余风险"）。
7. **重启后显示**：`studioRestartDisplay` 是纯函数，输入为（验收记录、当前哈希、复核读取到的冲突、journal 状态、apply-lock、结果是否已知），输出 `partial-unknown` / `applied-refresh-failed` / `accepted-later-modified` 或 `null`。时间线步骤行显示 DB 可推导的部分，复核弹窗用本次读取的 `conflict` 判定"之后被修改"（`conflict === true` 在存在验收记录时等价于当前哈希 ≠ 已接受哈希）。
8. **批量复核**：`studioRunHistoryActions` 的选择集放在既有快照里（`review.selected`），取消订阅/关闭/重开/目标切换都会清空；重新读取会把选择收敛到仍可应用且仍存在的路径；批量应用一次提交一个 `paths[]`，走既有 `applyWorkspaceChanges` 签名；冲突卡片由纯选择器 `studioReviewApplicablePaths` 排除，活跃任务/基线冲突/链接安全/应用锁校验位置未动。
9. **UI 文案**：新增 11 个 `studio.delivery.*` 键，中英同步（`{count}` 占位符一致），由 `intl.formatMessage` 使用。

## 实际执行的命令与结果

### 测试（退出码 0）

```text
node --experimental-test-module-mocks --import tsx --test \
  packages/services/test/studio-delivery-summary.test.ts \
  packages/services/test/studio-workspace.test.ts \
  packages/services/test/studio-workspace-recovery.test.ts \
  packages/services/test/studio-runtime-polish.test.ts \
  packages/services/test/studio-runtime-lifecycle.test.ts \
  packages/ui/test/studio-run-history-actions.test.ts \
  packages/ui/test/studio-workspace-diff.test.ts
```

结果：`tests 68 / pass 68 / fail 0 / skipped 0`（`duration_ms ≈ 10.4s`）。

其中新文件 `studio-delivery-summary.test.ts` 单独运行：`tests 12 / pass 12 / fail 0`。用例覆盖：模型散文与工具状态不提升结论、隔离产出 vs 已核验、未知结果/未恢复应用不显示为已接受、创作引用哈希、重启三状态（哈希与冲突两个证据源）、独立重读成功才写验收行、核验失败不写行且保留恢复锁、无重读能力时只留 host-journal、远端永不标记已核验、回执操作 id 与 journal 文件名同名、创作作业引用进入验收记录、时间线增量字段。

`studio-run-history-actions.test.ts`：原 7 个用例保持通过，新增 6 个（合计 13 个）：一次 `paths[]`、冲突排除、重新读取收敛选择、批量禁用/失败保留选择、单文件作用域、关闭/切换/迟到读取清空选择、空选择不提交。

### 静态检查与格式（全部退出码 0）

| 命令                                                     | 实际结果                                                                                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec tsc -b packages/services packages/ui`         | 无输出，退出 0                                                                                                                            |
| `pnpm typecheck`（含 `pnpm i18n:check`）                 | 退出 0；`[i18n] en-US and zh-CN: 5234 matching keys, validated values and placeholders`                                                   |
| `pnpm lint`（oxlint）                                    | 退出 0；`Found 0 warnings and 0 errors. Finished in 239ms on 2657 files`                                                                  |
| `node scripts/architecture/architecture-check.mjs check` | `architecture: OK / violations: 0 / baseline: 0 / new: 0`，退出 0                                                                         |
| `pnpm exec oxfmt <自有文件>` 然后 `--check`              | 首次 `Finished in 594ms on 17 files`；最终复查 `All matched files use the correct format.`（19 个文件，含本报告与扩展的测试文件），退出 0 |
| `pnpm i18n:check`                                        | 退出 0；5234 个键、中英一致、占位符校验通过                                                                                               |

未运行 `pnpm fmt` / `pnpm lint:fix` / `pnpm test:studio`（任务书禁止仓库级格式化；`test:studio` 需要先构建 CLI 包，且并发桌面构建占满 CPU）。

## 未执行 / 未验证项

- **未做真实桌面/GUI 手工验证**：`packages/ui/test` 没有 DOM/组件测试环境（无 jsdom / @testing-library），所以勾选框、批量按钮、步骤行文案只通过纯模型（`StudioRunHistoryActions` 与两个纯选择器）测试；React 渲染本身未经运行时验证。
- **未做远端 SSH 端到端验证**：远端应用路径只用替身验证了"返回摘要/不返回摘要都不会标记为已核验"。
- **未做真实磁盘故障注入**：核验失败的路径用替身 `versions()` 抛错模拟，未在真实文件系统上制造中途 IO 故障（既有 `studio-workspace-recovery.test.ts` 覆盖了 apply/rollback 的故障注入）。
- **未验证 `overview()` 的性能回归**：交付投影会给 overview 的每个 run 增加少量索引查询；未做基准测量（`pnpm perf:baseline` 未运行）。

## 剩余风险

1. **远端操作 id 仍拿不到（已知限制）**：契约已允许远端返回 `StudioApplyReceipt`，但远端 Host 的实现 `app/studioRuntimeService.ts:119-127` 不在本任务写范围内，目前返回 `void`。要让远端记录带上远端事务 id，需要在那个文件里把 `applyAgentWorkspaceChanges` 改成 `return this.deps.workspaces.apply(...)`（1 行）；在那之前，远端验收记录只有 `confirmation: "remote-returned"` + `result: "remote-unverified"`，UI 显示"已应用但未能核验"。
2. **`overview` 不枚举工具状态证据**：为避免每次变更都扫描 `message` 记录，overview 载荷里的证据列表不含 `kernel-tool-state`；它从不改变结论类别，但两处载荷的证据列表可能不完全一致（规格已写明）。
3. **旧实现没有回执时不写验收记录**：端口返回 `void` 时无法证明发布了哪些文件与哈希，因此既不写"已验收"也不写"未核验"。这是刻意的（宁可无证据，也不伪造），代价是第三方/旧实现对没有验收记录。
4. **`recoveryRequired` 锁需要人工收敛**：核验失败会留下恢复锁，后续 `workspaceChanges` 复核成功时按既有逻辑删除它；如果用户始终不打开复核弹窗，锁会一直存在并挡住新的应用（与既有行为一致，但 T05 让这条路径更容易被触发）。
5. **验收记录会随 `apply-acceptance` 累积**：每次成功应用写一条，按 `runId` 分 scope，列表上限 1000；没有清理策略（历史证据保留是有意的）。
6. **序列化范围**：`creation` 只从经 `decodeStepOutputs` 校验的引用提取；更高版本或非法的输出契约会被当作"没有创作证据"，不会被误判为已核验。

## 回滚

- 代码：`git checkout -- <上面列出的 14 个修改文件>` 并删除 3 个新增文件（`specs/knorvia-delivery-summary.md`、`packages/services/src/studio-runtime/app/runOutcomeProjection.ts`、`packages/services/test/studio-delivery-summary.test.ts`）与本报告。
- 数据：新增记录只使用新的 kind `apply-acceptance` 与 `apply-lock` 的 `phase` 字段；删除代码后这些记录不会被读取，也不需要迁移。`apply-lock` 的既有字段语义未变，不会留下"新代码写、旧代码读不懂"的锁。
- 契约：`apply`/`applyAgentWorkspaceChanges` 的返回类型只是放宽为 `| void`，回滚后调用方天然兼容。
