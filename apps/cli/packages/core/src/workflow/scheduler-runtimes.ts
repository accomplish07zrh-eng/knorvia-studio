// SPDX-License-Identifier: Apache-2.0
// 调度器端口：构造时一次性装配的运行期只读依赖，以及两个下游运行时的组装。
import type { WorkflowCollectionPlannerRuntime } from "./scheduler/collection-runtime.js";
import type { WorkflowSchedulerEventLog } from "./scheduler/events.js";
import type { WorkflowNodeRunnerRuntime } from "./scheduler/node-runner.js";
import type { WorkflowGraphSchedulerDeps } from "./scheduler/types.js";

type Deps = WorkflowGraphSchedulerDeps;

/** 调度器端口：图调度循环运行期只读的依赖集合。 */
export interface SchedulerPorts {
  createActivityId: Deps["createActivityId"];
  plannerRunner?: Deps["plannerRunner"];
  runner: Deps["runner"];
  writeArtifact: Deps["writeArtifact"];
  writeSnapshot: Deps["writeSnapshot"];
}

/** 从依赖构造端口：字段一一对应，缺省保持可选。 */
export const schedulerPorts = (deps: Deps): SchedulerPorts => ({
  createActivityId: deps.createActivityId,
  plannerRunner: deps.plannerRunner,
  runner: deps.runner,
  writeArtifact: deps.writeArtifact,
  writeSnapshot: deps.writeSnapshot,
});

/** 集合规划器运行时：共享事件日志与端口。 */
export const collectionPlannerRuntime = (
  eventLog: WorkflowSchedulerEventLog,
  ports: SchedulerPorts,
): WorkflowCollectionPlannerRuntime => ({
  createActivityId: ports.createActivityId,
  eventLog,
  plannerRunner: ports.plannerRunner,
  writeArtifact: ports.writeArtifact,
  writeSnapshot: ports.writeSnapshot,
});

/** 节点运行器运行时：共享事件日志与端口（多一个 runner）。 */
export const nodeRunnerRuntime = (
  eventLog: WorkflowSchedulerEventLog,
  ports: SchedulerPorts,
): WorkflowNodeRunnerRuntime => ({
  createActivityId: ports.createActivityId,
  eventLog,
  runner: ports.runner,
  writeArtifact: ports.writeArtifact,
  writeSnapshot: ports.writeSnapshot,
});
