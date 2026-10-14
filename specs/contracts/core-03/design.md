# core-03 设计（替换实现，合同 v1）

## 1. 目标与约束

在**不改变** `interface.md` 固化的模块路径 × 导出名（255 值 / 54 类型）与 `known-differences.md` §5「不可变兼容面」的前提下，用本仓库自己的实现替换 35 个继承文件。

- 黑盒入口：包根 `src/index.ts`（190 具名导出，tsx 源码入口与 dist 入口都可加载）。
- 相似度口径：实现文件按**普通模式**；仅「导出声明占主体」的文件（典型为 `workflow/expert/types.ts`、`workflow/scheduler/types.ts`）用 `--declaration --interface specs/contracts/core-03/interface.md`。
- 旧门：源码 + dist 双入口全过；**桩替换全失败**（证明测试确实覆盖实现）。

## 2. 区域划分与状态所有者

| 区域                                                                        | 状态所有者                                | 说明                                                                                                                                          |
| --------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 图调度循环（`workflow/scheduler.ts`）                                       | `WorkflowGraphScheduler` 实例             | 活动节点表 `Map<nodeId, promise>`、`consecutiveErrors`、`frontierKey` 都是**循环局部状态**；快照经注入的 `getSnapshot`/`setSnapshot` 单一读写 |
| 事件日志（`workflow/scheduler/events.ts`）                                  | `WorkflowSchedulerEventLog`               | 唯一的事件发出点与时钟来源（`timestamp()`）；中止后不再发事件                                                                                 |
| 节点执行（`workflow/scheduler/node-runner.ts`）                             | `runWorkflowNode`                         | 每次调用只负责一个节点；`started` 是「已接受 + 快照已写」的等待点                                                                             |
| 集合规划（`workflow/scheduler/collection-planner*.ts`、`graph-helpers.ts`） | `checkCollectionPlanners`                 | 集合前沿/阶段判定与图更新；新增节点并回可执行集合                                                                                             |
| 专家工作流（`workflow/expert/**`）                                          | `WorkflowRuntime`/`ExpertWorkflowRuntime` | run/list/lookup/retry/events 命令；阶段执行 → 批评回路 → 重试状态                                                                             |
| 定义与生命周期（`workflow/definition.ts`、`lifecycle*.ts`）                 | 常量 + 纯函数                             | 内置定义常量与快照恢复修复（纯函数，返回新快照 + `changed`）                                                                                  |
| 遥测（`telemetry/runtime-telemetry.ts`）                                    | 纯函数                                    | 只做本地观测，字段为短摘要与稳定 reason                                                                                                       |

**事件顺序**（替换实现必须保持）：
`reconcileWorkflowSnapshotForResume` →（变化则 `writeSnapshot`）→ 循环 { `checkCollectionPlanners` → `frontier_changed`（键变化时）→ 完成判定 → 错误阈值判定 → 按 `maxConcurrentLoops` 分派 → `Promise.race` 收一个 → } → `executor_completed` / `executor_paused`。

## 3. 替换策略（阶段 A 准备）

1. **声明集中**：把兼容声明（`Admission`、`WorkflowGraphScheduler*` 类型、`WorkflowCommandResult` 等）集中到声明模块，实现模块只引用类型 —— 与 core-hooks 试点相同的做法（避免实现文件按普通模式计分时被兼容声明拉高包含率）。
2. **控制流换型**：调度循环用「条件表 + 显式阶段枚举」替代长 `if` 链；节点结果与失败归类用 Map/表驱动；解析器用「解析 → 校验 → 结构化失败」管线。
3. **命名与文案**：模块内部标识符、注释、日志与错误文案全部重写（不得沿用上游文本）；对外事件名、payload 字段、返回形态保持不变。
4. **死代码**：删除 `workflow/scheduler/collection-planner-admission.ts`（`known-differences.md` §4），并重生成其相关哈希基线。
5. **模块切分自由度**：内部实现可按高内聚拆分（单文件 ≤400 行约束），但**公开路径与名字不变**；拆分后需复跑 `interface.md` 对照与旧门。

## 4. 测试策略

- 契约测试按 `behavior.md` 的 B1–B19（每条至少一个用例），黑盒经包根加载（源码 / dist 双入口）。
- 关键失败路径必须覆盖：错误阈值暂停、死锁暂停、取消（`signal.reason` 语义）、解析器结构化失败、未知工作流查找失败。
- 桩替换：把 35 个目标文件换成「一行抛错」的桩后，契约测试必须**全部失败**（0/33 之类），以证明测试不是空转。

## 5. 交付与验收

- 替换 PR 描述引用本文件与 `acceptance.md`；验收文档逐文件列出「计分模式 / 总行数 / 剔除行数 / 残留行数 / 两道值」。
- 本包不含 `src/environment.ts` / `src/output.ts` / `src/runtime.ts`（后续包），也不含 `subagent`/`system-reminder` 等区域。
