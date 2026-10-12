// SPDX-License-Identifier: MIT
/* eslint-disable max-lines -- 桩文件按 interface.md 的导出清单生成，行数由导出数量决定。 */
// contracts-02 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的实现替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: contracts-02");
};

const _unimplementedValue = (): never => notImplemented();

export type CreateScriptWorkflowActivityInput = never;
export type CreateScriptWorkflowRunInput = never;
export type CreateSessionTaskLinkInput = never;
export function deriveWorkflowRunSchedulerState(..._args: unknown[]): never {
  return notImplemented();
}
export function deriveWorkflowSchedulerState(..._args: unknown[]): never {
  return notImplemented();
}
export function deriveWorkflowSessionLinks(..._args: unknown[]): never {
  return notImplemented();
}
export type ExpertWorkflowPhase = never;
export const ExpertWorkflowPhaseSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ExpertWorkflowRunSnapshot = never;
export const ExpertWorkflowRunSnapshotSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ExpertWorkflowStrategy = never;
export const ExpertWorkflowStrategySchema = new Proxy({} as never, { get: _unimplementedValue });
export const SCRIPT_WORKFLOW_ACTIVITY_STATUSES = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const SCRIPT_WORKFLOW_DEFINITION_SCOPES = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const SCRIPT_WORKFLOW_RUN_STATUSES = new Proxy({} as never, { get: _unimplementedValue });
export type ScriptWorkflowActivityRecord = never;
export type ScriptWorkflowActivityStatus = never;
export type ScriptWorkflowDefinitionRecord = never;
export type ScriptWorkflowDefinitionScope = never;
export type ScriptWorkflowEventRecord = never;
export type ScriptWorkflowRunRecord = never;
export type ScriptWorkflowRunStats = never;
export const ScriptWorkflowRunStatsSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ScriptWorkflowRunStatus = never;
export type ScriptWorkflowSource = never;
export type ScriptWorkflowStorePort = never;
export type SessionTaskLinkRecord = never;
export type UpdateScriptWorkflowActivityInput = never;
export type UpdateScriptWorkflowRunInput = never;
export type UpsertScriptWorkflowDefinitionInput = never;
export type WorkflowActivityKind = never;
export const WorkflowActivityKindSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowActivitySnapshot = never;
export const WorkflowActivitySnapshotSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowAgentCallInput = never;
export const WorkflowAgentCallInputSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowAgentIsolation = never;
export const WorkflowAgentIsolationSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowAgentOptions = never;
export const WorkflowAgentOptionsSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowArtifact = never;
export const WorkflowArtifactSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowCriticReopenProposal = never;
export const WorkflowCriticReopenProposalSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type WorkflowCriticResult = never;
export const WorkflowCriticResultSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowCriticSeverity = never;
export const WorkflowCriticSeveritySchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowDefinition = never;
export const WorkflowDefinitionSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowDefinitionStorePort = never;
export type WorkflowEvent = never;
export const WorkflowEventSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowEventType = never;
export const WorkflowEventTypeSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowFailure = never;
export type WorkflowFailureKind = never;
export const WorkflowFailureKindSchema = new Proxy({} as never, { get: _unimplementedValue });
export const WorkflowFailureSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowGraph = never;
export type WorkflowGraphCollection = never;
export const WorkflowGraphCollectionSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowGraphCollectionStatus = never;
export const WorkflowGraphCollectionStatusSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type WorkflowGraphEdge = never;
export const WorkflowGraphEdgeSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowGraphNode = never;
export const WorkflowGraphNodeSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowGraphPlannerNode = never;
export const WorkflowGraphPlannerNodeSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowGraphPlannerResult = never;
export const WorkflowGraphPlannerResultSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type WorkflowGraphRecord = never;
export const WorkflowGraphRecordSchema = new Proxy({} as never, { get: _unimplementedValue });
export const WorkflowGraphSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowGraphSeed = never;
export type WorkflowGraphSeedCollection = never;
export const WorkflowGraphSeedCollectionSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const WorkflowGraphSeedSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowGraphSeedSource = never;
export const WorkflowGraphSeedSourceSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowKind = never;
export const WorkflowKindSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowNodePromptUpdate = never;
export const WorkflowNodePromptUpdateSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowNodePromptUpdateSet = never;
export const WorkflowNodePromptUpdateSetSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type WorkflowNodeStatus = never;
export const WorkflowNodeStatusSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowPhaseBehavior = never;
export const WorkflowPhaseBehaviorSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowPhaseDefinition = never;
export const WorkflowPhaseDefinitionSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowPhaseId = never;
export const WorkflowPhaseIdSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowPhaseSnapshot = never;
export const WorkflowPhaseSnapshotSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowRecoveryAction = never;
export const WorkflowRecoveryActionSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowRunListItem = never;
export type WorkflowRunSnapshot = never;
export const WorkflowRunSnapshotSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowRunStatus = never;
export const WorkflowRunStatusSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowSchedulerActiveActivity = never;
export const WorkflowSchedulerActiveActivitySchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type WorkflowSchedulerCollectionState = never;
export const WorkflowSchedulerCollectionStateSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type WorkflowSchedulerDerivedNode = never;
export const WorkflowSchedulerDerivedNodeSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type WorkflowSchedulerState = never;
export const WorkflowSchedulerStateSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowScriptMeta = never;
export const WorkflowScriptMetaSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowScriptPhaseMeta = never;
export const WorkflowScriptPhaseMetaSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowSessionLink = never;
export const WorkflowSessionLinkSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowSessionLinkStatus = never;
export const WorkflowSessionLinkStatusSchema = new Proxy({} as never, { get: _unimplementedValue });
export type WorkflowStorePort = never;
export type WorkflowStrategy = never;
export const WorkflowStrategySchema = new Proxy({} as never, { get: _unimplementedValue });
