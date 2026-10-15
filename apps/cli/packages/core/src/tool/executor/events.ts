import {
  SessionEventType,
  createRootTraceContext,
  traceContextToLogContext,
  type PermissionBrokerResult,
  type PermissionOptionsPolicy,
  type PermissionUpdate,
  type SessionEvent,
  type ToolResultDisplayPayload,
  type ToolSideEffectScope,
  type ToolExecutionTelemetry,
  type SkillTelemetryMetadata,
  type TraceContext,
  type TurnId,
} from "@knorvia/contracts";
import type { PermissionContext } from "../../permission/service.js";
import type { ExecutableToolCall, ToolExecutionResult, ToolResultSerialization } from "../types.js";
import type { ToolExecutorDeps } from "./types.js";
import { summarizeInput } from "./utils.js";

type Deps = ToolExecutorDeps;
type ToolCall = ExecutableToolCall;
type Trace = TraceContext;
type OptionalTurnId = TurnId | undefined;
type ToolCallId = string;
type RequestId = string;
type TimestampMs = number;
type OptionalText = string | undefined;
type EventType = (typeof SessionEventType)[keyof typeof SessionEventType];
type EmitResult = Promise<void>;
type ToolOutcome = ToolExecutionResult;
type ToolError = ToolExecutionResult["error"];
type EventDisplay = ToolResultDisplayPayload;
type OptionalDisplay = ToolResultDisplayPayload | undefined;
type OptionalPerf = ToolExecutionTelemetry | undefined;
type OptionalSkillMetadata = SkillTelemetryMetadata | undefined;
type ResultSerialization = ToolResultSerialization;

const INITIAL_SEQUENCE_NUMBER = 0;

// 会话事件信封：所有工具事件共用的七个字段，payload 由各 emit 函数补。
// turnId 的取法留在调用方：多数入口直接用参数，权限类入口回退到 deps.turnId。
function eventEnvelope(deps: Deps, type: EventType, traceContext: Trace, turnId: OptionalTurnId) {
  const envelope = {} as Record<string, unknown>;
  envelope.id = crypto.randomUUID() as any;
  envelope.sessionId = deps.sessionId;
  envelope.turnId = turnId;
  envelope.type = type;
  envelope.timestamp = new Date();
  envelope.traceId = traceContext.traceId;
  envelope.sequenceNumber = INITIAL_SEQUENCE_NUMBER;
  return envelope;
}

// 发事件：信封 + 负载拼在一起，六个 emit 函数共用同一条出口。
async function emitWithPayload(
  deps: Deps,
  type: EventType,
  traceContext: Trace,
  turnId: OptionalTurnId,
  payload: Record<string, unknown>,
): EmitResult {
  const event = { ...eventEnvelope(deps, type, traceContext, turnId), payload } as SessionEvent;
  await deps.emitEvent(event);
}

export async function emitToolCallStarted(
  deps: Deps,
  toolCall: ToolCall,
  traceContext: Trace,
  turnId: OptionalTurnId,
  startTime: TimestampMs,
  display?: EventDisplay,
  // 解析后的副作用能力与权限判定同源：订阅者据此在工具动手前就知道「要写了」。
  capability?: ToolSideEffectCapability,
): EmitResult {
  await emitWithPayload(
    deps,
    SessionEventType.ToolCallStarted,
    traceContext,
    turnId,
    startedPayload(toolCall, startTime, display, capability),
  );
}

export async function emitToolCallResult(
  deps: Deps,
  toolCall: ToolCall,
  traceContext: Trace,
  turnId: OptionalTurnId,
  serialization: ResultSerialization,
  durationMs: TimestampMs,
  display: OptionalDisplay,
  perf: OptionalPerf,
  skillMetadata: OptionalSkillMetadata,
): EmitResult {
  await emitWithPayload(
    deps,
    SessionEventType.ToolCallResult,
    traceContext,
    turnId,
    resultPayload(toolCall, serialization, durationMs, display, perf, skillMetadata),
  );
}

export async function emitToolCallError(
  deps: Deps,
  toolCallId: ToolCallId,
  traceContext: Trace,
  turnId: OptionalTurnId,
  error: ToolError,
  skillMetadata?: OptionalSkillMetadata,
): EmitResult {
  await emitWithPayload(
    deps,
    SessionEventType.ToolCallError,
    traceContext,
    turnId,
    errorPayload(toolCallId, error, skillMetadata),
  );
}

export async function emitSkippedToolError(
  deps: Deps,
  result: ToolOutcome,
  traceContext?: Trace,
): EmitResult {
  const eventTraceContext = resolveEventTraceContext(deps, traceContext);
  const turnId = eventTraceContext.turnId ?? deps.turnId;

  await emitToolCallError(deps, result.toolCallId, eventTraceContext, turnId, result.error);

  deps.logger?.warn(SKIPPED_TOOL_LOG_MESSAGE, skippedToolLogContext(result, eventTraceContext));
}

export async function emitPermissionRequested(
  deps: Deps,
  toolCall: ToolCall,
  input: unknown,
  requestId: RequestId,
  riskLevel: PermissionContext["riskLevel"],
  reason: OptionalText,
  suggestedPermissionUpdates: PermissionUpdate[],
  traceContext: Trace,
  approval?: { display?: ToolResultDisplayPayload; optionsPolicy?: PermissionOptionsPolicy },
): EmitResult {
  await emitWithPayload(
    deps,
    SessionEventType.PermissionRequested,
    traceContext,
    traceContext.turnId ?? deps.turnId,
    permissionRequestedPayload(deps, {
      toolCall,
      input,
      requestId,
      riskLevel,
      reason,
      suggestedPermissionUpdates,
      approval,
    }),
  );
}

export async function emitPermissionResolved(
  deps: Deps,
  toolCall: ToolCall,
  requestId: RequestId,
  decision: PermissionBrokerResult,
  traceContext: Trace,
): EmitResult {
  await emitWithPayload(
    deps,
    SessionEventType.PermissionResolved,
    traceContext,
    traceContext.turnId ?? deps.turnId,
    permissionResolvedPayload(toolCall, requestId, decision),
  );
}

export async function emitPermissionDenied(
  deps: Deps,
  toolCall: ToolCall,
  reason: OptionalText,
  traceContext: Trace,
): EmitResult {
  await emitWithPayload(
    deps,
    SessionEventType.PermissionDenied,
    traceContext,
    traceContext.turnId ?? deps.turnId,
    permissionDeniedPayload(toolCall, reason),
  );
}

// 以下四个负载构造器把「字段拼接」从 emit 函数里挪出来：emit 只负责发事件。
// 返回 Record<string, unknown> 而不是 interface —— 事件的 payload 参数就是这个形状。

function errorPayload(
  toolCallId: ToolCallId,
  error: ToolError,
  skillMetadata: OptionalSkillMetadata,
): Record<string, unknown> {
  const payload = {} as Record<string, unknown>;
  payload.toolCallId = toolCallId;
  payload.error = error;
  if (skillMetadata) payload.skillMetadata = skillMetadata;
  return payload;
}

function permissionRequestedPayload(
  deps: Deps,
  request: {
    toolCall: ToolCall;
    input: unknown;
    requestId: RequestId;
    riskLevel: PermissionContext["riskLevel"];
    reason: OptionalText;
    suggestedPermissionUpdates: PermissionUpdate[];
    approval:
      | { display?: ToolResultDisplayPayload; optionsPolicy?: PermissionOptionsPolicy }
      | undefined;
  },
): Record<string, unknown> {
  const payload = {} as Record<string, unknown>;
  payload.requestId = request.requestId;
  payload.toolCallId = request.toolCall.id;
  payload.toolName = request.toolCall.name;
  payload.riskLevel = request.riskLevel;
  payload.reason = request.reason ?? `Tool ${request.toolCall.name} requires approval`;
  payload.input = request.input;
  payload.suggestedPermissionUpdates = request.suggestedPermissionUpdates;
  if (request.approval?.display) payload.display = request.approval.display;
  if (request.approval?.optionsPolicy) payload.optionsPolicy = request.approval.optionsPolicy;
  if (deps.sessionModePort?.supportsPermissionFullAccess?.() === true) {
    payload.fullAccessSupported = true;
  }
  return payload;
}

function permissionResolvedPayload(
  toolCall: ToolCall,
  requestId: RequestId,
  decision: PermissionBrokerResult,
): Record<string, unknown> {
  const payload = {} as Record<string, unknown>;
  payload.requestId = requestId;
  payload.toolCallId = toolCall.id;
  payload.decision = decision.decision;
  payload.reason = decision.reason;
  payload.modifiedInput = decision.modifiedInput;
  return payload;
}

function permissionDeniedPayload(
  toolCall: ToolCall,
  reason: OptionalText,
): Record<string, unknown> {
  const payload = {} as Record<string, unknown>;
  payload.toolCallId = toolCall.id;
  payload.toolName = toolCall.name;
  payload.reason = reason ?? `Permission denied for ${toolCall.name}`;
  payload.inputSummary = summarizeInput(toolCall.input);
  return payload;
}

/** 解析后的副作用能力；订阅者据此在工具动手前知道「要写了」。 */
type ToolSideEffectCapability = {
  readOnly?: boolean;
  sideEffectScope?: ToolSideEffectScope;
};

const SKIPPED_TOOL_LOG_MESSAGE = "Tool call skipped after blocking failure";
const SKIPPED_TOOL_LOG_EVENT = "tool.call.skipped";
const TOOL_EXECUTOR_MODULE = "core.tool.executor";
const FAILED_LOG_STATUS = "failed";

function startedPayload(
  toolCall: ToolCall,
  startTime: TimestampMs,
  display: OptionalDisplay,
  capability: ToolSideEffectCapability | undefined,
): Record<string, unknown> {
  const payload = {} as Record<string, unknown>;
  payload.toolCallId = toolCall.id;
  payload.toolName = toolCall.name;
  payload.startedAt = new Date(startTime);
  payload.display = display;
  // 能力字段只在真的解析出来时才出现，未解析与「解析为无能力」在事件里可区分。
  if (capability?.readOnly !== undefined) payload.readOnly = capability.readOnly;
  if (capability?.sideEffectScope !== undefined) {
    payload.sideEffectScope = capability.sideEffectScope;
  }
  return payload;
}

function resultPayload(
  toolCall: ToolCall,
  serialization: ResultSerialization,
  durationMs: TimestampMs,
  display: OptionalDisplay,
  perf: OptionalPerf,
  skillMetadata: OptionalSkillMetadata,
): Record<string, unknown> {
  const payload = {} as Record<string, unknown>;
  payload.toolCallId = toolCall.id;
  if (skillMetadata) payload.skillMetadata = skillMetadata;
  payload.result = resultBody(serialization, display, perf);
  payload.duration = durationMs;
  return payload;
}

// 成功结果的正文：字节账与截断策略都从序列化结果里取，不在这里重算。
function resultBody(
  serialization: ResultSerialization,
  display: OptionalDisplay,
  perf: OptionalPerf,
): Record<string, unknown> {
  const body = {} as Record<string, unknown>;
  body.success = true;
  body.content = serialization.content;
  body.display = display;
  body.perf = perf;
  body.truncated = serialization.truncated;
  body.originalBytes = serialization.originalBytes;
  body.returnedBytes = serialization.returnedBytes;
  body.budgetStrategy = serialization.budgetStrategy;
  body.artifactPath = serialization.artifactPath;
  return body;
}

// 跳过工具的日志上下文：trace 字段展开在前，事件与模块标识随后，最后是被跳过的工具身份。
function skippedToolLogContext(
  result: ToolOutcome,
  traceContext: TraceContext,
): Record<string, unknown> {
  const context = { ...traceContextToLogContext(traceContext) } as Record<string, unknown>;
  context.event = SKIPPED_TOOL_LOG_EVENT;
  context.module = TOOL_EXECUTOR_MODULE;
  context.status = FAILED_LOG_STATUS;
  context.toolCallId = result.toolCallId;
  context.toolName = result.toolName;
  return context;
}

// 事件用的 trace 上下文：优先用调用方给的，其次复用执行器上下文，最后按会话根重建。
function resolveEventTraceContext(deps: Deps, traceContext: Trace | undefined): Trace {
  if (traceContext !== undefined) return traceContext;
  if (deps.traceContext !== undefined) return deps.traceContext;
  return createRootTraceContext({ sessionId: deps.sessionId, turnId: deps.turnId });
}
