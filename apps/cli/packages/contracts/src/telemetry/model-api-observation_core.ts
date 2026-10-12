// SPDX-License-Identifier: Apache-2.0
// 受控调用的 observation 归一：querySource → (operation, actorKind) 查表，再用调用方给出的
// observation 覆盖，最后补 logicalCallId。表与默认项是兼容面（fixtures/query-source-mapping.json）。
import { ModelApiActorKind, ModelApiOperation } from "./model-api-tables_core.js";
import type { ModelApiCallObservation } from "./index.js";

interface QuerySourceResolution {
  operation: ModelApiOperation;
  actorKind: ModelApiActorKind;
}

/** 未命中（含 undefined / 空串 / 只有空白 / 大小写不符）时的兜底：内部模型调用。 */
const FALLBACK_RESOLUTION: QuerySourceResolution = {
  operation: ModelApiOperation.ToolInternalModelCall,
  actorKind: ModelApiActorKind.System,
};

const QUERY_SOURCE_RESOLUTIONS = new Map<string, QuerySourceResolution>([
  ["main_turn", { operation: ModelApiOperation.AgentStep, actorKind: ModelApiActorKind.MainAgent }],
  ["subagent", { operation: ModelApiOperation.AgentStep, actorKind: ModelApiActorKind.Subagent }],
  [
    "workflow_child",
    { operation: ModelApiOperation.AgentStep, actorKind: ModelApiActorKind.WorkflowChild },
  ],
  [
    "compact",
    { operation: ModelApiOperation.ContextCompaction, actorKind: ModelApiActorKind.System },
  ],
  [
    "session_title",
    { operation: ModelApiOperation.SessionTitle, actorKind: ModelApiActorKind.System },
  ],
  [
    "goal_summary_title",
    { operation: ModelApiOperation.GoalTitle, actorKind: ModelApiActorKind.System },
  ],
  [
    "target_completion_verification",
    { operation: ModelApiOperation.GoalVerification, actorKind: ModelApiActorKind.System },
  ],
  [
    "git_commit_message",
    { operation: ModelApiOperation.GitCommitMessage, actorKind: ModelApiActorKind.System },
  ],
  [
    "web_search_tool",
    { operation: ModelApiOperation.WebSearch, actorKind: ModelApiActorKind.Tool },
  ],
  [
    "web_fetch_processing",
    { operation: ModelApiOperation.WebFetch, actorKind: ModelApiActorKind.Tool },
  ],
  [
    "read_session_context",
    { operation: ModelApiOperation.ReadSessionContextExtract, actorKind: ModelApiActorKind.Tool },
  ],
  [
    "project_memory_extract",
    { operation: ModelApiOperation.ProjectMemoryExtract, actorKind: ModelApiActorKind.System },
  ],
]);

/** 查表：先 trim 再精确匹配（大小写敏感），未命中用兜底项。 */
export const resolveQuerySourceResolution = (
  querySource: string | undefined,
): QuerySourceResolution =>
  QUERY_SOURCE_RESOLUTIONS.get(querySource?.trim() ?? "") ?? FALLBACK_RESOLUTION;

/** 归一：默认判定 → observation 逐字段覆盖 → logicalCallId 兜底为 UUID v4。 */
export const normalizeModelApiCallObservation = (
  querySource: string | undefined,
  observation: ModelApiCallObservation | undefined,
): Required<Pick<ModelApiCallObservation, "operation" | "actorKind" | "logicalCallId">> &
  ModelApiCallObservation => {
  const fallback = resolveQuerySourceResolution(querySource);
  const trimmedCallId = observation?.logicalCallId?.trim();
  return {
    ...fallback,
    ...observation,
    operation: observation?.operation ?? fallback.operation,
    actorKind: observation?.actorKind ?? fallback.actorKind,
    logicalCallId:
      trimmedCallId !== undefined && trimmedCallId.length > 0 ? trimmedCallId : crypto.randomUUID(),
  };
};
