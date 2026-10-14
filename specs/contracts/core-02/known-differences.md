# core-02 与旧实现的已知差异（合同阶段）

合同阶段**不改任何产品源码**，只新增合同产物；本文件记录"新旧实现之间被允许的差异"与"必须逐字保留的部分"。

## 1. 不在本包的模块

| 模块                                                                                                      | 现状                                       | 说明                                                                                          |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 包根 `src/index.ts`                                                                                       | 属 core-03                                 | 本包不冻结包根入口                                                                            |
| `workflow/**`、`agent/**`、`compact/**`、`context/**`、`embedded-search/**`、`mcp/**`、`hooks/**`         | 属 core-03 / core-01 / 试点 1              | 各自合同负责                                                                                  |
| `tool/**`、`runtime/**`、`browser-client/**`、`errors/**`、`repl/**`                                      | 各自的包或已登记 `independent-replacement` | 不动                                                                                          |
| `permission` 9 个、`runtime-task` 2 个、`session-context` 1 个已登记 `independent-replacement`/`original` | 不替换                                     | 其中 `runtime-task/registry-waits.ts` 已按 M0-8 口径登记为 `original`（max containment 0.06） |

## 2. 替换阶段允许改变的部分

- 模块内部组织方式（拆分、命名、常量表、谓词实现）。
- 注释、日志文案、内部错误消息（**例外**：B7/B8/B12 中模型可见的提醒与通知文案、以及 `interface.md` 冻结的常量取值不得改变）。
- 导出名与签名不得改变；行为按本合同 B1–B12 的断言保持等价。

## 3. 待替换阶段验证的项

- `subagent/runner-*` 系列（9 个模块、约 1,300 行）的内部状态机：合同通过 `interface.md` 冻结签名 + B12 覆盖消息投递与完成通知；运行器内部事件序列属替换阶段的自查项（与 core-01 的 agent 区交互，边界按目录划分）。
- `subagent/profile-frontmatter.ts` 的 frontmatter 解析细节（与 `@knorvia/shared` 的 codec 一致性）。
- `memory/recall/manifest.ts` 的目录扫描细节（依赖 `FileSystemPort`，合同只冻结签名与返回形状）。
- `runtime-task/notification.ts` 的通知文案模板（B8 断言转义与截断，逐字段文案属可改的"日志文案"范畴，但 XML 转义与截断界不可改）。

## 4. 包根入口的已知限制（与合同测试入口有关）

`apps/cli/packages/core/src/index.ts:21` 把**类型** `ToolExecutor` 当值再导出，导致 tsx 源码入口下包根不可加载；合同测试因此只经**区域桶与模块入口**加载（`tests/entry.mjs`）。这不是本包的差异，而是记录测试入口的取法。
