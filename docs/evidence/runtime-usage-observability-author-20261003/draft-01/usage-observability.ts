import type { MessageId, Model, SessionEvent, TraceContext, TurnId, UsageStorePort } from "@knorvia/contracts";
import {
  CoreErrorType,
  SessionEventType,
  createModelUsageSummaryFromEvents,
  isCoreError,
  traceContextToLogContext,
} from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RuntimeModelTextResult } from "../types.js";
import { isModelContextExceededError } from "../helpers/index.js";

type ModelUsageQuerySource = "main_turn" | "compact" | "session_title" | "goal_completion_verification" | string;

interface RecordModelUsageInput {
  assistantMessageId?: MessageId;
  attemptIndex?: number;
  error?: unknown;
  events: readonly SessionEvent[];
  model: Model;
  networkEventStartIndex: number;
  parentUserMessageId?: MessageId;
  querySource: ModelUsageQuerySource;
  result?: RuntimeModelTextResult;
  startedAt: number;
  status: "completed" | "error" | "cancelled";
  toolCallCount?: number;
  traceContext: TraceContext;
}

interface RecordTurnUsageInput {
  completedAt: number;
  error?: unknown;
  events: readonly SessionEvent[];
  startedAt: number;
  status: "completed" | "error" | "cancelled";
  traceContext: TraceContext;
  turnId: TurnId;
  userMessageId?: MessageId;
}

interface ModelNetworkObservation {
  type: string;
  message?: string;
  retryable?: boolean;
  reason?: string;
}

interface UsageErrorInfo {
  code?: string;
  message?: string;
  retryable?: boolean;
  type?: string;
}

interface ToolUsagePayload {
  toolCallId?: unknown;
  toolName?: unknown;
  decision?: unknown;
  startedAt?: unknown;
  outputBytes?: unknown;
  stdoutBytes?: unknown;
  stderrBytes?: unknown;
  duration?: unknown;
  result?: {
    perf?: { detail?: { kind?: string; command?: { exitCode?: unknown } } };
    returnedBytes?: unknown;
    originalBytes?: unknown;
    truncated?: unknown;
  };
  error?: { type?: unknown; code?: unknown; message?: unknown };
}

function modelNetworkObservations(events: readonly SessionEvent[]): ModelNetworkObservation[] {
  return events
    .filter((event) => event.type === SessionEventType.ModelNetworkStatus)
    .map((event) => event.payload)
    .filter((payload) => payload && typeof payload === "object" && "type" in payload) as ModelNetworkObservation[];
}

function firstModelTokenAt(events: readonly SessionEvent[], startIndex: number): number | undefined {
  const first = events.slice(startIndex).find((event) => {
    if (event.type !== SessionEventType.ModelStreaming) return false;
    const payload = event.payload as { kind?: string; delta?: { length: number } };
    return (payload.kind === "text_delta" || payload.kind === "reasoning_delta") &&
      !!payload.delta && payload.delta.length > 0;
  });
  return first?.timestamp.getTime();
}

function usageErrorInfo(error: unknown, failed: ModelNetworkObservation | undefined): UsageErrorInfo {
  if (isCoreError(error)) {
    return { code: error.code, message: error.message, retryable: error.retryable, type: error.type };
  }
  if (error instanceof Error) {
    return { message: error.message, retryable: failed?.retryable, type: failed?.reason ?? error.name };
  }
  if (failed) {
    return { message: failed.message, retryable: failed.retryable, type: failed.reason };
  }
  return {};
}

function nonemptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function usageCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export async function recordModelUsageFact(runtime: AgentRuntimeInternal, input: RecordModelUsageInput): Promise<void> {
  const candidate = runtime.sessionStore as typeof runtime.sessionStore & Partial<UsageStorePort>;
  if (!candidate?.recordModelUsage || !candidate.upsertTurnUsage || !candidate.upsertToolUsage || !candidate.pruneUsage) return;

  const completedAt = Date.now();
  const usage = input.result?.usage;
  const network = modelNetworkObservations(input.events.slice(input.networkEventStartIndex));
  const retryCount = network.filter((observation) => observation.type === "model_retry_scheduled").length;
  const failures = network.filter((observation) => observation.type === "model_request_failed");
  const failed = failures[failures.length - 1];
  const firstTokenAt = firstModelTokenAt(input.events, input.networkEventStartIndex);
  const durationMs = completedAt - input.startedAt;
  const errorInfo = usageErrorInfo(input.error, failed);
  const contextExceeded = isModelContextExceededError(input.error) || failed?.reason === "context_exceeded";

  try {
    await candidate.recordModelUsage({
      id: `usage_model_${input.querySource}_${input.assistantMessageId ?? input.traceContext.spanId ?? `${input.querySource}_${input.startedAt}`}_${input.attemptIndex ?? 0}`,
      logicalRequestId: input.assistantMessageId ?? input.traceContext.spanId ?? `${input.querySource}:${input.startedAt}`,
      attemptIndex: input.attemptIndex,
      sessionID: runtime.sessionId,
      turnID: input.traceContext.turnId,
      traceID: input.traceContext.traceId,
      spanID: input.traceContext.spanId,
      assistantMessageID: input.assistantMessageId,
      parentUserMessageID: input.parentUserMessageId,
      querySource: input.querySource,
      providerId: input.model.providerId,
      modelId: input.model.modelId,
      reasoningLevel: input.model.options.reasoningLevel,
      agent: runtime.config.agentName ?? "agent",
      mode: runtime.config.mode ?? "build",
      taskType: runtime.config.taskType ?? "interactive",
      status: input.status,
      startedAt: input.startedAt,
      firstTokenAt,
      completedAt,
      durationMs,
      timeToFirstTokenMs: firstTokenAt === undefined ? undefined : firstTokenAt - input.startedAt,
      finishReason: input.result?.finishReason,
      toolCallCount: input.toolCallCount ?? 0,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      reasoningTokens: usage?.reasoningTokens,
      cacheCreationInputTokens: usage?.cacheWriteTokens,
      cacheReadInputTokens: usage?.cacheReadTokens,
      providerTotalTokens: usage?.totalTokens,
      retryCount,
      retryable: errorInfo.retryable ?? retryCount > 0,
      cancelledByUser: input.status === "cancelled",
      contextExceeded,
      errorType: errorInfo.type,
      errorCode: errorInfo.code,
      errorMessage: errorInfo.message,
      rawUsage: usage,
      providerMetadata: input.result?.providerMetadata,
    });
  } catch (error) {
    runtime.logger?.warn("Usage model fact write failed", {
      ...traceContextToLogContext(input.traceContext),
      errorMessage: error instanceof Error ? error.message : String(error),
      event: "usage.model.write.failed",
      module: "core.runtime",
      status: "failed",
    });
  }
}

export async function recordTurnUsageFact(runtime: AgentRuntimeInternal, input: RecordTurnUsageInput): Promise<void> {
  const candidate = runtime.sessionStore as typeof runtime.sessionStore & Partial<UsageStorePort>;
  if (!candidate?.recordModelUsage || !candidate.upsertTurnUsage || !candidate.upsertToolUsage || !candidate.pruneUsage) return;

  const summary = createModelUsageSummaryFromEvents(input.events);
  const modelRequests = input.events.filter((event) => event.type === SessionEventType.ModelRequest);
  const firstModelStartAt = modelRequests[0]?.timestamp.getTime();
  const firstTokenAt = firstModelTokenAt(input.events, 0);
  const scheduled = new Set<unknown>();
  const errors = new Set<unknown>();
  for (const event of input.events) {
    if (event.type === SessionEventType.ToolCallScheduled && (event.payload as ToolUsagePayload).toolCallId) {
      scheduled.add((event.payload as ToolUsagePayload).toolCallId);
    }
    if (event.type === SessionEventType.ToolCallError && (event.payload as ToolUsagePayload).toolCallId) {
      errors.add((event.payload as ToolUsagePayload).toolCallId);
    }
  }
  const errorInfo = usageErrorInfo(input.error, undefined);
  const contextExceeded = isModelContextExceededError(input.error);

  try {
    await candidate.upsertTurnUsage({
      sessionID: runtime.sessionId,
      turnID: input.turnId,
      traceID: input.traceContext.traceId,
      userMessageID: input.userMessageId,
      status: input.status,
      startedAt: input.startedAt,
      firstModelStartAt,
      firstTokenAt,
      completedAt: input.completedAt,
      durationMs: input.completedAt - input.startedAt,
      timeToFirstTokenMs: firstTokenAt === undefined ? undefined : firstTokenAt - input.startedAt,
      modelRequestCount: modelRequests.length,
      modelRetryCount: modelNetworkObservations(input.events).filter((observation) => observation.type === "model_retry_scheduled").length,
      toolCallCount: scheduled.size,
      toolErrorCount: errors.size,
      inputTokens: summary?.inputTokens,
      outputTokens: summary?.outputTokens,
      reasoningTokens: summary?.reasoningTokens,
      cacheCreationInputTokens: summary?.cacheWriteTokens,
      cacheReadInputTokens: summary?.cacheReadTokens,
      computedTotalTokens: summary?.totalTokens,
      retryable: errorInfo.retryable,
      cancelledByUser: input.status === "cancelled",
      contextExceeded,
      errorType: errorInfo.type,
      errorCode: errorInfo.code,
    });
  } catch (error) {
    runtime.logger?.warn("Usage turn fact write failed", {
      ...traceContextToLogContext(input.traceContext),
      errorMessage: error instanceof Error ? error.message : String(error),
      event: "usage.turn.write.failed",
      module: "core.runtime",
      status: "failed",
    });
  }
}

export async function recordToolUsageFromEvent(runtime: AgentRuntimeInternal, event: SessionEvent, traceContext: TraceContext): Promise<void> {
  const candidate = runtime.sessionStore as typeof runtime.sessionStore & Partial<UsageStorePort>;
  if (!candidate?.recordModelUsage || !candidate.upsertTurnUsage || !candidate.upsertToolUsage || !candidate.pruneUsage) return;

  const payload = event.payload as ToolUsagePayload;
  const toolCallId = nonemptyString(payload.toolCallId);
  if (!toolCallId) return;
  const toolName = nonemptyString(payload.toolName) ?? "unknown";
  const metadata = runtime.registry.get(toolName)?.metadata;
  const startedAt = event.timestamp.getTime();
  const base = {
    id: `usage_tool_${runtime.sessionId}_${toolCallId}`,
    sessionID: runtime.sessionId,
    turnID: event.turnId ?? traceContext.turnId,
    traceID: event.traceId ?? traceContext.traceId,
    toolCallID: toolCallId,
    toolName,
    sideEffectScope: metadata?.sideEffectScope,
    readOnly: metadata?.readOnly,
    destructive: metadata?.destructive,
    startedAt,
  };

  try {
    if (event.type === SessionEventType.ToolCallScheduled) {
      await candidate.upsertToolUsage({ ...base, status: "running", approvalStatus: "none" });
      return;
    }
    if (event.type === SessionEventType.PermissionRequested) {
      await candidate.upsertToolUsage({ ...base, status: "running", approvalStatus: "requested" });
      return;
    }
    if (event.type === SessionEventType.PermissionResolved) {
      const decision = nonemptyString(payload.decision);
      await candidate.upsertToolUsage({ ...base, status: "running", approvalStatus: decision === "deny" ? "denied" : "allowed" });
      return;
    }
    if (event.type === SessionEventType.PermissionDenied) {
      await candidate.upsertToolUsage({ ...base, status: "error", approvalStatus: "denied" });
      return;
    }
    if (event.type === SessionEventType.ToolCallStarted) {
      const payloadStartedAt = payload.startedAt instanceof Date ? payload.startedAt.getTime() : startedAt;
      await candidate.upsertToolUsage({ ...base, startedAt: payloadStartedAt, status: "running" });
      return;
    }
    if (event.type === SessionEventType.ToolCallProgress) {
      const outputBytes = usageCount(payload.outputBytes);
      const stdoutBytes = usageCount(payload.stdoutBytes);
      const stderrBytes = usageCount(payload.stderrBytes);
      await candidate.upsertToolUsage({
        ...base,
        status: "running",
        firstOutputAt: outputBytes > 0 || stdoutBytes > 0 || stderrBytes > 0 ? event.timestamp.getTime() : undefined,
        outputBytes,
        stdoutBytes,
        stderrBytes,
      });
      return;
    }
    if (event.type === SessionEventType.ToolCallResult) {
      const result = payload.result;
      const performance = result?.perf;
      const detail = performance?.detail;
      const command = detail?.kind === "command" ? detail.command : undefined;
      await candidate.upsertToolUsage({
        ...base,
        status: "completed",
        completedAt: event.timestamp.getTime(),
        durationMs: usageCount(payload.duration),
        exitCode: usageCount(command?.exitCode),
        outputBytes: usageCount(result?.returnedBytes ?? result?.originalBytes),
        truncated: result?.truncated === true,
      });
      return;
    }
    if (event.type === SessionEventType.ToolCallError) {
      const error = payload.error;
      const errorType = nonemptyString(error?.type) ?? CoreErrorType.ToolExecutionFailed;
      await candidate.upsertToolUsage({
        ...base,
        status: errorType.includes("cancel") ? "cancelled" : "error",
        completedAt: event.timestamp.getTime(),
        cancelledByUser: errorType.includes("cancel"),
        errorType,
        errorCode: nonemptyString(error?.code),
        errorMessage: nonemptyString(error?.message),
      });
    }
  } catch (error) {
    runtime.logger?.warn("Usage tool fact write failed", {
      ...traceContextToLogContext(traceContext),
      errorMessage: error instanceof Error ? error.message : String(error),
      event: "usage.tool.write.failed",
      module: "core.runtime",
      status: "failed",
      toolCallId,
    });
  }
}
