// SPDX-License-Identifier: Apache-2.0
// 模型 API telemetry 的公开面：取值表与 observation 归一放在内部模块，这里只保留公开名、
// 类型声明与两个薄壳函数。类型声明是合同冻结的兼容面（B6 用编译期用例固定形状）。
import { normalizeModelApiCallObservation } from "./model-api-observation_core.js";
import {
  ModelApiActorKind as MODEL_API_ACTOR_KINDS,
  ModelApiOperation as MODEL_API_OPERATIONS,
  ModelFailureExceptionKind as MODEL_FAILURE_EXCEPTION_KINDS,
  mapModelApiOperationToAgentOperation as identityOperationMap,
} from "./model-api-tables_core.js";
import type { ModelId, ModelProviderId } from "../model/index.js";
import type {
  AgentExecutionTelemetryPort,
  AgentTelemetryAbandonReason,
  AgentTelemetryCancellationReason,
  AgentTelemetryErrorCategory,
  AgentTelemetryOperation,
  AgentTelemetryScope,
} from "./agent-execution.js";

export * from "./agent-execution.js";

/** 13 个模型 API 语义 → 线上取值；键名与取值都是兼容面。 */
export const ModelApiOperation = MODEL_API_OPERATIONS;
export type ModelApiOperation = (typeof ModelApiOperation)[keyof typeof ModelApiOperation];

/** 调用方角色。 */
export const ModelApiActorKind = MODEL_API_ACTOR_KINDS;
export type ModelApiActorKind = (typeof ModelApiActorKind)[keyof typeof ModelApiActorKind];

/** 失败异常分类。 */
export const ModelFailureExceptionKind = MODEL_FAILURE_EXCEPTION_KINDS;
export type ModelFailureExceptionKind =
  (typeof ModelFailureExceptionKind)[keyof typeof ModelFailureExceptionKind];

/** 恒等映射：两张 operation 表的语义一一对应、取值相同。 */
export function mapModelApiOperationToAgentOperation(
  operation: ModelApiOperation,
): AgentTelemetryOperation {
  return identityOperationMap(operation);
}

/** 归一 querySource 与 observation：默认判定 → 逐字段覆盖 → 补 logicalCallId。 */
export function resolveModelApiCallObservation(
  querySource: string | undefined,
  observation: ModelApiCallObservation | undefined,
): Required<Pick<ModelApiCallObservation, "operation" | "actorKind" | "logicalCallId">> &
  ModelApiCallObservation {
  return normalizeModelApiCallObservation(querySource, observation);
}
export type ModelApiCallCause = "initial" | "continuation" | "fallback_replacement" | "recovery";
export type ModelApiRuntimeSurface =
  | "standalone_cli"
  | "desktop_local_host"
  | "remote_workspace_host";
export type ModelApiErrorPhase =
  | "prepare"
  | "configuration"
  | "connect"
  | "response"
  | "stream"
  | "parse"
  | "validation"
  | "unhandled";

export type ModelReasoningCapabilityStatus = "supported" | "unsupported" | "unknown";
export type ModelReasoningState = "enabled" | "disabled" | "provider_default" | "unknown";
export type ModelReasoningControlType =
  | "fixed_level"
  | "fixed_budget"
  | "adaptive"
  | "toggle"
  | "provider_default"
  | "unknown";

// 调用点只表达用户/业务想要的 reasoning 意图；最终事实由 Provider Adapter 决定。
export interface ModelReasoningCallHint {
  requestedLevel?: string;
  explicit?: {
    state: Exclude<ModelReasoningState, "unknown">;
    controlType?: Exclude<ModelReasoningControlType, "unknown">;
    effectiveLevel?: string;
    effectiveBudgetTokens?: number;
  };
}

// 一次最终 Provider 请求的 reasoning 事实（capability/requested/effective 三段）。
export interface ModelReasoningObservation {
  capability: ModelReasoningCapabilityStatus;
  requestedState: ModelReasoningState;
  requestedControl: ModelReasoningControlType;
  requestedLevel?: string;
  requestedBudgetTokens?: number;
  effectiveState: ModelReasoningState;
  effectiveControl: ModelReasoningControlType;
  effectiveLevel?: string;
  effectiveBudgetTokens?: number;
}

// 受控调用专属事实：禁止 prompt、message、header、body、原始 URL、命令与工具 I/O。
export interface ModelApiCustomAttributes {
  compactionOuterAttempt?: number;
  compactionTrigger?: string;
  streamRecoveryNumber?: number;
}

export interface ModelApiCallObservation {
  operation?: ModelApiOperation;
  actorKind?: ModelApiActorKind;
  operationId?: string;
  logicalCallId?: string;
  callCause?: ModelApiCallCause;
  previousLogicalCallId?: string;
  runtimeSurface?: ModelApiRuntimeSurface;
  agentName?: string;
  stepIndex?: number;
  reasoning?: ModelReasoningCallHint;
  attributes?: ModelApiCustomAttributes;
}

export type ResolvedModelApiCallObservation = Omit<ModelApiCallObservation, "reasoning"> & {
  logicalCallId: string;
  operation: ModelApiOperation;
  actorKind: ModelApiActorKind;
  reasoning: ModelReasoningObservation;
};

export interface ProviderEndpointIdentity {
  origin: string;
  route: string;
  sanitizerVersion: string;
}

export interface TelemetryIdentitySnapshot {
  identityState: "authenticated" | "anonymous" | "unknown";
  userSubjectId?: string;
}

export interface TelemetryResourceContext {
  buildCommitId?: string;
  cliVersion?: string;
  deploymentEnvironment?: string;
  installationId?: string;
  productVersion?: string;
  runtimeDistribution?: "source" | "development_bundle" | "packaged" | "unknown";
  runtimeSurface: ModelApiRuntimeSurface;
  serviceInstanceId: string;
  serviceName: string;
}

export type ModelApiOperationKind =
  | "messages"
  | "chat_completions"
  | "responses"
  | "generate_content"
  | "unknown";

export type ModelCallFailureStage =
  | "resolve_target"
  | "attempts"
  | "fallback"
  | "aggregate"
  | "unhandled";

export type ModelAttemptFailureStage =
  | "configuration"
  | "connect"
  | "response"
  | "stream"
  | "parse"
  | "validation"
  | "unhandled";

// Provider/SDK 实际返回的有界结束原因：保持原字符串，不在领域层折叠成 other。
export type ModelFinishReason = string;

export interface ResolvedModelTelemetryDescriptor {
  providerId: string;
  providerKind: string;
  providerOrigin?: string;
  providerRoute?: string;
  reasoning: ModelReasoningObservation;
  requestedModel: string;
}

export interface ResponseModelTelemetryDescriptor {
  model: string;
}

export type ModelCallTraceStart = {
  logicalCallId: string;
  modelRole?: string;
  operation: ModelApiOperation;
  requested: ResolvedModelTelemetryDescriptor;
  streaming: boolean;
} & (
  | {
      callCause: "initial";
      previousLogicalCallId?: never;
    }
  | {
      callCause: Exclude<ModelApiCallCause, "initial">;
      previousLogicalCallId: string;
    }
);

export type ModelAttemptTraceStart = {
  apiOperation: ModelApiOperationKind;
  attemptNumber: number;
  maxAttempts: number;
  requestId: string;
  target: ResolvedModelTelemetryDescriptor;
  transport: import("../model/index.js").ModelTransportKind;
} & (
  | {
      attemptCause: "initial";
      previousRequestId?: never;
      retryDelayMs?: never;
    }
  | {
      attemptCause: "retry" | "fallback";
      previousRequestId: string;
      retryDelayMs?: number;
    }
);

export interface ModelCallSpanWriter extends AgentTelemetryScope {
  startAttempt(input: ModelAttemptTraceStart): ModelAttemptSpanWriter;
  markFallbackSelected(reason: string): void;
  finishCompleted(): void;
  finishFailed(
    stage: ModelCallFailureStage,
    category: AgentTelemetryErrorCategory,
    error?: unknown,
  ): void;
  finishAbandoned(reason: AgentTelemetryAbandonReason): void;
  finishCancelled(reason: AgentTelemetryCancellationReason): void;
}

export interface ModelAttemptSpanWriter extends AgentTelemetryScope {
  setProviderRequestId(requestId: string): void;
  setResponseModel(model: ResponseModelTelemetryDescriptor): void;
  setEffectiveReasoningState(state: ModelReasoningState): void;
  setEffectiveReasoningControl(control: ModelReasoningControlType): void;
  setEffectiveReasoningLevel(level: string): void;
  setEffectiveReasoningBudgetTokens(tokens: number): void;
  setFinishReason(reason: ModelFinishReason): void;
  setInputTokens(tokens: number): void;
  setOutputTokens(tokens: number): void;
  setReasoningTokens(tokens: number): void;
  setCacheReadTokens(tokens: number): void;
  setCacheWriteTokens(tokens: number): void;
  setStreamOutputCommitted(committed: boolean): void;
  setHttpStatusCode(statusCode: number): void;
  setProviderErrorCode(code: string): void;
  setProviderErrorMessage(message: string): void;
  setRetryAfterMs(delayMs: number): void;
  markFirstProviderEvent(): void;
  markFirstContent(): void;
  markFirstText(): void;
  markStreamStalled(idleMs: number): void;
  finishCompleted(): void;
  finishFailed(
    stage: ModelAttemptFailureStage,
    category: AgentTelemetryErrorCategory,
    error?: unknown,
  ): void;
  finishAbandoned(reason: AgentTelemetryAbandonReason): void;
  finishCancelled(reason: AgentTelemetryCancellationReason): void;
}

export interface ModelExecutionTelemetryPort {
  startCall(input: ModelCallTraceStart): ModelCallSpanWriter;
}

// App 注入与 Standalone 初始化共用的进程级 Owner：一个 CLI 进程只创建一个。
export interface AgentTelemetryRuntimeOwner {
  readonly agentExecution: AgentExecutionTelemetryPort;
  readonly enabled: boolean;
  readonly modelExecution: ModelExecutionTelemetryPort;
  readonly statusSink?: import("../model/index.js").ModelStatusSink;
  abandonSession(sessionId: string): void;
  flush(options?: { timeoutMs?: number }): Promise<void>;
  shutdown(options?: { timeoutMs?: number }): Promise<void>;
  updateIdentity(snapshot: TelemetryIdentitySnapshot): void;
}

export interface ModelApiCallDescriptor {
  observation: Required<
    Pick<ModelApiCallObservation, "operation" | "actorKind" | "logicalCallId">
  > &
    ModelApiCallObservation;
  providerId: ModelProviderId;
  modelId: ModelId;
}
