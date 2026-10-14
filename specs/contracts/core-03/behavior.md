# core-03 行为规格（v1）

范围：`apps/cli/packages/core/src/workflow/**`、`src/index.ts`、`src/telemetry/**`（35 个继承文件）。
编号发布后不重用；每条行为都指到契约测试用例（`tests/*.test.ts`）与黑盒入口。

## 区域桶（黑盒入口）

| 区域          | 入口                                              | 说明                                                   |
| ------------- | ------------------------------------------------- | ------------------------------------------------------ |
| 工作流根      | `src/index.ts`                                    | 包根；`import` 得 190 个具名导出（tsx 源码入口可加载） |
| 专家工作流    | `workflow/expert.ts`                              | 工厂/运行时/格式化器 + 21 个类型                       |
| 图调度        | `workflow/scheduler.ts`                           | `WorkflowGraphScheduler` 类 + 调度事件/类型            |
| 生命周期/定义 | `workflow/lifecycle.ts`、`workflow/definition.ts` | 快照就绪重构、内置专家工作流定义                       |
| 遥测          | `telemetry/runtime-telemetry.ts`                  | 单一模块（无桶）                                       |

## 行为条目

**B1 调度循环：完成** —— `WorkflowGraphScheduler.run` 在「所有可执行节点完成且无活动节点」时返回 `{status:"completed", reason:"completed"}`，并在返回前发出 `executor_completed` 事件（含 `phase`）。
**B2 调度循环：恢复修复** —— 运行前对快照做 `reconcileWorkflowSnapshotForResume`；若修复导致快照变化，先 `writeSnapshot` 落盘再进入循环（`resetPhases:false`，`timestamp` 取自事件日志时钟）。
**B3 调度循环：并发上限** —— 每次分派不超过 `snapshot.strategy.executor.maxConcurrentLoops`（下界 1）个节点；已活动节点不会重复分派。
**B4 调度循环：错误阈值** —— 连续节点失败达到 `maxConsecutiveErrors`（下界 1）时，等待所有活动节点结束、清空活动表，发出 `executor_paused`（`payload.consecutiveErrors`）并返回 `{status:"paused", reason:"error_threshold"}`；任一成功把连续失败计数归零。
**B5 调度循环：死锁** —— 无可分派节点且无活动节点（仍有未完成的可执行节点）时发出 `executor_paused`（`payload.blockedNodes`）并返回 `{status:"paused", reason:"deadlock"}`。
**B6 调度循环：前沿事件** —— 就绪/活动/阻塞集合的变化以 `JSON.stringify({activeNodeIds, blockedNodes, readyNodeIds})` 作键去重；键变化才发 `frontier_changed`；集合规划器实际运行时重置该键以强制重发。
**B7 调度循环：取消** —— `abortSignal` 已中止时抛错：`signal.reason` 为 `Error` 时原样抛出，否则抛 `Error("Workflow scheduler aborted")`。
**B8 事件日志** —— `WorkflowSchedulerEventLog` 统一发出调度事件（`executor_completed`/`executor_paused`/`frontier_changed`/集合事件等），事件带 `phase`/`message`/可选 `payload`，并在 `signal` 中止时停止写事件。
**B9 集合规划** —— `checkCollectionPlanners` 按集合阶段与前沿决定是否运行规划器；规划器新增的节点并入可执行集合（`plannersRan`>0 时重置前沿键）；集合图更新走 `graph-helpers.ts`（`collectionFrontier`/`collectionNodeIdsForGraph`/`graphCollections`/`isCollectionInPhase`/`nodeById`/`updateGraphCollection`）。
**B10 节点执行** —— `runWorkflowNode` 执行单个节点并返回 `{nodeId, ok, snapshot}`；`started` 是「已接受并写好快照」的等待点；活动表按 `nodeId` 去重。
**B11 专家工作流命令** —— `WorkflowRuntime`/`ExpertWorkflowRuntime` 暴露 run/list/lookup/retry/events 命令；`WorkflowCommandResult`/`ExpertWorkflowCommandResult` 为返回形态；未知工作流查不到时返回对应的失败结果而不是抛错。
**B12 专家阶段与循环** —— 阶段执行（`phase-runner.ts`）→ 顾问/批评回路（`critic-loop.ts`）→ 重试状态（`retry-state.ts`）与失败归类（`failures.ts`）；达到上限进入失败态并可由 retry 命令重新排期。
**B13 子会话事件** —— 专家运行器通过 `WorkflowGraphSchedulerChildSessionStartedEvent`/`ExpertWorkflowChildSessionStartedEvent` 上报子会话启动，事件必须携带可关联的 id（活动 id 由注入的 `createActivityId` 生成）。
**B14 解析器** —— `expert/parsers/*`：规划器结果、批评输出、图种子与节点提示词一律「先解析、失败给结构化原因」，不把解析失败伪装成空结果；JSON 解析器只接受对象/数组等声明形态。
**B15 内置定义** —— `definition.ts` 提供 `BUILT_IN_EXPERT_WORKFLOW_KIND`/`BUILT_IN_EXPERT_WORKFLOW_DEFINITION_ID`/`BUILT_IN_EXPERT_WORKFLOW_DEFINITION_VERSION` 与 `createExpertWorkflowDefinition`；默认策略常量 `DEFAULT_EXPERT_WORKFLOW_STRATEGY`（阶段、执行器上限、图种子）。
**B16 状态派生只读** —— `deriveWorkflowRunSchedulerState`/`deriveWorkflowSchedulerState` 从 `@knorvia/contracts` 再导出（本包不重新实现）；派生结果不得反向写回快照。
**B17 遥测** —— `telemetry/runtime-telemetry.ts` 只做本地运行时观测：字段为短摘要与稳定 reason，不写入命令正文、脚本内容或真实路径。
**B18 包根导出面** —— `src/index.ts` 的具名导出集合是兼容面（190 个）；类型必须用 `export type` 再导出（历史缺陷：`ToolExecutor`/`ToolRegistry` 曾被当作值导出，导致 tsx 源码入口加载包根失败，见 `known-differences.md`）。
**B19 模块边界** —— `src/index.ts` 的 `export *` 指向 agent/context/compact/hooks/mcp/plugin-reference/subagent/runtime-task 等**别包区域**，本包不修改其实现；`workflow/**` 与 `telemetry/**` 的内部实现可自由拆分，但**模块路径与导出名不可变**（`interface.md` 固化）。

## 验收场景（每条行为至少一个用例）

| 编号 | 场景                                 | 断言要点                                                |
| ---- | ------------------------------------ | ------------------------------------------------------- |
| B1   | 两个节点、无依赖                     | 返回 `completed`；收到 `executor_completed`             |
| B2   | 快照含「已中断的活动节点」           | 修复后 `writeSnapshot` 被调用一次；`resetPhases:false`  |
| B3   | 5 个就绪节点、`maxConcurrentLoops=2` | 同时活动 ≤2；5 个都执行完                               |
| B4   | 连续 2 次失败、阈值 2                | 返回 `error_threshold`；`payload.consecutiveErrors===2` |
| B5   | 依赖成环                             | 返回 `deadlock`；`payload.blockedNodes` 非空            |
| B6   | 就绪集合不变                         | `frontier_changed` 只发一次；规划器运行后再次发送       |
| B7   | 运行中 abort                         | 抛出的错误等于 `signal.reason`（或兜底文案）            |
| B8   | 事件订阅                             | 事件顺序与 `phase` 字段正确；中止后不再发事件           |
| B9   | 集合阶段未满足                       | 规划器不运行；满足后新增节点进入可执行集合              |
| B10  | 节点抛错                             | outcome `ok:false`；错误计入连续失败                    |
| B11  | list/lookup 未知名                   | 返回失败结果，不抛异常                                  |
| B12  | 批评回路达上限                       | 进入失败态；retry 后可再次运行                          |
| B13  | 子会话启动                           | 事件携带活动 id 且与快照节点对应                        |
| B14  | 非法 JSON/缺失字段                   | 返回结构化失败原因，不产生空对象                        |
| B15  | 内置定义                             | kind/id/version 常量稳定；策略字段齐全                  |
| B16  | 派生状态                             | 与 contracts 实现一致；快照未被修改                     |
| B17  | 遥测字段                             | 不含命令正文/路径；reason 稳定                          |
| B18  | 包根 import                          | tsx 源码入口下可加载，导出数 ≥190                       |
| B19  | 导出面                               | `interface.md` 列出的模块路径均存在，导出名可达         |
