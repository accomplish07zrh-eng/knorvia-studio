// SPDX-License-Identifier: Apache-2.0
// 工具分部：名称投影、三态、跟进、用量、告警、嵌套模型用量。可选键接在公共字段后面。
import type { ToolUsageRecord, UsageStorePort } from "@knorvia/contracts";
import { systemReminderAttachmentEntry } from "../../../agent/message-history.js";
import {
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
  type TurnSteerInput,
} from "../../deps.js";
import {
  buildRepeatedToolCallReminderBody,
  buildToolCallBudgetReminderBody,
  detectRepeatedToolCallWarnings,
  detectToolCallBudgetWarning,
  requireRuntimeToolCallName,
} from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { persistToolResultMediaAttachments } from "../../helpers/tool-result-media-persistence.js";
import { layer, report } from "./m02-record.js";
import { commitTurnRequestEntries } from "../turn-output-token-continuation.js";
import type { RegularTurnLoopState } from "../turn-loop-state.js";
import { completedToolPartMetadata, mcpToolPartMetadata } from "../tool-part-metadata.js";

const EMPTY_TOOL = "empty_tool_name";
const OBJECT_PREVIEW = "[object]";
const PREVIEW_LIMIT = 50;
const RUNTIME_MODULE = "core.runtime";

type NameProjection = { metadata?: Record<string, unknown>; toolName: string };
type PendingPartOptions = {
  assistantMessageId: MessageId;
  declarationIndex: number;
  input: Record<string, unknown>;
  model: Model;
  metadata?: CompletedToolPartMetadata;
  partID: PartId;
  toolCall: ToolCall;
  traceContext: TraceContext;
};
type Boundary = ReturnType<typeof projectToolNameForNonEmptyBoundary>;
type Media = Awaited<ReturnType<typeof persistToolResultMediaAttachments>>;

type PartClock = { start: number; end?: number };

export function projectToolNameForNonEmptyBoundary(toolName: string): NameProjection {
  const visible = toolName.trim().length > 0;
  if (visible) return { toolName };
  return { toolName: EMPTY_TOOL, metadata: { providerToolName: toolName } };
}

function pendingBoundary(
  runtime: AgentRuntimeInternal,
  options: {
    toolCall: ToolCall;
    traceContext: TraceContext;
    model: Model;
  },
): NameProjection {
  const rawName = options.toolCall.name;
  const blankText = typeof rawName === "string" && rawName.trim().length === 0;
  if (blankText) return projectToolNameForNonEmptyBoundary(rawName);
  const toolName = requireRuntimeToolCallName(options.toolCall, {
    logger: runtime.logger,
    model: options.model,
    source: "persistPendingToolPart",
    traceContext: options.traceContext,
  });
  return { toolName };
}

function mergedMetadata(
  left: object | undefined,
  right: object | undefined,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  if (left) Object.assign(merged, left);
  if (right) Object.assign(merged, right);
  return merged;
}

export async function persistPendingToolPart(
  runtime: AgentRuntimeInternal,
  options: PendingPartOptions,
): Promise<void> {
  const projected = pendingBoundary(runtime, options);
  const raw = JSON.stringify({ tool: projected.toolName, input: options.toolCall.input });
  const state = { status: "pending" as const, input: options.input, raw };
  const { sessionId } = runtime;
  const part = {
    id: options.partID,
    sessionID: sessionId,
    messageID: options.assistantMessageId,
    type: "tool" as const,
    callID: options.toolCall.id,
    declarationIndex: options.declarationIndex,
    tool: projected.toolName,
    metadata: mergedMetadata(projected.metadata, options.metadata),
    state,
  };
  await runtime.persistPart(part as never, options.traceContext);
}

export interface ToolBatchPartFacts {
  declarationIndex: number;
  partID: ReturnType<typeof createPartId>;
  input: Record<string, unknown>;
  startedAt: number;
}

function clock(start: number, end?: number): PartClock {
  if (end === undefined) return { start };
  return { start, end };
}

export function runningToolBatchState(
  runtime: AgentRuntimeInternal,
  call: ToolCall,
  part: ToolBatchPartFacts,
  boundary: Boundary,
) {
  const presentation = runtime.registry.getMetadata(call.name)?.mcpPresentation;
  const metadata = mcpToolPartMetadata(presentation) ?? {};
  const status = "running" as const;
  const { input } = part;
  const title = boundary.toolName;
  const time = clock(part.startedAt);
  return { status, input, title, metadata, time };
}

export function completedToolBatchState(
  result: ToolExecutionResult,
  part: ToolBatchPartFacts,
  output: string,
  boundary: Boundary,
  media: Media,
) {
  const metadata = layer<Record<string, unknown>>(
    completedToolPartMetadata(result),
    media ? { modelContentLayout: media.modelContentLayout } : undefined,
  );
  const status = "completed" as const;
  const { input } = part;
  const title = boundary.toolName;
  const time = clock(result.startedAt.getTime(), result.completedAt.getTime());
  return layer(
    { status, input, output, title, metadata, time },
    media ? { attachments: media.attachments } : undefined,
  ) as {
    status: "completed";
    input: Record<string, unknown>;
    output: string;
    title: string;
    metadata: Record<string, unknown>;
    time: { start: number; end: number };
    attachments?: NonNullable<Media>["attachments"];
  };
}

function quotedModelContent(result: ToolExecutionResult): string | undefined {
  return typeof result.modelContent === "string" ? result.modelContent : undefined;
}

export function failedToolBatchState(
  runtime: AgentRuntimeInternal,
  result: ToolExecutionResult,
  part: ToolBatchPartFacts,
  output: string,
) {
  const presentation = runtime.registry.getMetadata(result.toolName)?.mcpPresentation;
  const card = mcpToolPartMetadata(presentation);
  const modelContent = quotedModelContent(result);
  const metadata = layer<Record<string, unknown>>(
    card,
    modelContent !== undefined ? { modelContent } : undefined,
  );
  const status = "error" as const;
  const { input } = part;
  const error = result.error?.message ?? output;
  const time = clock(result.startedAt.getTime(), result.completedAt.getTime());
  return { status, input, error, metadata, time };
}

function previewOutput(output: unknown): string {
  if (typeof output !== "string") return OBJECT_PREVIEW;
  return output.slice(0, PREVIEW_LIMIT);
}

export function toolBatchResultDiagnostic(results: ToolExecutionResult[]) {
  const rows = results.map((result) => {
    const { toolName, success } = result;
    return { toolName, success, output: previewOutput(result.output) };
  });
  return { resultCount: results.length, results: rows };
}

function followUpText(result: ToolExecutionResult): string | undefined {
  const followUp = result.followUpUserInput;
  if (!followUp) return;
  const input = followUp.input.trim();
  if (input.length === 0) return;
  return input;
}

function followUpBase(
  traceContext: TraceContext,
  result: ToolExecutionResult,
  reasonSource: string,
) {
  const module = RUNTIME_MODULE;
  const { toolCallId, toolName } = result;
  return layer(traceContextToLogContext(traceContext), {
    module,
    reasonSource,
    toolCallId,
    toolName,
  });
}

export async function steerToolBatchFollowUp(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  result: ToolExecutionResult,
  traceContext: TraceContext,
): Promise<void> {
  const input = followUpText(result);
  if (input === undefined) return;
  const followUp = result.followUpUserInput;
  if (!followUp) return;
  const steering: TurnSteerInput = {
    delivery: "guide",
    expectedTurnId: state.activeTurn?.turnId,
    input,
    source: followUp.reasonSource,
    traceContext,
  };
  const steered = await runtime.steerTurn(steering);
  const shared = followUpBase(traceContext, result, followUp.reasonSource);
  if (steered.kind === "queued") {
    const event = "tool.follow_up_user_input.queued";
    const { pendingInputId } = steered;
    const status = "waiting";
    report(
      runtime,
      "debug",
      "Queued follow-up user input from tool result",
      layer(shared, {
        event,
        pendingInputId,
        status,
      }),
    );
    return;
  }
  const { activeTurnId, reason } = steered;
  const event = "tool.follow_up_user_input.rejected";
  const status = "failed";
  report(
    runtime,
    "warn",
    "Failed to queue follow-up user input from tool result",
    layer(shared, {
      activeTurnId,
      event,
      reason,
      status,
    }),
  );
}

function usagePort(runtime: AgentRuntimeInternal): UsageStorePort | undefined {
  const candidate = runtime.sessionStore as Partial<UsageStorePort> | undefined;
  if (!candidate?.recordModelUsage) return;
  const ready = Boolean(
    candidate.upsertTurnUsage && candidate.upsertToolUsage && candidate.pruneUsage,
  );
  if (!ready) return;
  return candidate as UsageStorePort;
}

function outputBytes(result: ToolExecutionResult): number | undefined {
  if (result.serialization) return result.serialization.returnedBytes;
  if (typeof result.output !== "string") return;
  return new TextEncoder().encode(result.output).length;
}

function commandExit(result: ToolExecutionResult): number | undefined {
  return result.performance?.detail?.kind === "command"
    ? result.performance.detail.command.exitCode
    : undefined;
}

function usageRow(
  runtime: AgentRuntimeInternal,
  result: ToolExecutionResult,
  traceContext: TraceContext,
): ToolUsageRecord {
  const metadata = runtime.registry.get(result.toolName)?.metadata;
  const errorType = result.error?.type;
  const status = result.success ? "completed" : "error";
  const id = `usage_tool_${runtime.sessionId}_${result.toolCallId}`;
  const sessionID = runtime.sessionId;
  const turnID = traceContext.turnId;
  const traceID = traceContext.traceId;
  const { toolCallId: toolCallID, toolName, durationMs } = result;
  const sideEffectScope = metadata?.sideEffectScope;
  const readOnly = metadata?.readOnly;
  const destructive = metadata?.destructive;
  const approvalStatus = "none" as const;
  const startedAt = result.startedAt.getTime();
  const completedAt = result.completedAt.getTime();
  const firstOutputAt = completedAt;
  const exitCode = commandExit(result);
  const timeToFirstOutputMs = completedAt - startedAt;
  const truncated = result.serialization?.truncated;
  const cancelledByUser = errorType?.includes("cancel") ?? false;
  const errorMessage = result.error?.message;
  return {
    id,
    sessionID,
    turnID,
    traceID,
    toolCallID,
    toolName,
    sideEffectScope,
    readOnly,
    destructive,
    approvalStatus,
    status,
    startedAt,
    firstOutputAt,
    completedAt,
    durationMs,
    exitCode,
    timeToFirstOutputMs,
    outputBytes: outputBytes(result),
    truncated,
    retryCount: 0,
    retryable: false,
    cancelledByUser,
    errorType,
    errorMessage,
  };
}

export async function recordToolUsageFromResult(
  runtime: AgentRuntimeInternal,
  result: ToolExecutionResult,
  traceContext: TraceContext,
): Promise<void> {
  const store = usagePort(runtime);
  if (!store) return;
  try {
    await store.upsertToolUsage(usageRow(runtime, result, traceContext));
  } catch (error) {
    // 用量写失败只记 warn，不能挡住结果落账。
    const errorMessage = error instanceof Error ? error.message : String(error);
    const event = "usage.tool.write.failed";
    const module = RUNTIME_MODULE;
    const status = "failed";
    const { toolCallId } = result;
    const { traceId, turnId } = traceContext;
    report(runtime, "warn", "Usage tool fact write failed", {
      errorMessage,
      event,
      module,
      status,
      toolCallId,
      traceId,
      turnId,
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
    const reminder = systemReminderAttachmentEntry("model_anomaly", body);
    commitTurnRequestEntries(runtime, state.turnRequestState, [reminder]);
  }
  const event = runtime.createEvent(SessionEventType.ModelAnomalyWarning, payload, traceContext);
  await runtime.appendEvent(event, traceContext);
  state.events.push(event);
}

function budgetWarningPayload(warning: {
  observedCount: number;
  threshold: number;
  warningInjected: boolean;
}) {
  const category = "tool_call_budget";
  const severity = "warning";
  const { observedCount, threshold, warningInjected } = warning;
  return { category, severity, observedCount, threshold, warningInjected };
}

function repeatedWarningPayload(warning: {
  observedCount: number;
  threshold: number;
  toolCallId: string;
  toolName: string;
  warningInjected: boolean;
}) {
  const category = "repeated_tool_call";
  const severity = "warning";
  const { observedCount, threshold, toolCallId, toolName, warningInjected } = warning;
  return { category, severity, observedCount, threshold, toolCallId, toolName, warningInjected };
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
    const body = budget.warningInjected
      ? buildToolCallBudgetReminderBody(budget.observedCount)
      : undefined;
    await publishAnomaly(
      runtime,
      state,
      options.modelTraceContext,
      body,
      budgetWarningPayload(budget),
    );
  }
  const repeated = detectRepeatedToolCallWarnings(options.toolCalls, state, guard);
  let index = 0;
  while (index < repeated.length) {
    const warning = repeated[index]!;
    index += 1;
    const body = warning.warningInjected
      ? buildRepeatedToolCallReminderBody(warning.toolName, warning.observedCount)
      : undefined;
    await publishAnomaly(
      runtime,
      state,
      options.modelTraceContext,
      body,
      repeatedWarningPayload(warning),
    );
  }
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object") return;
  if (value === null || Array.isArray(value)) return;
  return value as Record<string, unknown>;
}

function readFinite(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (typeof value !== "number") return;
  return Number.isFinite(value) ? value : undefined;
}

function serverUse(usage: Record<string, unknown>): ModelUsage["serverToolUse"] | undefined {
  const server = plainRecord(usage.serverToolUse);
  if (!server) return;
  return {
    webFetchRequests: readFinite(server, "webFetchRequests"),
    webSearchRequests: readFinite(server, "webSearchRequests"),
  };
}

function nestedUsage(output: unknown): ModelUsage | undefined {
  const root = plainRecord(output);
  const usage = root ? plainRecord(root.modelUsage) : undefined;
  if (!usage) return;
  const row: ModelUsage = {
    inputTokens: readFinite(usage, "inputTokens"),
    outputTokens: readFinite(usage, "outputTokens"),
    totalTokens: readFinite(usage, "totalTokens"),
    cacheReadTokens: readFinite(usage, "cacheReadTokens"),
    cacheWriteTokens: readFinite(usage, "cacheWriteTokens"),
    reasoningTokens: readFinite(usage, "reasoningTokens"),
  };
  const serverToolUse = serverUse(usage);
  if (serverToolUse) row.serverToolUse = serverToolUse;
  return row;
}

export async function emitNestedModelUsageEvents(
  runtime: AgentRuntimeInternal,
  input: {
    events: RegularTurnLoopState["events"];
    results: ToolExecutionResult[];
    traceContext: TraceContext;
  },
): Promise<void> {
  let index = 0;
  while (index < input.results.length) {
    const result = input.results[index]!;
    index += 1;
    const usage = nestedUsage(result.output);
    if (!usage) continue;
    const content = "";
    const stopReason = "tool_internal";
    const toolCallCount = 0;
    const payload = { content, stopReason, usage, toolCallCount };
    const event = runtime.createEvent(SessionEventType.ModelComplete, payload, input.traceContext);
    await runtime.appendEvent(event, input.traceContext);
    input.events.push(event);
  }
}
