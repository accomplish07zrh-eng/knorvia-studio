# shared-02 验收记录（acceptance.md）

合同版本 **v1**（2026-10-15，工作树 `wt/exec-4-s02`，分支 `contract/shared-02`，
基于 main `24b9d47f`）。本文件记录范围、旧门、桩替换、门禁、未覆盖项与红线对照，
供「合同审查」逐项自查。

## 1. 范围与文件数（继承口径）

| 目录/口径                                           | 继承文件 | 说明                                                                             |
| --------------------------------------------------- | -------: | -------------------------------------------------------------------------------- |
| `packages/shared/src`（除 `node/`、`protocol-v4/`） |      139 | 97 upstream-modified + 42 upstream-unchanged（选包前全集）                       |
| 本包选包                                            |       60 | 类型与协议常量为主，按依赖重切，接近 60 上限（M1 复盘口径）✓                     |
| 合同前删除的残留                                    |        2 | `coding-plan-reset.ts`、`coding-plan-subscription.ts`（选择 3，提交 `19230bae`） |
| **本包合同范围**                                    |   **58** | 35 upstream-modified + 23 upstream-unchanged                                     |

选包方法：以 `licensing/current-files.json` 实测为准（M1 复盘：分包总表数字随快照过时）。
种子 60 个类型/常量/校验 schema 文件，逐个解析相对 import 核对依赖方向；
`index.ts` 桶（re-export 117 文件）与 runtime 重文件（`mcp.ts`、`endpoint.ts`、
`browser-use/**`、`protocol/**`）留给 shared-03/04。

调用方：[`callers.md`](callers.md) 静态 import 扫描，1,180 条「文件 × 入口」引用
（根 barrel 1,157 / model-selection 16 / runtime-env 5 / account-provider-state 1 /
config-schema 1）。

工具核对：

- `pnpm architecture:context shared` → `owner: unassigned / managed: false / requires: none`
  （与 shared-01 结论一致：该模块无受控契约，核对以 `architecture:check` 全量 0 违规 +
  静态扫描为准）。
- `pnpm dep:refs --list-exports packages/shared/src/uuid.ts` → 2 个导出
  （`uuidv7`、`createUuid`），与 `interface-appendix.json` 一致；未出现 OOM，
  无需启用 dynamic-workflow-01 的降级口径（语法级扫描 + 逐文件 list-exports 仍是本包
  callers/interface 的生成方式，与 shared-01 同口径）。

## 2. 旧门（`scripts/contract-gate.mjs`）

命令（仓库根，Node 24.14.0）：

```powershell
node scripts/contract-gate.mjs --contract specs/contracts/shared-02 --tests "*.test.mjs" `
  --dist-env KNORVIA_SHARED_02_ENTRY=dist `
  --stub-root specs/contracts/shared-02/stubs --stub-targets specs/contracts/shared-02/stubs/targets.txt
```

| 入口/验证                                                           | tests | pass | fail | 结论                                 |
| ------------------------------------------------------------------- | ----: | ---: | ---: | ------------------------------------ |
| 源码（`src`，`--import tsx`）                                       |    81 |   81 |    0 | 通过                                 |
| dist（`KNORVIA_SHARED_02_ENTRY=dist`，先 `tsc -b packages/shared`） |    81 |   81 |    0 | 通过                                 |
| 桩替换（58 个模块路径，import 即抛 `not implemented: shared-02`）   |     8 |    0 |    8 | `allFail=true`：测试确实测到公开行为 |

- 预登记差异：**无**（81/81 全过，没有放宽或跳过的断言）。
- 运行基线：`gate-old.json` 的 `commit` = `2bfceaf1`（合同分支合入最新 main
  `7d280b0e` 后的合并提交；58 个合同文件与 `origin/main` 逐字节一致，
  `scope-files.json` 的 sha256 可复核）。
- 完整报告见 [`gate-old.json`](gate-old.json)（含两入口输出尾部与桩替换输出尾部）。
- 录制口径：金样全部由旧实现录制（临时脚本 `.scratch-exec4/s02-record-fixtures.mjs`，
  按 Lead 的临时脚本口径留在执行工作区，不入库）；`constants-snapshot.json`、
  `test-ids-snapshot.json`、`old-write/*` 均为旧实现导出值/规范化结果直接落盘，
  全部为合成数据，无凭据、无真实用户数据、无内部地址。

## 3. 门禁（本机 Node 24.14.0 + pnpm 10.33.2，工作树 `wt/exec-4-s02`）

| 检查                                          | 结果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/check-workspace-freshness.mjs`  | 0（基线新鲜）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pnpm fmt` / `pnpm fmt:check`                 | 0 / 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm lint`                                   | 0（0 error；本合同文件 0 warning；warning 均为仓库存量）                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `pnpm typecheck`（含 `i18n:check`）           | 0（5573 对键一致）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `pnpm architecture:check`                     | 0（violations 0 / baseline 0 / new 0）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm build:cli-packages`                     | 15/15 tasks 成功（`@knorvia/cua-plugin` 驱动下载步骤用 `KNORVIA_CUA_DRIVER_ARCHIVE` 指向本机已校验的 `cua-driver-rs-0.30.1-windows-x86_64-binary.zip` 离线暂存，同 GATE-PLAYBOOK L 节口径，不改构建代码）                                                                                                                                                                                                                                                                                                                       |
| `pnpm test:studio`                            | 9147 例：**9133 过 / 9 失败 / 5 跳过**。9 个失败**全部是 main 既有本机环境问题**：7 个 `apps/cli/packages/core/test/causality-*`（turbo 缓存命中未生成 `libs.generated.ts`，`ERR_MODULE_NOT_FOUND`，与 shared-01 acceptance 记录同因）、`packages/desktop/test/official-plugin-staging.test.mjs`（同 shared-01 记录）、`packages/services/test/studio-workspace-runtime-health.test.ts`（32s 健康时序用例，隔离复跑同样失败，不依赖本包任何文件）。**本包 8 个契约测试文件 81 例在该全量运行中全过**（`--list` 与日志均可核对） |
| `pnpm knip`                                   | 1 —— **main 上同样失败**。合入最新 main `7d280b0e` 后同口径：`Unused files (296)`、`Unlisted dependencies (61)`，与 main 基线一致，**shared-02 贡献 0 条**（3 个机器生成器按 shared-01 先例留在执行工作区不入库）                                                                                                                                                                                                                                                                                                               |
| `pnpm provenance:report` / `provenance:check` | 登记后为 0 / 0（登记是收尾最后一步，见 GATE-PLAYBOOK L 节坑 2）                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## 4. 残留删除验证（合同前，提交 `19230bae`）

- `coding-plan-reset.ts`：9 个类型导出全仓零消费者（脚本穷举，排除自身与 barrel）。
- `coding-plan-subscription.ts`：68 个导出仅 `ForceUpdateConfig` 被 `forceUpdate.ts`
  以 type-only 引用；迁入 `forceUpdate.ts` 后 barrel 导出面不变。
- 删除后：`pnpm typecheck` 0；`pnpm lint` 0 error；
  `packages/shared` 包内 789 例测试全过（`--import tsx` 档）；
  现有 `packages/shared/test/shared-error-version-config-digest-boundaries.test.mjs`
  与 `shared-settings-family-order-boundaries.test.mjs`（消费 forceUpdate 与
  BUILTIN_MODEL_PROVIDER_IDS）不受影响。

## 5. 未覆盖项（替换阶段自查）

1. **纯类型导出（456 项）**：`type`/`interface` 无运行时值，B49/B50 只核对运行时导出
   名集合；类型内部结构靠 `pnpm typecheck` 与替换阶段的导出比对脚本守住。
2. **`index.ts` 桶文件本身**：不属本包（shared-04 重写）；本包只冻结「导出经 barrel
   可达」（B49）。桶的 re-export 顺序/分组可变。
3. **跨包消费的具体形态**：1,157 个根 barrel 调用方只按文件名记录，未逐符号核对
   （符号面由 B49 的 719 个运行时导出逐名断言覆盖）。
4. **`protocol/index.ts`（旧协议面）**：不在本包（它 import 本包的
   `integratedTerminalShellSelectionSchema` 与 `accountProviderUnavailableReasonSchema`，
   两个导出的模块路径面由 B51 守住）。
5. **macOS**：未实机验证（本包为纯逻辑/常量，无平台 IO；Windows 与 Linux 由 CI 双平台
   覆盖，按计划书平台口径如实标注）。

## 6. 与计划书红线的对照

- 未复制、未改名照搬、未逐行改写任何旧实现：本 PR 只新增 `specs/contracts/shared-02/`
  下的合同产物 + 一次残留删除提交（选择 3）。
- 未放宽任何断言、无 skip、无 todo；桩替换 58 目标 → 8/8 测试文件全失败证明测试有效
  （`gate-old.json`）。
- 不改用户数据格式、协议字段、`KNORVIA_` 环境变量与 `.knorvia-studio` 数据目录
  （`known-differences.md` 第 4 节逐字清单；测试 B7/B19/B24/B47/B48 全表快照断言）。
- 金样按旧实现录制，录制口径未因新写法调整；夹具全部为合成数据。
- 无时序类断言需要事件序列（本包全同步纯函数，唯一模块级状态 B10 用捕获/复位对断言）；
  测试文件不含任何 `setTimeout`/sleep/等待循环。
- 存储/配置类往返：B45 做了「旧写 → 新读 → 新写 → 旧读」四步断言
  （`fixtures/old-write/app-settings.*` 金样）。
