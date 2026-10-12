// SPDX-License-Identifier: Apache-2.0
// contracts-03 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的实现替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: contracts-03");
};

const _unimplementedValue = (): never => notImplemented();
export * from "./agent-execution.js";
export const ModelApiOperation = new Proxy({} as never, { get: _unimplementedValue });
export type ModelApiOperation = never;
export function mapModelApiOperationToAgentOperation(..._args: unknown[]): never {
  return notImplemented();
}
export const ModelApiActorKind = new Proxy({} as never, { get: _unimplementedValue });
export type ModelApiActorKind = never;
export type ModelApiCallCause = never;
export type ModelApiRuntimeSurface = never;
export type ModelApiErrorPhase = never;
export const ModelFailureExceptionKind = new Proxy({} as never, { get: _unimplementedValue });
export type ModelFailureExceptionKind = never;
export type ModelReasoningCapabilityStatus = never;
export type ModelReasoningState = never;
export type ModelReasoningControlType = never;
export type ModelReasoningCallHint = never;
export type ModelReasoningObservation = never;
export type ModelApiCustomAttributes = never;
export type ModelApiCallObservation = never;
export type ResolvedModelApiCallObservation = never;
export function resolveModelApiCallObservation(..._args: unknown[]): never {
  return notImplemented();
}
export type ProviderEndpointIdentity = never;
export type TelemetryIdentitySnapshot = never;
export type TelemetryResourceContext = never;
export type ModelApiOperationKind = never;
export type ModelCallFailureStage = never;
export type ModelAttemptFailureStage = never;
export type ModelFinishReason = never;
export type ResolvedModelTelemetryDescriptor = never;
export type ResponseModelTelemetryDescriptor = never;
export type ModelCallTraceStart = never;
export type ModelAttemptTraceStart = never;
export type ModelCallSpanWriter = never;
export type ModelAttemptSpanWriter = never;
export type ModelExecutionTelemetryPort = never;
export type AgentTelemetryRuntimeOwner = never;
export type ModelApiCallDescriptor = never;
