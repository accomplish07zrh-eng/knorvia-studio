# shared-03 合同（`packages/shared/src` 继承剩余 · 34 个）

**合同版本：v1**（八件套齐、旧门三绿，见 [acceptance.md](acceptance.md)）

本目录是 M3 `shared-03` 的**兼容合同**：先冻结公开行为与签名，再按合同独立实现（替换阶段见计划书「每包流程」四、五）。

- 分支：`contract/shared-03`（基线 `d3508522`，工作树 `wt/exec-4-s02`）；认领 issue：**#177**
- 依据：《Knorvia 独立替换任务计划书》「每包流程」一～三、M1 切包规则（运行时为主 ≤35–40 / 类型重 ≤60）
- 前包边界：`shared-01`（node/、protocol-v4/）与 `shared-02`（其余 58 件）已合并（PR #152/#160、#173）；
  `index.ts` 根桶按先例归 **shared-04 末包**

## 一、选包实测（2026-10-15）

### 1. 口径与池子

`licensing/current-files.json` 分类是历史账（就地重写不翻类、翻转靠 review 登记，M6 统一收口）；
已替换面按各包 `scope-files.json` 排除。计算式：

```
packages/shared/src 全部 233（origin/main 口径）
− unreviewed 51（不在选包口径，等 M0-2/M0-3 复核）
− shared-01/02 已替换 104（含 node/**、protocol-v4/** 与 shared-02 的 58 件与其新域件）
− index.ts（shared-04 末包）
= 候选池 78
```

78 > 60 → 切两包（M1 规则）：**shared-03 = 34 件（运行时为主）**；shared-04 = 44 件 + index.ts（类型重）。

### 2. 三模式扫描

| 扫描                           | 结论                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm knip`（条目级）          | 范围内唯一命中 `task-realtime-core.ts` 的 `taskStreamMirrorTargetSchema`/`taskRunLeaseTargetSchema`；`dep:refs` + 全仓 grep 核实 `validation.ts` 实际消费 → **误报不删**（knip 存量条目与 main 一致）                    |
| `pnpm dep:refs --list-exports` | 抽样 `task-realtime-core.ts` 18 导出与附录口径一致；无无引用导出                                                                                                                                                         |
| 静态 import 调用面             | 范围内 73 处 import；重消费方：`apps/cli/packages/core/src/runtime/**`（execution-state 等）、`packages/ui/src/workspace-file-search/**`、`packages/services/src/file/**`、`protocol/`、`protocol-v4/` 桶、`index.ts` 桶 |

**无用代码结论**：本包无删除提交（knip 命中为误报）。

### 3. shared-03 分簇（依赖叶子先行）

| 簇                                     | 文件                                                                                                                                                                                           | 内部边                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| H1 workspace-hook                      | `workspace-hook-config`、`workspace-hook-digest`、`workspace-hook-discovery`、`workspace-hook-mutation`、`workspace-hook-review-monotonicity`、`workspace-hook-trust-store-file`               | config ← digest ← discovery/mutation |
| H2 background-task                     | `background-task-controls`、`background-task-notifications`、`background-task-control-merge`、`background-bash-jobs`、`background-bash-output`、`bash-output-display`                          | controls ← jobs/control-merge        |
| H3 conversation/assistant              | `conversation-message-projection-policy`、`conversation-preview-artifacts`、`conversation-share`、`assistant-message-parts`、`assistant-presentation`                                          | message-parts ← presentation         |
| H4 workspaceFile                       | `workspaceFileEntriesCodec`、`workspaceFileSearch`、`workspaceSessionRestore`                                                                                                                  | —                                    |
| H5 tool/execution                      | `tool-call-summary`、`tool-identity`、`tool-plan-adapter`、`streaming-tool-input-preview`、`execution-output-preview`、`execution-state`、`permission-request-preview`、`runtime-tool-runtime` | —                                    |
| H6 process/subagent/task-realtime-core | `process-diagnostic`、`process-names`、`processResourceTelemetry`、`subagent-markdown-selection`、`subagent-state-migration`、`task-realtime-core`                                             | markdown-selection ← state-migration |

池内内部依赖边共 14 条（实测），无跨簇环。

## 二、兼容面（公开入口）

全部 34 个模块路径经根 barrel `@knorvia/shared`（`index.ts`，不在本包）与既有子路径可达；
逐文件导出清单（机器生成）见 `interface-appendix.md` / `interface-appendix.json`（待补）。

## 三、完成度（如实）

| 步骤                                          | 状态                                                     |
| --------------------------------------------- | -------------------------------------------------------- |
| 选包实测（分类 + 三模式扫描 + 分簇）          | ✅ 本文档 §一                                            |
| `behavior.md`（B 条目九项）                   | ✅ B1–B43 六簇                                           |
| `interface.md` + 导出附录                     | ✅ 195 运行时/90 纯类型（机器生成）                      |
| `callers.md`                                  | ✅ 73 import / 68 真实调用                               |
| `tests/`（黑盒契约，两入口）                  | ✅ 8 文件 47 断言，两入口 47/47                          |
| `fixtures/`（金样四组）                       | ✅ 旧实现录制（codec 往返/hook 摘要/gate 握手/分享往返） |
| `stubs/`（34 目标）                           | ✅ import 即抛，桩替换 8 文件全失败                      |
| `known-differences.md`、`acceptance.md`       | ✅ 红线清单 + 旧门实测                                   |
| 旧门 `gate-old.json`（两入口全过 + 桩全失败） | ✅ 47/47×2 + allFail=true                                |
| PR `contract: shared-03 v1`                   | ⬜                                                       |

**红线**：协议常量/字段/数据格式一字不改；金样按旧实现录制；不改测试断言口径迁就新写法；SPDX 头。
