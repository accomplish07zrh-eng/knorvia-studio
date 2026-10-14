# shared-01 验收记录（acceptance.md）

合同版本 **v1**。本文件记录范围、旧门、门禁、未覆盖项与红线对照，供「合同审查」逐项自查。

## 1. 范围与文件数（继承口径）

| 目录                               | 继承文件 | 说明                                                                                                                                                |
| ---------------------------------- | -------: | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/node/`        |        6 | `atomicFileLock`、`lockInstanceObserver`、`nodeSelfResourceTelemetry`、`officialPluginCache`、`privateFilePersistence`、`subagentMarkdownMigration` |
| `packages/shared/src/protocol-v4/` |       21 | 含 `wire-codec`/`wire`/`workflow-runs*`/`delta`/各 schema 模块                                                                                      |
| **合计**                           |   **27** | 与计划书分包总表「27 文件」一致；单包 ≤60 ✓                                                                                                         |

另有 30 个 `unreviewed` 文件（`node/knorviaPaths.ts` 与 `protocol-v4/` 下 29 个，含两个入口桶）
**不在本包选包口径内**，不重写、不删（`known-differences.md` 第 2 节）。
`interface.md` 覆盖 `node` 入口 13 个导出；`interface-appendix-protocol-v4.md` 覆盖
`protocol-v4` 571 项导出（314 运行时值 + 257 纯类型），由 `dep-refs --list-exports` 生成。

调用方：[`callers.md`](callers.md) 按其记载口径在合并后的 main 上重新生成，**281 个文件**
（骨架版 279；差额来自 `packages/shared/test/workflow-projection-consumers.test.ts` 与
`scripts/studio-handoff-smoke.mjs` 两个静态 import，以及近期替换 PR 造成的成员变化）。

## 2. 旧门（`scripts/contract-gate.mjs`）

命令（仓库根，Node 24.14.0）：

```powershell
node scripts/contract-gate.mjs --contract specs/contracts/shared-01 --tests "*.test.mjs" `
  --dist-env KNORVIA_SHARED_01_ENTRY=dist `
  --stub-root specs/contracts/shared-01/stubs --stub-targets specs/contracts/shared-01/stubs/targets.txt
```

| 入口/验证                                                           | tests | pass | fail | 结论                                 |
| ------------------------------------------------------------------- | ----: | ---: | ---: | ------------------------------------ |
| 源码（`src`，`--import tsx`）                                       |    56 |   56 |    0 | 通过                                 |
| dist（`KNORVIA_SHARED_01_ENTRY=dist`，先 `tsc -b packages/shared`） |    56 |   56 |    0 | 通过                                 |
| 桩替换（27 个模块路径，import 即抛 `not implemented: shared-01`）   |     6 |    0 |    6 | `allFail=true`：测试确实测到公开行为 |

- 预登记差异：**无**（56/56 全过，没有放宽或跳过的断言）。
- 运行基线：`gate-old.json` 记录的 `commit = aadcabcf`（合同分支合入含 #151（M0-10 收录修复）
  与 #119（M0-11）的最新 main 之后的 HEAD，合同文件处于已提交状态；记录文件本身随后落盘，
  除此之外合同未再改动）。
- 完整报告见 [`gate-old.json`](gate-old.json)（含两入口输出尾部与桩替换输出尾部）。
- 录制口径：金样全部由旧实现录制（临时脚本 `record-shared01-fixtures.mjs` 按 Lead 的
  临时脚本口径留在执行工作区 `.scratch-exec4/`，不入库）；`encode-cases`/`measure-cases`/
  `subagent-state.*`/`lock-owner`/`plugin-cache-layout` 均为合成数据，无凭据、无真实用户数据。
  逐字节金样放在 JSON 字符串容器里保存（`fixtures/old-write/subagent-state.migrated*.json`
  的 `bytes` 字段），避免仓库格式化器给 JSON 文件补的末尾换行改变金样字节。

## 3. 门禁（本机 Node 24.14.0 + pnpm 10.33.2，工作树 `wt/exec-5-contract`）

| 检查                                                      | 结果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/check-workspace-freshness.mjs`              | 0（基线新鲜，ahead/behind 在阈值内）                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm fmt` / `pnpm fmt:check`                             | 0 / 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `pnpm lint`                                               | 0（0 error；warning 均为仓库存量，本包文件 0 条）                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `pnpm typecheck`（含 `i18n:check`）                       | 0（5573 对键一致）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `pnpm architecture:check`                                 | 0（violations 0 / baseline 0 / new 0）                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `pnpm build:cli-packages`                                 | 0（15/15 tasks）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm provenance:report` / `pnpm provenance:check`        | 0 / 0（reviewProblems 0、missingReviews []）                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `pnpm knip`                                               | 1 —— **main 上同样失败**：`Unused files (1840)`，同口径基线（临时移走本包 tests 目录实测）**1832**，本包净增 **8**——全部是 `specs/contracts/shared-01/tests/` 下的测试与辅助文件，与既有合同测试同样未被 knip 认作测试入口；桩目录已被 `knip.json` 的 `specs/contracts/*/stubs/**` 忽略                                                                                                                                                                                                                   |
| `pnpm architecture:context shared`                        | 0 —— 该模块 `managed: false / owner: unassigned`，无受控契约可读（选包步骤二的核对以 `architecture:check` 全量 0 违规 + `dep:refs` 导出/调用方清单为准）                                                                                                                                                                                                                                                                                                                                                  |
| 全仓合同测试（`specs/contracts/*/tests/*.test.{mjs,ts}`） | **332/332 通过**（含本包 56 例；用于核对 M0-10 收录恢复后 CI 会跑的集合）                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `pnpm test:studio`（本机全量，9031 例）                   | 9013 过 / **11 失败** / 2 取消 / 5 跳过：11 个失败**全部是 main 既有测试的本机环境问题**（`device-fs-runtime-contract` 60s 超时；7 个 causality 族文件因 turbo 缓存命中未生成 `libs.generated.ts`，补跑该生成物后隔离复跑 **40/40 全过**；`creation-*` 两处断言与 `official-plugin-staging`，均需 `--experimental-test-module-mocks` 等 test-studio 口径、且在纯 main 工作树 `wt/exec-4-m010` 同样复现）；**本包 6 个契约测试文件 56 例在该全量运行中全过**，同套件 CI Linux + Windows 双平台全绿（#152） |

`pnpm knip` 属计划书「某项检查在 main 上本来就失败」一档：main 同一命令同样退出 1，
失败项与 main 一致，不属本包问题；未改 `knip.json`（共享文件，按 Lead 的串行合并纪律处理）。

## 4. 未覆盖项（替换阶段自查）

1. **纯类型导出（257 项）**：`type`/`interface` 无运行时值，B43 只核对导出名集合与
   `interface.md`/附录一致；类型内部结构靠 `pnpm typecheck` 与替换阶段的导出比对脚本守住。
2. **跨进程真实竞态**：B1 的「两进程同时 `mkdir` 抢锁」、B3 的 mtime 精度差异，
   以单进程可复现路径覆盖（活进程 pid 不回收、死进程 pid 回收、损坏元数据、grace 钳制）；
   真实双进程竞态不进离线 CI（依赖进程时序，计划书禁用 sleep/超时凑结果）。
3. **B8 的「改写期间文件被改动」复核**（inode/dev/内容变化即抛）：需要并发写，
   离线测试未构造该竞态；静默路径（坏 JSON、缺文件）与字节级往返已覆盖。
4. **`unreviewed` 的 30 个文件**：不在本包冻结范围，其行为由后续复核或所属包合同负责。
5. **macOS**：未实机验证（本包为纯逻辑 + 文件 IO；Windows 与 Linux 由 CI 双平台覆盖，
   按计划书平台口径如实标注）。

## 5. 与计划书红线的对照

- 未复制、未改名照搬、未逐行改写任何旧实现：本 PR 只新增 `specs/contracts/shared-01/`
  下的合同文档、测试、夹具与桩（外加一处工具修复，见 PR 描述的裁决引用）。
- 未放宽任何断言、无 skip、无 todo；桩替换 6/6 全失败证明测试有效（`gate-old.json`）。
- 未改用户数据格式、协议字段、`KNORVIA_` 环境变量与 `.knorvia-studio` 数据目录。
- 金样按旧实现录制，录制口径未因新写法调整；夹具全部为合成数据。
- 时序类断言用事件序列（B5 的 enter/exit 序列、B35/B36 的 reducer 状态序列），无 sleep、
  无固定超时；测试文件不含任何 `setTimeout`/等待循环。
