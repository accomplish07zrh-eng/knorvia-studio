// SPDX-License-Identifier: Apache-2.0
// Agent 执行 telemetry 的公开面：取值表与 schema 版本从内部模块再导出，类型面就地声明。
// 类型声明是合同冻结的兼容面（B6 用编译期用例固定形状），实现细节不在本文件。
import {
  AgentTelemetryOperation as AGENT_OPERATION_TABLE,
  TELEMETRY_SCHEMA_VERSION as SCHEMA_VERSION,
} from "./agent-execution_core.js";

/** 13 个语义 → 线上取值；键名与取值都是兼容面。 */
export const AgentTelemetryOperation = AGENT_OPERATION_TABLE;

/** 载荷 schema 版本，导出器据此判定兼容性。 */
export const TELEMETRY_SCHEMA_VERSION = SCHEMA_VERSION;

export type AgentTelemetryOperation =
  (typeof AgentTelemetryOperation)[keyof typeof AgentTelemetryOperation];

export type AgentTelemetryActorKind = "main" | "subagent" | "workflow_child";
export type AgentTelemetryLaunchSurface =
  | "desktop"
  | "standalone_cli"
  | "web_remote"
  | "automation"
  | "bot";
export type AgentTelemetryInputSource =
  | "user"
  | import("../interfaces/session-store.port.js").SyntheticUserMessageSource;
export type AgentTelemetryIdentityState = "authenticated" | "anonymous" | "unknown";
export type AgentTelemetryRuntimeSurface =
  | "standalone_cli"
  | "desktop_local_host"
  | "remote_workspace_host";

export type AgentTelemetryErrorCategory =
  | "configuration"
  | "authentication"
  | "permission"
  | "rate_limit"
  | "timeout"
  | "network"
  | "provider"
  | "parse"
  | "cancelled"
  | "internal"
  | "unknown";

export type AgentTelemetryCancellationReason =
  | "user"
  | "abort_signal"
  | "timeout"
  | "shutdown"
  | "superseded"
  | "unknown";

export type AgentTelemetryAbandonReason =
  | "missing_terminal"
  | "session_shutdown"
  | "process_shutdown";

export interface AgentTelemetryExecutionContext {
  actorKind: AgentTelemetryActorKind;
  agentName?: string;
  identityState?: AgentTelemetryIdentityState;
  launchSurface: AgentTelemetryLaunchSurface;
  parentSessionId?: string;
  parentTurnId?: string;
  queryId?: string;
  sessionId: string;
  turnId?: string;
  userSubjectId?: string;
}

// 可跨异步/进程边界保存的因果引用；SpanContext 字段保持 OTel 原义，session/turn 只用于 ARMS 无法 Link Join 时的受控查询投影。
export interface AgentTelemetryCausation {
  isRemote: boolean;
  spanId: string;
  traceFlags: number;
  traceId: string;
  traceState?: string;
  sessionId?: string;
  turnId?: string;
  toolCallId?: string;
}

export interface AgentTelemetryScope {
  captureCausation(): AgentTelemetryCausation | undefined;
  run<T>(execute: () => T): T;
}

export interface AgentTurnTraceStart {
  context: AgentTelemetryExecutionContext;
  causation?: AgentTelemetryCausation;
  causationMode?: "child" | "linked_root";
  inputSource?: AgentTelemetryInputSource;
  turnNumber: number;
}

export interface AgentStepTraceStart {
  stepId: string;
  stepIndex: number;
}

export interface ToolTraceStart {
  registeredToolName: string;
  toolCallId: string;
}

export type CommandCategory =
  | "shell"
  | "git"
  | "package_manager"
  | "build"
  | "test"
  | "file"
  | "network"
  | "other";

export type CommandShellKind = "bash" | "zsh" | "sh" | "powershell" | "cmd" | "other";

export interface CommandTraceStart {
  category: CommandCategory;
  commandCount: number;
  safeName: string;
  sandboxed: boolean;
  shellKind?: CommandShellKind;
}

export interface CompactionTraceStart {
  maxAttempts?: number;
  modelMode: "streaming" | "non_streaming";
  outerAttempt?: number;
  phase: import("../compact/index.js").CompactPhase;
  policyContextWindowTokens?: number;
  recoveredFromLogicalCallId?: string;
  thresholdTokens?: number;
  tokenSource?: "estimate" | "provider_usage";
  trigger: import("../compact/index.js").CompactTrigger;
  triggeringStepIndex?: number;
}

export type DetachedExecutionKind = "foreground" | "queued" | "background";
export type DetachedTrigger = "user" | "turn" | "tool" | "scheduler" | "recovery" | "other";
export type DetachedTargetKind = "session" | "goal" | "workspace" | "project_memory" | "other";

export interface DetachedOperationTraceStart {
  causation?: AgentTelemetryCausation;
  context: AgentTelemetryExecutionContext;
  executionKind: DetachedExecutionKind;
  operation: Exclude<AgentTelemetryOperation, "agent_step" | "context_compaction">;
  trigger: DetachedTrigger;
  chunkCount?: number;
  chunkIndex?: number;
  goalIteration?: number;
  targetKind?: DetachedTargetKind;
}

export type TurnFailureStage = "setup" | "agent_loop" | "finalize" | "unhandled";
export type StepFailureStage = "prepare" | "model" | "tool" | "commit" | "unhandled";
export type ToolFailureStage =
  | "lookup"
  | "validation"
  | "permission"
  | "pre_hook"
  | "handler"
  | "post_hook"
  | "serialize"
  | "unhandled";
export type CommandFailureStage =
  | "prepare"
  | "spawn"
  | "execute"
  | "timeout"
  | "collect_output"
  | "unhandled";
export type CompactionFailureStage =
  | "prepare"
  | "model"
  | "parse"
  | "commit"
  | "fallback"
  | "unhandled";
export type DetachedFailureStage = "schedule" | "execute" | "commit" | "unhandled";

export interface AgentTurnSpanWriter extends AgentTelemetryScope {
  finishCompleted(resultType?: "assistant_message" | "tool_request" | "no_output" | "other"): void;
  finishFailed(
    stage: TurnFailureStage,
    category: AgentTelemetryErrorCategory,
    error?: unknown,
  ): void;
  finishCancelled(reason: AgentTelemetryCancellationReason): void;
}

export interface AgentStepSpanWriter extends AgentTelemetryScope {
  finishCompleted(
    terminalReason:
      | "model_completed"
      | "tool_requested"
      | "turn_completed"
      | "compaction_requested",
  ): void;
  finishDiscarded(): void;
  finishFailed(
    stage: StepFailureStage,
    category: AgentTelemetryErrorCategory,
    error?: unknown,
  ): void;
  finishCancelled(reason: AgentTelemetryCancellationReason): void;
}

export interface ToolExecutionSpanWriter extends AgentTelemetryScope {
  markPermissionRequested(): void;
  setPermissionDecision(decision: "granted" | "denied" | "not_required"): void;
  setOutputBytes(bytes: number): void;
  setOutputTruncated(truncated: boolean): void;
  startCommand(input: CommandTraceStart): CommandExecutionSpanWriter;
  finishCompleted(): void;
  finishDenied(reason: "user_denied" | "policy_denied" | "unavailable" | "unknown"): void;
  finishFailed(
    stage: ToolFailureStage,
    category: AgentTelemetryErrorCategory,
    error?: unknown,
  ): void;
  finishCancelled(reason: AgentTelemetryCancellationReason): void;
}

export interface CommandExecutionSpanWriter extends AgentTelemetryScope {
  markFirstOutput(): void;
  markTerminationRequested(reason: "cancelled" | "timeout" | "shutdown"): void;
  setExitCode(exitCode: number): void;
  setSignal(signal: string): void;
  setOutputBytes(bytes: number): void;
  setTimedOut(timedOut: boolean): void;
  finishCompleted(): void;
  finishFailed(
    stage: CommandFailureStage,
    category: AgentTelemetryErrorCategory,
    error?: unknown,
  ): void;
  finishCancelled(reason: AgentTelemetryCancellationReason): void;
  finishBackgrounded(): void;
}

export interface ContextCompactionSpanWriter extends AgentTelemetryScope {
  setInputTokens(tokens: number): void;
  setOutputTokens(tokens: number): void;
  markFallbackSelected(reason: string): void;
  finishCompleted(): void;
  finishDiscarded(): void;
  finishFailed(
    stage: CompactionFailureStage,
    category: AgentTelemetryErrorCategory,
    error?: unknown,
  ): void;
  finishCancelled(reason: AgentTelemetryCancellationReason): void;
}

export interface DetachedOperationSpanWriter extends AgentTelemetryScope {
  setResultType(resultType: "text" | "boolean" | "metadata" | "other"): void;
  finishCompleted(): void;
  finishFailed(
    stage: DetachedFailureStage,
    category: AgentTelemetryErrorCategory,
    error?: unknown,
  ): void;
  finishCancelled(reason: AgentTelemetryCancellationReason): void;
}

export interface AgentExecutionTelemetryPort {
  captureCausation(): AgentTelemetryCausation | undefined;
  startCompaction(input: CompactionTraceStart): ContextCompactionSpanWriter;
  startDetachedOperation(input: DetachedOperationTraceStart): DetachedOperationSpanWriter;
  startStep(input: AgentStepTraceStart): AgentStepSpanWriter;
  startTool(input: ToolTraceStart): ToolExecutionSpanWriter;
  startTurn(input: AgentTurnTraceStart): AgentTurnSpanWriter;
  abandonSession(sessionId: string): void;
}
