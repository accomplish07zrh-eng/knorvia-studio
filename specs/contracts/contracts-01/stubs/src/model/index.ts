// SPDX-License-Identifier: MIT
/* eslint-disable max-lines -- 桩文件按 interface.md 的导出清单生成，行数由导出数量决定。 */
// contracts-01 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的桩替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: contracts-01");
};

const _unimplementedValue = (): never => notImplemented();

export type AttachmentKind = never;
export type AttachmentRef = never;
export function createModelId(..._args: unknown[]): never {
  return notImplemented();
}
export function createModelProviderId(..._args: unknown[]): never {
  return notImplemented();
}
export function createModelUsageSummary(..._args: unknown[]): never {
  return notImplemented();
}
export type DetectedImageMediaType = never;
export function detectImageMediaType(..._args: unknown[]): never {
  return notImplemented();
}
export type EnumOptionSpec = never;
export function getCurrentModelInvocationContext(..._args: unknown[]): never {
  return notImplemented();
}
export function getModelUsageContextTokens(..._args: unknown[]): never {
  return notImplemented();
}
export function getModelUsageInputWindowTokens(..._args: unknown[]): never {
  return notImplemented();
}
export function getModelUsageTotalTokens(..._args: unknown[]): never {
  return notImplemented();
}
export function hasModelUsage(..._args: unknown[]): never {
  return notImplemented();
}
export type JsonSchema = never;
export type LimitOptionSpec = never;
export type Model = never;
export type ModelCacheControl = never;
export type ModelContentProtection = never;
export type ModelErrorCode = never;
export type ModelEvent = never;
export type ModelFailureReason = never;
export type ModelFileContentBlock = never;
export type ModelId = never;
export type ModelImageContentBlock = never;
export type ModelInputFormat = never;
export type ModelInputMessage = never;
export const modelInputMessageJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ModelInvocationContext = never;
export type ModelMessageContent = never;
export type ModelMessageContentBlock = never;
export function modelMessageContentBlockToText(..._args: unknown[]): never {
  return notImplemented();
}
export function modelMessageContentToText(..._args: unknown[]): never {
  return notImplemented();
}
export type ModelMessageRole = never;
export type ModelNetworkStatusEvent = never;
export const modelNetworkStatusEventJsonSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type ModelOptions = never;
export type ModelOptionSpecs = never;
export type ModelOutputFormat = never;
export type ModelProperties = never;
export type ModelPropertiesInput = never;
export class ModelProtocolError {
  constructor(..._args: unknown[]) {
    notImplemented();
  }
}
export type ModelProviderId = never;
export type ModelReasoningContentBlock = never;
export type ModelRequest = never;
export type ModelRequestAdmission = never;
export type ModelRequestAdmissionTicket = never;
export type ModelRequestAdmittedStatusEvent = never;
export type ModelRequestAuth = never;
export type ModelRequestAuthSource = never;
export type ModelRequestAuthSourceInput = never;
export type ModelRequestCompletedStatusEvent = never;
export type ModelRequestDependencies = never;
export type ModelRequestFailedStatusEvent = never;
export type ModelRequestQueuedStatusEvent = never;
export type ModelRequestSessionType = never;
export type ModelRequestSettings = never;
export type ModelRequestStartedStatusEvent = never;
export type ModelRequestTarget = never;
export type ModelResourceLinkContentBlock = never;
export type ModelResult = never;
export type ModelRetryBudget = never;
export type ModelRetryReason = never;
export type ModelRetryScheduledStatusEvent = never;
export type ModelSelection = never;
export const modelSelectionJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ModelServerToolUsage = never;
export type ModelSource = never;
export type ModelStatusSink = never;
export type ModelStreamEvent = never;
export type ModelStreamRecoveryStatus = never;
export type ModelStreamStalledStatusEvent = never;
export type ModelTelemetryMilestoneStatusEvent = never;
export type ModelTextContentBlock = never;
export type ModelTextRequest = never;
export const modelTextRequestJsonSchema = new Proxy({} as never, { get: _unimplementedValue });
export type ModelTextResult = never;
export type ModelToolCall = never;
export type ModelToolChoice = never;
export type ModelToolContract = never;
export type ModelToolExecutionContext = never;
export type ModelToolResult = never;
export type ModelToolSideEffectScope = never;
export type ModelTransportKind = never;
export type ModelUsage = never;
export type ModelUsageSummary = never;
export type ModelVideoContentBlock = never;
export function normalizeImageMediaType(..._args: unknown[]): never {
  return notImplemented();
}
export type ParsedImageDataUrl = never;
export function parseImageDataUrl(..._args: unknown[]): never {
  return notImplemented();
}
export type ParseImageDataUrlOptions = never;
export function parseModelSelectionValue(..._args: unknown[]): never {
  return notImplemented();
}
export function runWithModelInvocationContext(..._args: unknown[]): never {
  return notImplemented();
}
export type ToolCall = never;
