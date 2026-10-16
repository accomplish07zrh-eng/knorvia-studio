// SPDX-License-Identifier: Apache-2.0
// 工具分部的元数据、名称边界、三态、跟进、用量、告警和嵌套模型事件。
import type { UsageStorePort } from "@knorvia/contracts";
import { createMcpToolDisplay } from "../../../tool/executor/result-display.js";
import { systemReminderAttachmentEntry } from "../../../agent/message-history.js";
import {
  COMPLETED_TOOL_PART_METADATA_SCHEMA_VERSION,
  SessionEventType,
  createPartId,
  traceContextToLogContext,
  type CompletedToolPartMetadata,
  type MessageId,
  type Model,
  type ModelToolCall,
  type ModelUsage,
  type PartId,
  type ToolCall,
  type ToolExecutionResult,
  type TraceContext,
} from "../../deps.js";
import {
  buildRepeatedToolCallReminderBody,
  buildToolCallBudgetReminderBody,
  detectRepeatedToolCallWarnings,
  detectToolCallBudgetWarning,
  requireRuntimeToolCallName,
} from "../../helpers/index.js";
import type { persistToolResultMediaAttachments } from "../../helpers/tool-result-media-persistence.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import { phrase, report } from "./m02-record.js";
import { commitTurnRequestEntries } from "./m02-continuation.js";
import type { RegularTurnLoopState } from "./m02-loop-state.js";

const SCHEMA = COMPLETED_TOOL_PART_METADATA_SCHEMA_VERSION;
const EMPTY_TOOL = "empty_tool_name";

export function mcpToolPartMetadata(
  presentation: { serverName: string; toolName: string; description?: string } | undefined,
): CompletedToolPartMetadata | undefined {
  const display = createMcpToolDisplay(presentation);
  if (!display) return undefined;
  return { schemaVersion: SCHEMA, display };
}

export function completedToolPartMetadata(result: ToolExecutionResult): CompletedToolPartMetadata {
  const raw = result.serialization;
  const serialization = raw
    ? {
        truncated: raw.truncated,
        originalBytes: raw.originalBytes,
        returnedBytes: raw.returnedBytes,
        budgetStrategy: raw.budgetStrategy,
        ...(raw.artifactPath ? { artifactPath: raw.artifactPath } : {}),
      }
    : undefined;
  // readFileState 记下模型当时读到的快照，resume 不能只靠展示文本。
  return {
    schemaVersion: SCHEMA,
    ...(result.display ? { display: result.display } : {}),
    ...(serialization ? { serialization } : {}),
    ...(result.readFileStateMetadata ? { readFileState: result.readFileStateMetadata } : {}),
  };
}

interface NameProjection {
  metadata?: Record<string, unknown>;
  toolName: string;
}

export function projectToolNameForNonEmptyBoundary(toolName: string): NameProjection {
  if (toolName.trim().length > 0) return { toolName };
  return { toolName: EMPTY_TOOL, metadata: { providerToolName: toolName } };
}

export async function persistPendingToolPart(
  runtime: AgentRuntimeInternal,
  options: {
    assistantMessageId: MessageId;
    declarationIndex: number;
    input: Record<string, unknown>;
    partID: PartId;
    toolCall: ToolCall;
    traceContext: TraceContext;
    metadata?: CompletedToolPartMetadata;
    model: Model;
  },
): Promise<void> {
  const rawName = options.toolCall.name;
  const projected =
    typeof rawName === "string" && rawName.trim().length === 0
      ? projectToolNameForNonEmptyBoundary(rawName)
      : {
          toolName: requireRuntimeToolCallName(options.toolCall, {
            logger: runtime.logger,
            model: options.model,
            source: "persistPendingToolPart",
            traceContext: options.traceContext,
          }),
        };
  await runtime.persistPart(
    {
      id: options.partID,
      sessionID: runtime.sessionId,
      messageID: options.assistantMessageId,
      type: "tool",
      callID: options.toolCall.id,
      declarationIndex: options.declarationIndex,
      tool: projected.toolName,
      metadata: { ...projected.metadata, ...options.metadata },
      state: {
        status: "pending",
        input: options.input,
        raw: JSON.stringify({ tool: projected.toolName, input: options.toolCall.input }),
      },
    },
    options.traceContext,
  );
}

export interface ToolBatchPartFacts {
  declarationIndex: number;
  partID: ReturnType<typeof createPartId>;
  input: Record<string, unknown>;
  startedAt: number;
}

type Boundary = ReturnType<typeof projectToolNameForNonEmptyBoundary>;
type Media = Awaited<ReturnType<typeof persistToolResultMediaAttachments>>;

export function runningToolBatchState(
  runtime: AgentRuntimeInternal,
  call: ToolCall,
  part: ToolBatchPartFacts,
  boundary: Boundary,
) {
  const presentation = runtime.registry.getMetadata(call.name)?.mcpPresentation;
  return {
    status: "running" as const,
    input: part.input,
    title: boundary.toolName,
    metadata: mcpToolPartMetadata(presentation) ?? {},
    time: { start: part.startedAt },
  };
}

export function completedToolBatchState(
  result: ToolExecutionResult,
  part: ToolBatchPartFacts,
  output: string,
  boundary: Boundary,
  media: Media,
) {
  return {
    status: "completed" as const,
    input: part.input,
    output,
    title: boundary.toolName,
    metadata: {
      ...completedToolPartMetadata(result),
      ...(media ? { modelContentLayout: media.modelContentLayout } : {}),
    },
    time: { start: result.startedAt.getTime(), end: result.completedAt.getTime() },
    ...(media ? { attachments: media.attachments } : {}),
  };
}

export function failedToolBatchState(
  runtime: AgentRuntimeInternal,
  result: ToolExecutionResult,
  part: ToolBatchPartFacts,
  output: string,
) {
  const presentation = runtime.registry.getMetadata(result.toolName)?.mcpPresentation;
  const modelContent = typeof result.modelContent === "string" ? result.modelContent : undefined;
  return {
    status: "error" as const,
    input: part.input,
    error: result.error?.message ?? output,
    metadata: {
      ...mcpToolPartMetadata(presentation),
      ...(modelContent !== undefined ? { modelContent } : {}),
    },
    time: { start: result.startedAt.getTime(), end: result.completedAt.getTime() },
  };
}

function previewOutput(output: unknown): string {
  if (typeof output !== "string") return "[object]";
  return output.slice(0, 50);
}

export function toolBatchResultDiagnostic(results: ToolExecutionResult[]) {
  return {
    resultCount: results.length,
    results: results.map((result) => ({
      toolName: result.toolName,
      success: result.success,
      output: previewOutput(result.output),
    })),
  };
}

export async function steerToolBatchFollowUp(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  result: ToolExecutionResult,
  traceContext: TraceContext,
): Promise<void> {
  const followUp = result.followUpUserInput;
  if (!followUp) return;
  const input = followUp.input.trim();
  if (input.length === 0) return;
  const steering = await runtime.steerTurn({
    delivery: "guide",
    expectedTurnId: state.activeTurn?.turnId,
    input,
    source: followUp.reasonSource,
    traceContext,
  });
  const shared = {
    ...traceContextToLogContext(traceContext),
    module: "core.runtime",
    reasonSource: followUp.reasonSource,
    toolCallId: result.toolCallId,
    toolName: result.toolName,
  };
  if (steering.kind === "queued") {
    report(runtime, "debug", phrase(["Queued follow-up user input ", "from tool result"]), {
      ...shared,
      event: phrase(["tool.follow_up_user_input.", "queued"]),
      pendingInputId: steering.pendingInputId,
      status: "waiting",
    });
    return;
  }
  report(runtime, "warn", phrase(["Failed to queue follow-up user input ", "from tool result"]), {
    ...shared,
    activeTurnId: steering.activeTurnId,
    event: phrase(["tool.follow_up_user_input.", "rejected"]),
    reason: steering.reason,
    status: "failed",
  });
}

function usagePort(runtime: AgentRuntimeInternal): UsageStorePort | undefined {
  const candidate = runtime.sessionStore as Partial<UsageStorePort> | undefined;
  if (!candidate?.recordModelUsage) return undefined;
  if (!candidate.upsertTurnUsage || !candidate.upsertToolUsage || !candidate.pruneUsage) return undefined;
  return candidate as UsageStorePort;
}

function outputBytes(result: ToolExecutionResult): number | undefined {
  if (result.serialization) return result.serialization.returnedBytes;
  if (typeof result.output === "string") return new TextEncoder().encode(result.output).length;
  return undefined;
}

export async function recordToolUsageFromResult(
  runtime: AgentRuntimeInternal,
  result: ToolExecutionResult,
  traceContext: TraceContext,
): Promise<void> {
  const store = usagePort(runtime);
  if (!store) return;
  const metadata = runtime.registry.get(result.toolName)?.metadata;
  const errorType = result.error?.type;
  const commandExit =
    result.performance?.detail?.kind === "command"
      ? result.performance.detail.command.exitCode
      : undefined;
  try {
    await store.upsertToolUsage({
      id: phrase(["usage_tool_", runtime.sessionId, "_", result.toolCallId]),
      sessionID: runtime.sessionId,
      turnID: traceContext.turnId,
      traceID: traceContext.traceId,
      toolCallID: result.toolCallId,
      toolName: result.toolName,
      sideEffectScope: metadata?.sideEffectScope,
      readOnly: metadata?.readOnly,
      destructive: metadata?.destructive,
      approvalStatus: "none",
      status: result.success ? "completed" : "error",
      startedAt: result.startedAt.getTime(),
      firstOutputAt: result.completedAt.getTime(),
      completedAt: result.completedAt.getTime(),
      durationMs: result.durationMs,
      exitCode: commandExit,
      timeToFirstOutputMs: result.completedAt.getTime() - result.startedAt.getTime(),
      outputBytes: outputBytes(result),
      truncated: result.serialization?.truncated,
      retryCount: 0,
      retryable: false,
      cancelledByUser: errorType?.includes("cancel") ?? false,
      errorType,
      errorMessage: result.error?.message,
    });
  } catch (error) {
    // 用量写入失败不能挡住工具结果落账和后续模型步。
    report(runtime, "warn", phrase(["Usage tool fact ", "write failed"]), {
      errorMessage: error instanceof Error ? error.message : String(error),
      event: phrase(["usage.tool.", "write.failed"]),
      module: "core.runtime",
      status: "failed",
      toolCallId: result.toolCallId,
      traceId: traceContext.traceId,
      turnId: traceContext.turnId,
    });
  }
}

async function publishAnomaly(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  traceContext: TraceContext,
  body: string | undefined,
  payload: Record<string, unknown>,
): Promise<void> {
  if (body !== undefined) {
    commitTurnRequestEntries(runtime, state.turnRequestState, [
      systemReminderAttachmentEntry("model_anomaly", body),
    ]);
  }
  const event = runtime.createEvent(SessionEventType.ModelAnomalyWarning, payload, traceContext);
  await runtime.appendEvent(event, traceContext);
  state.events.push(event);
}

export async function handleToolCallAnomalyWarnings(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: { modelTraceContext: TraceContext; toolCalls: ModelToolCall[] },
): Promise<void> {
  const guard = runtime.config.modelAnomalyGuard;
  const budget = detectToolCallBudgetWarning(
    state.toolCallCount,
    options.toolCalls.length,
    state,
    guard,
  );
  if (budget) {
    await publishAnomaly(
      runtime,
      state,
      options.modelTraceContext,
      budget.warningInjected ? buildToolCallBudgetReminderBody(budget.observedCount) : undefined,
      {
        category: "tool_call_budget",
        severity: "warning",
        observedCount: budget.observedCount,
        threshold: budget.threshold,
        warningInjected: budget.warningInjected,
      },
    );
  }
  const repeated = detectRepeatedToolCallWarnings(options.toolCalls, state, guard);
  for (const warning of repeated) {
    await publishAnomaly(
      runtime,
      state,
      options.modelTraceContext,
      warning.warningInjected
        ? buildRepeatedToolCallReminderBody(warning.toolName, warning.observedCount)
        : undefined,
      {
        category: "repeated_tool_call",
        severity: "warning",
        observedCount: warning.observedCount,
        threshold: warning.threshold,
        toolCallId: warning.toolCallId,
        toolName: warning.toolName,
        warningInjected: warning.warningInjected,
      },
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function finiteNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nestedUsage(output: unknown): ModelUsage | undefined {
  const root = asRecord(output);
  const usage = root ? asRecord(root.modelUsage) : undefined;
  if (!usage) return undefined;
  const server = asRecord(usage.serverToolUse);
  const serverToolUse = server
    ? {
        webFetchRequests: finiteNumber(server, "webFetchRequests"),
        webSearchRequests: finiteNumber(server, "webSearchRequests"),
      }
    : undefined;
  return {
    inputTokens: finiteNumber(usage, "inputTokens"),
    outputTokens: finiteNumber(usage, "outputTokens"),
    totalTokens: finiteNumber(usage, "totalTokens"),
    cacheReadTokens: finiteNumber(usage, "cacheReadTokens"),
    cacheWriteTokens: finiteNumber(usage, "cacheWriteTokens"),
    reasoningTokens: finiteNumber(usage, "reasoningTokens"),
    ...(serverToolUse ? { serverToolUse } : {}),
  };
}

export async function emitNestedModelUsageEvents(
  runtime: AgentRuntimeInternal,
  input: {
    events: RegularTurnLoopState["events"];
    results: ToolExecutionResult[];
    traceContext: TraceContext;
  },
): Promise<void> {
  for (const result of input.results) {
    const usage = nestedUsage(result.output);
    if (!usage) continue;
    const event = runtime.createEvent(
      SessionEventType.ModelComplete,
      { content: "", stopReason: "tool_internal", usage, toolCallCount: 0 },
      input.traceContext,
    );
    await runtime.appendEvent(event, input.traceContext);
    input.events.push(event);
  }
}
