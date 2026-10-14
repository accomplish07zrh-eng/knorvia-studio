# core-03 已知差异与保留约束（v1）

## 1. 源码入口（tsx）下包根不可加载 —— 已在本包修复

**症状**：`import("…/apps/cli/packages/core/src/index.ts")` 抛
`SyntaxError: The requested module './tool/executor.js' does not provide an export named 'ToolExecutor'`。
core-01/core-02 的 `known-differences.md` 已记录该问题并把它留给 core-03；两包的契约测试因此改用**区域桶**做黑盒入口。

**根因**：`src/index.ts` 把**类型**当**值**再导出：

- `export { createToolExecutor, ToolExecutor, ToolExecutorImpl } from "./tool/executor.js";`
  —— `tool/executor.ts` 里 `ToolExecutor` 是 `export type { ToolExecutor } from "./executor/types.js"`；
- 同类问题还有一处（core-01/02 未记录）：`export { createToolRegistry, ToolRegistry, ToolRegistryImpl } from "./tool/registry.js";`

**修法**（本包范围，`src/index.ts`）：

```ts
export { createToolExecutor, ToolExecutorImpl } from "./tool/executor.js";
export type { ToolExecutor } from "./tool/executor.js";
export { createToolRegistry, ToolRegistryImpl } from "./tool/registry.js";
export type { ToolRegistry } from "./tool/registry.js";
```

**验证**：tsx 源码入口下 `import` 包根成功，得到 **190 个具名导出**（修复前直接抛错）。
**影响**：core-03 的契约测试用**包根**做黑盒入口（覆盖全部区域）；core-01/02 若愿意也可改用包根，不再需要区域桶。

**发现手法（可复用）**：把 `src/index.ts` 的每条 `export { … } from "./m.js"` 与**已构建的 `dist/m.js` 运行时导出**对照，`dist` 里不存在的名字即「被当值导出的类型」。

## 2. 边界裁定：3 个根文件不属本包

| 文件                 | 归属                                                      |
| -------------------- | --------------------------------------------------------- |
| `src/environment.ts` | 后续包（`core-04` 或 `core-runtime-*`，待计划书总表指派） |
| `src/output.ts`      | 同上                                                      |
| `src/runtime.ts`     | 同上                                                      |

本包**不碰**这 3 个文件；`interface.md` 的模块清单里也不含它们。

## 3. 非继承邻居（不改）

`workflow/scheduler/{graph.ts,node-runner-outcome.ts,ready-order.ts}` 已登记为 `original`（`independent-replacement` 范畴），**本包不修改**。注意 `graph.ts` 含 `export * from "./graph-helpers.js"`，其导出已由 `graph-helpers.ts` 承担（本包范围内）。

## 4. 死代码候选（替换阶段删除）

| 文件                                                 | 导出                                               | 证据                                                                                                                                                                                                                                                             | 处置                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow/scheduler/collection-planner-admission.ts` | `Admission`（type）、`admitCollection`（function） | ① `knip` 报 unused file；② 全仓源码中 `admitCollection` **仅出现 1 次**（自身定义）；③ 模块路径无任何源码 `import`（仅出现在 `apps/cli/packages/core/test/*.json` 的哈希基线与 `specs/contracts/contracts-01/callers.md` 的文档清单中）；④ 未被任何桶/包根再导出 | 替换阶段删除；删除时**必须**同步重生成相关哈希基线（`workflow-*-baseline/current.json`、`*-artifact-receipt-*.json`、`workflow-scheduler-state-*.json`、`workflow-planner-expansion-*.json`、`workflow-collection-planner-current.json`），并在 `acceptance.md` 记录 |

**保留（不删，附理由）**：其余 34 个继承文件 `knip` 无未使用项；`workflow/scheduler/node-runner-outcome.ts` 虽被 `knip` 报为 unused，但属 `original`（非本包范围）；经桶 / `runtime/deps.ts` 再导出的符号属**别包公开面**，本包不做导出面收缩（`dep:refs` 对包名入口有假阴性，已用入口级搜索复核）。

## 5. 必须保持不变的兼容面（替换实现时逐条遵守）

1. **模块路径与导出名**：`interface.md` 固化的 38 个模块路径 × 255 值导出 × 54 类型导出；内部实现可自由拆分，但路径/名字/种类（值 vs 类型）不可变。
2. **包根导出集合**：`src/index.ts` 的 190 个具名导出；类型必须用 `export type` 再导出（第 1 节）。
3. **调度事件名与载荷**：`executor_completed`、`executor_paused`（`payload.consecutiveErrors` / `payload.blockedNodes`）、`frontier_changed`（`payload.{activeNodeIds,blockedNodes,readyNodeIds}`）；事件去重键为 `JSON.stringify({activeNodeIds, blockedNodes, readyNodeIds})`。
4. **策略字段与下界**：`snapshot.strategy.executor.maxConcurrentLoops`、`maxConsecutiveErrors` 均以 `Math.max(1, …)` 生效。
5. **返回形态**：`{status:"completed"|"paused", reason:"completed"|"error_threshold"|"deadlock", snapshot}`。
6. **取消语义**：`signal.reason` 是 `Error` 时原样抛出，否则抛 `Error("Workflow scheduler aborted")`。
7. **只读派生**：`deriveWorkflowRunSchedulerState` / `deriveWorkflowSchedulerState` 自 `@knorvia/contracts` 再导出，本包不重新实现、不反向写回快照。
8. **跨包区域**：`src/index.ts` 对 agent/context/compact/hooks/mcp/plugin-reference/subagent/runtime-task 的 `export *` 属别包契约范围，本包不改其实现。

## 6. 已知工具口径

- 相似度门槛按计划书：运行时/实现文件用**普通模式**；仅「导出声明占主体」的文件用 `--declaration --interface`（本包预期以普通模式为主，具体清单在替换阶段确定）。
- 旧门的**桩替换全失败**证据与两入口结果记录在 `gate-old.json`；发现交叉坑（如第 1 节）时同步更新本文件。
