import {
  SessionEventType,
  createRootTraceContext,
  traceContextToLogContext,
  type PermissionBrokerResult,
  type PermissionOptionsPolicy,
  type PermissionUpdate,
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

const INITIAL_SEQUENCE_NUMBER = 0;

// 会话事件信封：所有工具事件共用的七个字段，payload 由各 emit 函数补。
// turnId 的取法留在调用方：多数入口直接用参数，权限类入口回退到 deps.turnId。
function eventEnvelope(deps: Deps, type: EventType, traceContext: Trace, turnId: OptionalTurnId) {
  return {
    id: crypto.randomUUID() as any,
    sessionId: deps.sessionId,
    turnId,
    type,
    timestamp: new Date(),
    traceId: traceContext.traceId,
    sequenceNumber: INITIAL_SEQUENCE_NUMBER,
  };
}

export async function emitToolCallStarted(
  deps: Deps,
  toolCall: ToolCall,
  traceContext: Trace,
  turnId: OptionalTurnId,
  startTime: TimestampMs,
  display?: ToolResultDisplayPayload,
  // 解析后的副作用能力（与权限判定同源）：订阅者据此在工具动手前知道「要写了」。
  capability?: { readOnly?: boolean; sideEffectScope?: ToolSideEffectScope },
): Promise<void> {
  await deps.emitEvent({
    ...eventEnvelope(deps, SessionEventType.ToolCallStarted, traceContext, turnId),
    payload: {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      startedAt: new Date(startTime),
      display,
      ...(capability?.readOnly === undefined ? {} : { readOnly: capability.readOnly }),
      ...(capability?.sideEffectScope === undefined
        ? {}
        : { sideEffectScope: capability.sideEffectScope }),
    },
  });
}

export async function emitToolCallResult(
  deps: Deps,
  toolCall: ToolCall,
  traceContext: Trace,
  turnId: OptionalTurnId,
  serialization: ToolResultSerialization,
  durationMs: TimestampMs,
  display: ToolResultDisplayPayload | undefined,
  perf: ToolExecutionTelemetry | undefined,
  skillMetadata: SkillTelemetryMetadata | undefined,
): Promise<void> {
  await deps.emitEvent({
    ...eventEnvelope(deps, SessionEventType.ToolCallResult, traceContext, turnId),
    payload: {
      toolCallId: toolCall.id,
      ...(skillMetadata ? { skillMetadata } : {}),
      result: {
        success: true,
        content: serialization.content,
        display,
        perf,
        truncated: serialization.truncated,
        originalBytes: serialization.originalBytes,
        returnedBytes: serialization.returnedBytes,
        budgetStrategy: serialization.budgetStrategy,
        artifactPath: serialization.artifactPath,
      },
      duration: durationMs,
    },
  });
}

export async function emitToolCallError(
  deps: Deps,
  toolCallId: ToolCallId,
  traceContext: Trace,
  turnId: OptionalTurnId,
  error: ToolExecutionResult["error"],
  skillMetadata?: SkillTelemetryMetadata,
): Promise<void> {
  await deps.emitEvent({
    ...eventEnvelope(deps, SessionEventType.ToolCallError, traceContext, turnId),
    payload: errorPayload(toolCallId, error, skillMetadata),
  });
}

export async function emitSkippedToolError(
  deps: Deps,
  result: ToolExecutionResult,
  traceContext?: Trace,
): Promise<void> {
  const eventTraceContext =
    traceContext ??
    deps.traceContext ??
    createRootTraceContext({ sessionId: deps.sessionId, turnId: deps.turnId });
  const turnId = eventTraceContext.turnId ?? deps.turnId;

  await emitToolCallError(deps, result.toolCallId, eventTraceContext, turnId, result.error);

  deps.logger?.warn("Tool call skipped after blocking failure", {
    ...traceContextToLogContext(eventTraceContext),
    event: "tool.call.skipped",
    module: "core.tool.executor",
    status: "failed",
    toolCallId: result.toolCallId,
    toolName: result.toolName,
  });
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
): Promise<void> {
  await deps.emitEvent({
    ...eventEnvelope(
      deps,
      SessionEventType.PermissionRequested,
      traceContext,
      traceContext.turnId ?? deps.turnId,
    ),
    payload: permissionRequestedPayload(deps, {
      toolCall,
      input,
      requestId,
      riskLevel,
      reason,
      suggestedPermissionUpdates,
      approval,
    }),
  });
}

export async function emitPermissionResolved(
  deps: Deps,
  toolCall: ToolCall,
  requestId: RequestId,
  decision: PermissionBrokerResult,
  traceContext: Trace,
): Promise<void> {
  await deps.emitEvent({
    ...eventEnvelope(
      deps,
      SessionEventType.PermissionResolved,
      traceContext,
      traceContext.turnId ?? deps.turnId,
    ),
    payload: permissionResolvedPayload(toolCall, requestId, decision),
  });
}

export async function emitPermissionDenied(
  deps: Deps,
  toolCall: ToolCall,
  reason: OptionalText,
  traceContext: Trace,
): Promise<void> {
  await deps.emitEvent({
    ...eventEnvelope(
      deps,
      SessionEventType.PermissionDenied,
      traceContext,
      traceContext.turnId ?? deps.turnId,
    ),
    payload: permissionDeniedPayload(toolCall, reason),
  });
}

// 以下四个负载构造器把「字段拼接」从 emit 函数里挪出来：emit 只负责发事件。
// 返回 Record<string, unknown> 而不是 interface —— 事件的 payload 参数就是这个形状。

function errorPayload(
  toolCallId: ToolCallId,
  error: ToolExecutionResult["error"],
  skillMetadata: SkillTelemetryMetadata | undefined,
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
