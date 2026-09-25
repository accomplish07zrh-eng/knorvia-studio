# 受限电脑控制（T12）交付报告

本报告记录 T12「受限 Computer Use 契约」交付了什么、真实执行了什么、**明确没有做也没有验证**什么，
以及如何回滚。契约本身在 [受限电脑控制契约](../specs/knorvia-cua-restricted.md)。

## 基线与一句话结论

- 仓库：`knorvia-studio`，版本 `0.8.0-preview.2`，任务给定基线提交 **`6ee777d`**
  （`feat: 创作参数复用、来源关系与远端核验界面（T09 UI）`）。
  本次执行期间 Lead 又提交了一条文档提交，执行完成时 HEAD 为 **`03c661e`**（`6ee777d` 的子提交）。
- 环境：Windows，Node **v26.3.0**，pnpm **10.33.2**（`mise.toml` 期望 Node 24.14.0，pnpm 给出 engine 警告，
  不影响本波纯 Node 测试与类型检查结果）。
- **一句话结论：本波交付的是「受限契约 + fail-closed 门禁 + 默认关闭的实验开关」，
  不是可用的电脑控制。本构建依然无法观察任何东西，也发不出任何动作。**

## 交付物

| 文件                                                                     | 作用                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `specs/knorvia-cua-restricted.md`                                        | 观察契约、动作与窗口规则、过期拒绝、停止优先、结果未知、所有权、能力现状 |
| `packages/cua/restricted-gate.js` / `.d.ts`                              | 纯函数门禁、结果分类、停止控制器；**不新增任何「可用」导出**             |
| `packages/cua/package.json`                                              | 新增 `./restricted-gate` 导出映射                                        |
| `packages/services/src/cua-permission-broker/cuaRestrictedGateWiring.ts` | 读取既有装配**自身暴露的**可用性事实并交给门禁；转发停止控制器           |
| `packages/services/src/cua-permission-broker/index.ts`                   | 导出上面的接线                                                           |
| `packages/ui/src/settings/cuaRestrictedExperiment.ts`                    | 实验开关纯逻辑（默认关闭、副作用清单、停止顺序文案 id）                  |
| `packages/ui/src/settings/ComputerUseSection.tsx`                        | 在既有「电脑控制」分区加默认关闭的实验开关 + 诚实状态 + 停止顺序说明     |
| `packages/ui/test/cua-restricted-experiment.test.ts`                     | 开关默认关闭、打开不产生任何副作用                                       |
| `packages/services/test/cuaRestrictedGate.test.ts`                       | 门禁拒绝矩阵、停止优先、结果未知不重放、运行时接线恒拒绝                 |

门禁输入：Driver/Helper 可用性、观察记录、权限模式、目标窗口、run/turn 标识。
拒绝原因码（机器可读）：`experiment_disabled`、`run_stopped`、`action_not_allowed`、
`driver_unavailable`、`helper_unavailable`、`permission_insufficient`、`foreground_not_approved`、
`observation_missing`、`observation_invalid`、`observation_expired`、`observation_stale_version`、
`observation_scope_mismatch`、`target_window_mismatch`。

## 真实命令与结果

全部在仓库根目录执行。

| 命令                                                                                                               | 结果                                         |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `node --experimental-test-module-mocks --import tsx --test packages/services/test/cuaRestrictedGate.test.ts`       | **9/9 通过**                                 |
| `node --experimental-test-module-mocks --import tsx --test packages/ui/test/cua-restricted-experiment.test.ts`     | **4/4 通过**                                 |
| 一次跑 6 个测试文件（本波 3 个 + `plugin-settings-visibility` + `plugin-skill-packs` + `knorviaStorageIsolation`） | **44/44 通过，0 失败**                       |
| `pnpm i18n:check`                                                                                                  | `[i18n] en-US and zh-CN: 5415 matching keys` |
| `pnpm exec tsc -b packages/ui packages/services`                                                                   | 通过（无输出）                               |
| `pnpm typecheck`                                                                                                   | 退出码 0                                     |
| `pnpm lint`                                                                                                        | `Found 0 warnings and 0 errors`              |
| `node scripts/architecture/architecture-check.mjs check`                                                           | `architecture: OK / violations: 0`           |
| `pnpm exec oxfmt <19 个改动文件>` 后 `--check`                                                                     | `All matched files use the correct format`   |

关于题面里的 `pnpm exec tsc -b packages/ui packages/services packages/cua`：**`packages/cua` 没有 tsconfig**
（纯手写 `.js` + `.d.ts`，无 build/typecheck 脚本），`tsc -b packages/cua` 无工程可构建。
该包的类型面由 `packages/services` 通过 `.d.ts` 消费，`tsc -b packages/services` 通过即代表
`restricted-gate.d.ts` 与 `broker-server.d.ts` 均被正确解析。

`knorviaStorageIsolation.test.ts` 与 `plugin-settings-visibility.test.ts`、`plugin-skill-packs.test.ts`
在本波未改动，作为回归对照一起执行并通过。

## 明确**没有**做、也**无法**验证的事项

1. **Windows 上没有可启动的 Helper 或 Driver。** `createProductCuaHelperHost()` 返回的 host
   `running === false`、`socketPath === null`，`start`/`restart`/`checkHealth` 全部 reject；
   `launchStandaloneCuaHelperForStatus` 仅 darwin。本波**没有**启动、安装或验证任何 Helper/Driver 进程。
2. **没有观察路径。** `probeHelperHealth` 只返回 null；`isScreenCaptureProbeSuccess` 恒为 `false`；
   PiP 客户端被禁用。本波没有采集过任何屏幕内容、无障碍树或窗口状态。
3. **没有真实点击、输入或任何桌面动作。** `callBrokerMethod` / `dispatchRequest` 直接抛错；
   `isReadOnlyBrokerMethod` **仍是硬编码 `false`**，本波没有放宽它，也没有新增任何被视为只读可用的方法。
4. **没有真实模型决策。** 没有调用模型，也没有验证模型如何选择动作或如何遵守窗口/观察约束。
5. **没有按内核的运行时验证。** 没有在 Knorvia 或任何外部内核上验证过受限通道。
6. **停止规则只由纯逻辑覆盖。** 「已派发但未确认的动作」这条路径无法在本产生真实结果，
   只由 `classifyCuaRestrictedOutcome` / `shouldAutoReplayCuaRestrictedOutcome` 的单元测试覆盖；
   测试证明的是**判定逻辑**，不是真实撤销或真实终态读取。
7. **「允许」分支不代表能力。** 门禁测试里唯一放行的用例由夹具提供「可用 Driver/Helper + 新鲜观察」，
   目的是证明判定不是恒假谓词；真实运行时读到的可用性恒为不可用，因此真实请求全部被拒绝。
8. **实验开关没有持久化，也没有端到端验证。** 开关是会话内 `useState`，不写入任何设置项
   （没有可用的设置 schema 写入范围），刷新即回到关闭；UI 渲染层同样没有 DOM harness 覆盖。
9. **没有真实操作系统权限弹窗/网络请求的观测**：本波没有触发它们，因此只能说「实现上不做」，
   没有运行时证据。

## 回滚

本波不改任何持久状态、不迁移数据、不修改既有导出语义，回滚按文件粒度即可：

1. 删除新增文件：`specs/knorvia-cua-restricted.md`、`packages/cua/restricted-gate.js`、
   `packages/cua/restricted-gate.d.ts`、`packages/services/src/cua-permission-broker/cuaRestrictedGateWiring.ts`、
   `packages/ui/src/settings/cuaRestrictedExperiment.ts`、`packages/services/test/cuaRestrictedGate.test.ts`、
   `packages/ui/test/cua-restricted-experiment.test.ts`、本文件。
2. 还原 `packages/cua/package.json`（移除 `./restricted-gate` 导出）、
   `packages/services/src/cua-permission-broker/index.ts`（移除三处 re-export）、
   `packages/ui/src/settings/ComputerUseSection.tsx`（移除实验卡片与相关 import / state 推导）、
   `packages/ui/src/i18n/locales/{zh-CN,en-US}.ts`（删除 `settings.computerUse.restricted.*` 键）。
3. 回滚后 `pnpm typecheck` / `pnpm lint` / `pnpm test:studio` 应回到本波之前的绿状态；
   由于没有触碰 kernel、creation、workflow、run-history、studio-runtime 文件，无需额外数据修复。
