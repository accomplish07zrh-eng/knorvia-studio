// SPDX-License-Identifier: Apache-2.0
// 遥测端口模块：声明面（构造入参、埋点入参、门面身份快照）+ 默认空实现端口。
// 门面实现见 runtime-telemetry.ts，归类规则见 runtime-telemetry-classify.ts。
import type {
  AgentExecutionTelemetryPort,
  AgentStepSpanWriter,
  AgentTelemetryActorKind,
  AgentTelemetryCausation,
  AgentTelemetryLaunchSurface,
  AgentTurnSpanWriter,
  CommandExecutionSpanWriter,
  CompactionTraceStart,
  ContextCompactionSpanWriter,
  DetachedOperationSpanWriter,
  DetachedOperationTraceStart,
  MessageId,
  ModelAttemptSpanWriter,
  ModelCallSpanWriter,
  SessionId,
  SessionTaskType,
  SyntheticUserMessageSource,
  ToolExecutionSpanWriter,
  TraceContext,
} from "@knorvia/contracts";

/** 门面身份部分：会话必填，身份信息可选。 */
export interface RuntimeTelemetryFacadeIdentity {
  agentName?: string;
  launchSurface?: AgentTelemetryLaunchSurface;
  parentSessionId?: SessionId;
  sessionId: SessionId;
}

/** 因果部分：可选，用于把子会话挂到父链上。 */
export interface RuntimeTelemetryFacadeCausation {
  causation?: AgentTelemetryCausation;
  causationMode?: "child" | "linked_root";
}

/** 端口与任务类型部分：缺省时回落空实现与主会话演员。 */
export interface RuntimeTelemetryFacadePort {
  port?: AgentExecutionTelemetryPort;
  taskType?: SessionTaskType;
}

/** 门面构造入参：三段组合。 */
export type RuntimeTelemetryFacadeOptions = RuntimeTelemetryFacadeIdentity &
  RuntimeTelemetryFacadeCausation &
  RuntimeTelemetryFacadePort;
/** 回合埋点入参。 */
export interface TurnRequest {
  inputSource?: SyntheticUserMessageSource;
  traceContext: TraceContext;
  turnNumber: number;
}

/** 步骤埋点入参。 */
export interface StepRequest {
  stepId: MessageId;
  stepIndex: number;
}

/** 压缩埋点入参。 */
export type CompactionRequest = CompactionTraceStart & { traceContext?: TraceContext };

/** 分离操作埋点入参：因果与执行上下文由门面补齐。 */
export type DetachedRequest = Omit<DetachedOperationTraceStart, "causation" | "context"> & {
  causation?: AgentTelemetryCausation;
  traceContext: TraceContext;
};

/** 门面身份快照：按固定顺序取出门面持有的身份字段。 */
export type FacadeIdentity = readonly [
  actorKind: AgentTelemetryActorKind,
  agentName: string | undefined,
  launchSurface: AgentTelemetryLaunchSurface,
  parentSessionId: string | undefined,
  parentTurnId: string | undefined,
  sessionId: SessionId,
];

/** 作用域基础实现：不记录因果，run 直接执行。 */
const SCOPE_BASE = {
  captureCausation: () => undefined,
  run: <TValue>(execute: () => TValue): TValue => execute(),
};

/** 把方法名表展开成空方法表（无副作用、无返回）。 */
const voidMethods = (names: readonly string[]): Record<string, () => void> =>
  Object.fromEntries(names.map((name) => [name, () => {}]));

const NOOP_COMMAND = {
  ...SCOPE_BASE,
  ...voidMethods([
    "finishBackgrounded",
    "finishCancelled",
    "finishCompleted",
    "finishFailed",
    "markFirstOutput",
    "markTerminationRequested",
    "setExitCode",
    "setOutputBytes",
    "setSignal",
    "setTimedOut",
  ]),
} as unknown as CommandExecutionSpanWriter;

const NOOP_TOOL = {
  ...SCOPE_BASE,
  ...voidMethods([
    "finishCancelled",
    "finishCompleted",
    "finishDenied",
    "finishFailed",
    "markPermissionRequested",
    "setOutputBytes",
    "setOutputTruncated",
    "setPermissionDecision",
  ]),
  startCommand: () => NOOP_COMMAND,
} as unknown as ToolExecutionSpanWriter;

const NOOP_STEP = {
  ...SCOPE_BASE,
  ...voidMethods(["finishCancelled", "finishCompleted", "finishDiscarded", "finishFailed"]),
} as unknown as AgentStepSpanWriter;

const NOOP_TURN = {
  ...SCOPE_BASE,
  ...voidMethods(["finishCancelled", "finishCompleted", "finishFailed"]),
} as unknown as AgentTurnSpanWriter;

const NOOP_COMPACTION = {
  ...SCOPE_BASE,
  ...voidMethods([
    "finishCancelled",
    "finishCompleted",
    "finishDiscarded",
    "finishFailed",
    "markFallbackSelected",
    "setInputTokens",
    "setOutputTokens",
  ]),
} as unknown as ContextCompactionSpanWriter;

const NOOP_DETACHED = {
  ...SCOPE_BASE,
  ...voidMethods(["finishCancelled", "finishCompleted", "finishFailed", "setResultType"]),
} as unknown as DetachedOperationSpanWriter;

const NOOP_ATTEMPT = {
  ...SCOPE_BASE,
  ...voidMethods([
    "finishAbandoned",
    "finishCancelled",
    "finishCompleted",
    "finishFailed",
    "markFirstContent",
    "markFirstProviderEvent",
    "markFirstText",
    "markStreamStalled",
    "setCacheReadTokens",
    "setCacheWriteTokens",
    "setEffectiveReasoningBudgetTokens",
    "setEffectiveReasoningControl",
    "setEffectiveReasoningLevel",
    "setEffectiveReasoningState",
    "setFinishReason",
    "setHttpStatusCode",
    "setInputTokens",
    "setOutputTokens",
    "setProviderErrorCode",
    "setProviderErrorMessage",
    "setProviderRequestId",
    "setReasoningTokens",
    "setResponseModel",
    "setRetryAfterMs",
    "setStreamOutputCommitted",
  ]),
} as unknown as ModelAttemptSpanWriter;

const NOOP_CALL = {
  ...SCOPE_BASE,
  ...voidMethods([
    "finishAbandoned",
    "finishCancelled",
    "finishCompleted",
    "finishFailed",
    "markFallbackSelected",
  ]),
  startAttempt: () => NOOP_ATTEMPT,
} as unknown as ModelCallSpanWriter;

/** 默认遥测端口：所有写入都是空操作，读取因果返回 undefined。 */
export const NOOP_AGENT_EXECUTION_TELEMETRY: AgentExecutionTelemetryPort = {
  abandonSession: () => {},
  captureCausation: () => undefined,
  startCompaction: () => NOOP_COMPACTION,
  startDetachedOperation: () => NOOP_DETACHED,
  startStep: () => NOOP_STEP,
  startTool: () => NOOP_TOOL,
  startTurn: () => NOOP_TURN,
};
