// SPDX-License-Identifier: MIT
/* eslint-disable max-lines -- 桩文件按 interface.md 的导出清单生成，行数由导出数量决定。 */
// contracts-01 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的桩替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: contracts-01");
};

const _unimplementedValue = (): never => notImplemented();

export function apply(..._args: unknown[]): never {
  return notImplemented();
}
export type AssistantFeedbackUpdatedPayload = never;
export type AssistantMessagePayload = never;
export type Attachment = never;
export type BackgroundResultOriginMeta = never;
export type BackgroundTaskCompletedPayload = never;
export type BackgroundTaskPayloadBase = never;
export type BackgroundTaskStartedPayload = never;
export type BackgroundTaskStatus = never;
export type BackgroundTaskUpdatedPayload = never;
export function boundWorkflowLaunchMeta(..._args: unknown[]): never {
  return notImplemented();
}
export type CollaborationMode = never;
export type CompactLifecyclePayload = never;
export type ContextUsageBreakdownItem = never;
export type ContextUsageBreakdownSource = never;
export function createInMemorySessionEventStore(..._args: unknown[]): never {
  return notImplemented();
}
export function createModelUsageSummaryFromEvents(..._args: unknown[]): never {
  return notImplemented();
}
export function createSessionEvent(..._args: unknown[]): never {
  return notImplemented();
}
export function createSessionEventRetentionPolicy(..._args: unknown[]): never {
  return notImplemented();
}
export type DynamicWorkflowRunProgressPayload = never;
export type ErrorAttribution = never;
export type ErrorPayload = never;
export class EventReducer {
  constructor(..._args: unknown[]) {
    notImplemented();
  }
}
export type FollowupModeChangedPayload = never;
export class InMemorySessionEventStore {
  constructor(..._args: unknown[]) {
    notImplemented();
  }
}
export type InMemorySessionEventStoreOptions = never;
export function isTransientSessionEvent(..._args: unknown[]): never {
  return notImplemented();
}
export type MicrocompactBoundaryEventPayload = never;
export type ModelAnomalyWarningCategory = never;
export type ModelAnomalyWarningPayload = never;
export type ModelAnomalyWarningSeverity = never;
export type ModelCompletePayload = never;
export type ModelErrorPayload = never;
export type ModelMessage = never;
export type ModelNetworkStatusPayload = never;
export type ModelRequestPayload = never;
export type ModelSelectedPayload = never;
export type ModelSelectionOrigin = never;
export type ModelStreamingKind = never;
export type ModelStreamingPayload = never;
export type NetworkRequestLifecycleStatus = never;
export type NetworkRequestSource = never;
export type NetworkRequestStatusPayload = never;
export type OffPeakRunType = never;
export type PermissionDecision = never;
export type PermissionDeniedPayload = never;
export type PermissionRequestedPayload = never;
export type PermissionResolvedPayload = never;
export type QueueAutoDrainChangedPayload = never;
export function reduce(..._args: unknown[]): never {
  return notImplemented();
}
export type RiskLevel = never;
export const SEALED_TURN_TRANSIENT_GRACE_MS = new Proxy({} as never, { get: _unimplementedValue });
export type SessionCompactedPayload = never;
export type SessionCreatedPayload = never;
export type SessionEvent = never;
export type SessionEventPayload = never;
export type SessionEventRetentionMode = never;
export type SessionEventRetentionPolicy = never;
export type SessionEventType = never;
export type SessionForkedPayload = never;
export type SessionInputPromotedPayload = never;
export type SessionModeChangedPayload = never;
export type SessionResumedPayload = never;
export type SessionTitleUpdatedPayload = never;
export const STREAM_RECOVERY_DISCARDED_ERROR_NAME = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const STREAM_RECOVERY_DISCARDED_FINISH = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type StreamingToolExecutionTiming = never;
export type StreamingToolLedgerPayload = never;
export type StreamingToolLedgerProjectionInfo = never;
export type StreamingToolLedgerStatus = never;
export type StreamRecoveryAnchorKind = never;
export type StreamRecoveryAnchorPayload = never;
export type StreamRecoveryAnchorProjectionInfo = never;
export type StreamRecoveryAnchorSelectedPayload = never;
export type StreamRecoveryBlockedPayload = never;
export type StreamRecoveryFailureKind = never;
export type StreamRecoveryRetryStartedPayload = never;
export type StreamRecoveryStartedPayload = never;
export type StreamRecoveryTailDiscardedPayload = never;
export type SystemMessagePayload = never;
export type TargetChangedAction = never;
export type TargetChangedPayload = never;
export type TargetChangedSource = never;
export type TargetCompletionVerificationPayload = never;
export type TargetCompletionVerificationStatus = never;
export type TokenUsage = never;
export type ToolBatchCompletePayload = never;
export type ToolCall = never;
export type ToolCallErrorPayload = never;
export type ToolCallPayload = never;
export type ToolCallProgressPayload = never;
export type ToolCallResultPayload = never;
export type ToolCallScheduledPayload = never;
export type ToolCallStartedPayload = never;
export type ToolResultPayload = never;
export type ToolSchedulePayload = never;
export const TRANSIENT_SESSION_EVENT_TYPES = new Proxy({} as never, { get: _unimplementedValue });
export type TurnAttachmentMeta = never;
export type TurnBackgroundAttribution = never;
export type TurnCompletePayload = never;
export type TurnErrorPayload = never;
export type TurnExecutionKind = never;
export type TurnFileChangeSummary = never;
export type TurnFileChangeSummaryItem = never;
export type TurnInputReceivedPayload = never;
export type TurnResultType = never;
export type TurnStartedPayload = never;
export type TurnStartedPayloadBase = never;
export type TurnSteerDeliveryChangedPayload = never;
export type TurnSteerDiscardedPayload = never;
export type TurnSteerDispatchChangedPayload = never;
export type TurnSteerDrainedPayload = never;
export type TurnSteerQueuedPayload = never;
export type TurnSteerRejectedPayload = never;
export type TurnSteerReorderedPayload = never;
export type UserInputAutoResolutionState = never;
export type UserInputAutoResolutionUpdatedPayload = never;
export type UserMessagePayload = never;
export const WORKFLOW_LAUNCH_ARGS_MAX_BYTES = new Proxy({} as never, { get: _unimplementedValue });
export const WORKFLOW_LAUNCH_ARGS_TRUNCATED_KEY = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const WORKFLOW_LAUNCH_DESCRIPTION_MAX_CHARS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const WORKFLOW_LAUNCH_SCRIPT_MAX_CHARS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type WorkflowLaunchDisplay = never;
export type WorkflowLaunchMeta = never;
export type WorkflowNotificationMeta = never;
export type WorkflowSettingsAmendMeta = never;
export type WorkspaceHookAdmissionUpdatedPayload = never;
export type WorkspaceHookReviewRequestedPayload = never;
export type WorkspaceHookReviewSettledPayload = never;
export type WorkspaceHookReviewSupersededPayload = never;
