// SPDX-License-Identifier: Apache-2.0
// contracts-03 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的实现替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: contracts-03");
};

const _unimplementedValue = (): never => notImplemented();
export const TELEMETRY_SCHEMA_VERSION = new Proxy({} as never, { get: _unimplementedValue });
export const AgentTelemetryOperation = new Proxy({} as never, { get: _unimplementedValue });
export type AgentTelemetryOperation = never;
export type AgentTelemetryActorKind = never;
export type AgentTelemetryLaunchSurface = never;
export type AgentTelemetryInputSource = never;
export type AgentTelemetryIdentityState = never;
export type AgentTelemetryRuntimeSurface = never;
export type AgentTelemetryErrorCategory = never;
export type AgentTelemetryCancellationReason = never;
export type AgentTelemetryAbandonReason = never;
export type AgentTelemetryExecutionContext = never;
export type AgentTelemetryCausation = never;
export type AgentTelemetryScope = never;
export type AgentTurnTraceStart = never;
export type AgentStepTraceStart = never;
export type ToolTraceStart = never;
export type CommandCategory = never;
export type CommandShellKind = never;
export type CommandTraceStart = never;
export type CompactionTraceStart = never;
export type DetachedExecutionKind = never;
export type DetachedTrigger = never;
export type DetachedTargetKind = never;
export type DetachedOperationTraceStart = never;
export type TurnFailureStage = never;
export type StepFailureStage = never;
export type ToolFailureStage = never;
export type CommandFailureStage = never;
export type CompactionFailureStage = never;
export type DetachedFailureStage = never;
export type AgentTurnSpanWriter = never;
export type AgentStepSpanWriter = never;
export type ToolExecutionSpanWriter = never;
export type CommandExecutionSpanWriter = never;
export type ContextCompactionSpanWriter = never;
export type DetachedOperationSpanWriter = never;
export type AgentExecutionTelemetryPort = never;
