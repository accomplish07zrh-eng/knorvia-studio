// SPDX-License-Identifier: Apache-2.0
// 遥测归类助手：任务类型 → 演员类型、输入来源归一化。
import type {
  AgentTelemetryActorKind,
  SessionTaskType,
  SyntheticUserMessageSource,
} from "@knorvia/contracts";

/** 任务类型 → 演员类型；未知或缺省都视为主会话。 */
const ACTOR_KINDS: ReadonlyMap<SessionTaskType, AgentTelemetryActorKind> = new Map([
  ["subagent_child", "subagent"],
  ["nested_workflow_child", "workflow_child"],
  ["workflow_child", "workflow_child"],
]);

export const actorKindFromTaskType = (
  taskType: SessionTaskType | undefined,
): AgentTelemetryActorKind =>
  taskType === undefined ? "main" : (ACTOR_KINDS.get(taskType) ?? "main");

/** 输入来源归一化：缺省按用户输入处理。 */
export const normalizeInputSource = (
  source: SyntheticUserMessageSource | undefined,
): "user" | SyntheticUserMessageSource => source ?? "user";
