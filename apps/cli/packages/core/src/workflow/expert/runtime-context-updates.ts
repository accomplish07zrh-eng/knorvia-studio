// SPDX-License-Identifier: Apache-2.0
// 快照更新入口：状态补丁、相位替换、工件登记与活动登记。
import {
  deriveWorkflowSessionLinks,
  type ExpertWorkflowRunSnapshot,
  type WorkflowActivitySnapshot,
  type WorkflowArtifact,
  type WorkflowDefinition,
  type WorkflowPhaseSnapshot,
} from "@knorvia/contracts";
import { updateGraphNodeStatus } from "./prompts.js";

/** 可变字段清单：类型与运行时校验共用一份来源。 */
const MUTABLE_KEYS = [
  "completedAt",
  "currentPhase",
  "failure",
  "pauseReason",
  "recoveryActions",
  "reportPath",
  "startedAt",
  "status",
] as const;

/** 快照可变字段：其余字段由生命周期函数维护，这里只开放这几个入口。 */
export type SnapshotPatch = Partial<Pick<ExpertWorkflowRunSnapshot, (typeof MUTABLE_KEYS)[number]>>;

/** 快照类型别名：本模块内多处使用。 */
type Snapshot = ExpertWorkflowRunSnapshot;
/** 更新操作所需的最小上下文：定义与统一时钟。 */
export interface UpdateContext {
  definition: WorkflowDefinition;
  timestamp(): string;
}

/** 状态补丁：复制原快照后合并补丁，并刷新 updatedAt。 */
export function updateSnapshot(
  runtime: UpdateContext,
  run: Snapshot,
  changes: SnapshotPatch,
): Snapshot {
  const next = { ...run };
  Object.assign(next, changes);
  next.updatedAt = runtime.timestamp();
  return next;
}
/** 相位表重建：按相位名索引后覆盖目标条目（Map 保持原有顺序）。 */
const rebuildPhases = (
  phases: ExpertWorkflowRunSnapshot["phases"],
  phaseName: string,
  changes: Partial<WorkflowPhaseSnapshot>,
): ExpertWorkflowRunSnapshot["phases"] => {
  const byName = new Map(phases.map((entry) => [entry.phase, entry] as const));
  const current = byName.get(phaseName);
  if (current !== undefined) byName.set(phaseName, { ...current, ...changes });
  return [...byName.values()];
};

/** 相位更新：重建相位表 + 同步图节点状态，并把 currentPhase 指向该相位。 */
export function updatePhase(
  runtime: UpdateContext,
  run: Snapshot,
  phaseName: string,
  changes: Partial<WorkflowPhaseSnapshot>,
): Snapshot {
  const phases = rebuildPhases(run.phases, phaseName, changes);
  const graph = updateGraphNodeStatus(run.graph, phaseName, changes.status);
  return updateSnapshot(
    runtime,
    { ...run, currentPhase: phaseName, graph, phases },
    { currentPhase: phaseName },
  );
}
/** 工件登记：同路径覆盖，保持工件清单无重复。 */
export function addArtifact(
  runtime: UpdateContext,
  run: Snapshot,
  target: WorkflowArtifact,
): Snapshot {
  const artifacts: WorkflowArtifact[] = [];
  for (const item of run.artifacts) {
    if (item.path !== target.path) artifacts.push(item);
  }
  artifacts.push(target);
  return Object.assign({}, run, { artifacts, updatedAt: runtime.timestamp() });
}

/** 活动登记：同 id 覆盖，并重算会话链接。 */
export function upsertActivity(
  runtime: UpdateContext,
  run: Snapshot,
  target: WorkflowActivitySnapshot,
): Snapshot {
  const activities: WorkflowActivitySnapshot[] = [];
  for (const entry of run.activities) {
    if (entry.activityId !== target.activityId) activities.push(entry);
  }
  activities.push(target);
  const sessionLinks = deriveWorkflowSessionLinks({ activities, runId: run.runId });
  return Object.assign({}, run, { activities, sessionLinks, updatedAt: runtime.timestamp() });
}
