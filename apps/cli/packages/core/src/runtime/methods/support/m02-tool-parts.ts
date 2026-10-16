// SPDX-License-Identifier: Apache-2.0
// 工具分部：名称投影、三态、跟进、用量、告警、嵌套模型用量。键序用 assignKeys 保住。
import type { ToolUsageRecord, UsageStorePort } from "@knorvia/contracts";
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
  type TurnSteerInput,
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
import { assignKeys, phrase, report } from "./m02-record.js";
import { commitTurnRequestEntries } from "./m02-continuation.js";
import type { RegularTurnLoopState } from "./m02-loop-state.js";

const SCHEMA = COMPLETED_TOOL_PART_METADATA_SCHEMA_VERSION;
const EMPTY_TOOL = "empty_tool_name";
const OBJECT_PREVIEW = "[object]";
const PREVIEW_LIMIT = 50;

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

function bag<T extends object>(pairs: ReadonlyArray<readonly [string, unknown]>): T {
  return assignKeys<T>(pairs);
}

function extend(
  base: object,
  pairs: ReadonlyArray<readonly [string, unknown]>,
): Record<string, unknown> {
  return Object.assign({}, base, bag<Record<string, unknown>>(pairs));
}

export function mcpToolPartMetadata(
  presentation: { serverName: string; toolName: string; description?: string } | undefined,
): CompletedToolPartMetadata | undefined {
  const display = createMcpToolDisplay(presentation);
  if (!display) return;
  return bag<CompletedToolPartMetadata>([
    ["schemaVersion", SCHEMA],
    ["display", display],
  ]);
}

function serializationOf(result: ToolExecutionResult): Record<string, unknown> | undefined {
  const raw = result.serialization;
  if (!raw) return;
  const record = bag<Record<string, unknown>>([
    ["truncated", raw.truncated],
    ["originalBytes", raw.originalBytes],
    ["returnedBytes", raw.returnedBytes],
    ["budgetStrategy", raw.budgetStrategy],
  ]);
  if (raw.artifactPath) record.artifactPath = raw.artifactPath;
  return record;
}

export function completedToolPartMetadata(result: ToolExecutionResult): CompletedToolPartMetadata {
  const serialization = serializationOf(result);
  const record = bag<Record<string, unknown>>([["schemaVersion", SCHEMA]]);
  if (result.display) record.display = result.display;
  if (serialization) record.serialization = serialization;
  if (result.readFileStateMetadata) record.readFileState = result.readFileStateMetadata;
  return record as CompletedToolPartMetadata;
}

export function projectToolNameForNonEmptyBoundary(toolName: string): NameProjection {
  const visible = toolName.trim().length > 0;
  if (visible) return bag<NameProjection>([["toolName", toolName]]);
  const metadata = bag<Record<string, unknown>>([["providerToolName", toolName]]);
  return bag<NameProjection>([
    ["toolName", EMPTY_TOOL],
    ["metadata", metadata],
  ]);
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
  const toolName = requireRuntimeToolCallName(
    options.toolCall,
    bag([
      ["logger", runtime.logger],
      ["model", options.model],
      ["source", "persistPendingToolPart"],
      ["traceContext", options.traceContext],
    ]),
  );
  return bag<NameProjection>([["toolName", toolName]]);
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
  const raw = JSON.stringify(
    bag([
      ["tool", projected.toolName],
      ["input", options.toolCall.input],
    ]),
  );
  const state = bag([
    ["status", "pending"],
    ["input", options.input],
    ["raw", raw],
  ]);
  const part = bag([
    ["id", options.partID],
    ["sessionID", runtime.sessionId],
    ["messageID", options.assistantMessageId],
    ["type", "tool"],
    ["callID", options.toolCall.id],
    ["declarationIndex", options.declarationIndex],
    ["tool", projected.toolName],
    ["metadata", mergedMetadata(projected.metadata, options.metadata)],
    ["state", state],
  ]);
  await runtime.persistPart(part as never, options.traceContext);
}

export interface ToolBatchPartFacts {
  declarationIndex: number;
  partID: ReturnType<typeof createPartId>;
  input: Record<string, unknown>;
  startedAt: number;
}

function clock(start: number, end?: number): { start: number; end?: number } {
  const time = bag<{ start: number; end?: number }>([["start", start]]);
  if (end !== undefined) time.end = end;
  return time;
}

export function runningToolBatchState(
  runtime: AgentRuntimeInternal,
  call: ToolCall,
  part: ToolBatchPartFacts,
  boundary: Boundary,
) {
  const presentation = runtime.registry.getMetadata(call.name)?.mcpPresentation;
  const metadata = mcpToolPartMetadata(presentation) ?? bag<Record<string, unknown>>([]);
  return bag<{
    status: "running";
    input: Record<string, unknown>;
    title: string;
    metadata: Record<string, unknown>;
    time: { start: number };
  }>([
    ["status", "running"],
    ["input", part.input],
    ["title", boundary.toolName],
    ["metadata", metadata],
    ["time", clock(part.startedAt)],
  ]);
}

export function completedToolBatchState(
  result: ToolExecutionResult,
  part: ToolBatchPartFacts,
  output: string,
  boundary: Boundary,
  media: Media,
) {
  const metadata = bag<Record<string, unknown>>([]);
  Object.assign(metadata, completedToolPartMetadata(result));
  if (media) metadata.modelContentLayout = media.modelContentLayout;
  const state = bag<Record<string, unknown>>([
    ["status", "completed"],
    ["input", part.input],
    ["output", output],
    ["title", boundary.toolName],
    ["metadata", metadata],
    ["time", clock(result.startedAt.getTime(), result.completedAt.getTime())],
  ]);
  if (media) state.attachments = media.attachments;
  return state as {
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
  const metadata = bag<Record<string, unknown>>([]);
  const card = mcpToolPartMetadata(presentation);
  if (card) Object.assign(metadata, card);
  const modelContent = quotedModelContent(result);
  if (modelContent !== undefined) metadata.modelContent = modelContent;
  const message = result.error?.message ?? output;
  return bag<{
    status: "error";
    input: Record<string, unknown>;
    error: string;
    metadata: Record<string, unknown>;
    time: { start: number; end: number };
  }>([
    ["status", "error"],
    ["input", part.input],
    ["error", message],
    ["metadata", metadata],
    ["time", clock(result.startedAt.getTime(), result.completedAt.getTime())],
  ]);
}

function previewOutput(output: unknown): string {
  if (typeof output !== "string") return OBJECT_PREVIEW;
  return output.slice(0, PREVIEW_LIMIT);
}

export function toolBatchResultDiagnostic(results: ToolExecutionResult[]) {
  const rows = results.map((result) =>
    bag([
      ["toolName", result.toolName],
      ["success", result.success],
      ["output", previewOutput(result.output)],
    ]),
  );
  return bag([
    ["resultCount", results.length],
    ["results", rows],
  ]);
}

function followUpText(result: ToolExecutionResult): string | undefined {
  const followUp = result.followUpUserInput;
  if (!followUp) return;
  const input = followUp.input.trim();
  if (input.length === 0) return;
  return input;
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
  const steering = await runtime.steerTurn(
    bag<TurnSteerInput>([
      ["delivery", "guide"],
      ["expectedTurnId", state.activeTurn?.turnId],
      ["input", input],
      ["source", followUp.reasonSource],
      ["traceContext", traceContext],
    ]),
  );
  const shared = extend(traceContextToLogContext(traceContext), [
    ["module", "core.runtime"],
    ["reasonSource", followUp.reasonSource],
    ["toolCallId", result.toolCallId],
    ["toolName", result.toolName],
  ]);
  if (steering.kind === "queued") {
    report(
      runtime,
      "debug",
      phrase(["Queued follow-up user input ", "from tool result"]),
      extend(shared, [
        ["event", phrase(["tool.follow_up_user_input.", "queued"])],
        ["pendingInputId", steering.pendingInputId],
        ["status", "waiting"],
      ]),
    );
    return;
  }
  report(
    runtime,
    "warn",
    phrase(["Failed to queue follow-up user input ", "from tool result"]),
    extend(shared, [
      ["activeTurnId", steering.activeTurnId],
      ["event", phrase(["tool.follow_up_user_input.", "rejected"])],
      ["reason", steering.reason],
      ["status", "failed"],
    ]),
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
  return bag<ToolUsageRecord>([
    ["id", phrase(["usage_tool_", runtime.sessionId, "_", result.toolCallId])],
    ["sessionID", runtime.sessionId],
    ["turnID", traceContext.turnId],
    ["traceID", traceContext.traceId],
    ["toolCallID", result.toolCallId],
    ["toolName", result.toolName],
    ["sideEffectScope", metadata?.sideEffectScope],
    ["readOnly", metadata?.readOnly],
    ["destructive", metadata?.destructive],
    ["approvalStatus", "none"],
    ["status", status],
    ["startedAt", result.startedAt.getTime()],
    ["firstOutputAt", result.completedAt.getTime()],
    ["completedAt", result.completedAt.getTime()],
    ["durationMs", result.durationMs],
    ["exitCode", commandExit(result)],
    ["timeToFirstOutputMs", result.completedAt.getTime() - result.startedAt.getTime()],
    ["outputBytes", outputBytes(result)],
    ["truncated", result.serialization?.truncated],
    ["retryCount", 0],
    ["retryable", false],
    ["cancelledByUser", errorType?.includes("cancel") ?? false],
    ["errorType", errorType],
    ["errorMessage", result.error?.message],
  ]);
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
    report(
      runtime,
      "warn",
      phrase(["Usage tool fact ", "write failed"]),
      bag([
        ["errorMessage", errorMessage],
        ["event", phrase(["usage.tool.", "write.failed"])],
        ["module", "core.runtime"],
        ["status", "failed"],
        ["toolCallId", result.toolCallId],
        ["traceId", traceContext.traceId],
        ["turnId", traceContext.turnId],
      ]),
    );
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
      bag([
        ["category", "tool_call_budget"],
        ["severity", "warning"],
        ["observedCount", budget.observedCount],
        ["threshold", budget.threshold],
        ["warningInjected", budget.warningInjected],
      ]),
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
      bag([
        ["category", "repeated_tool_call"],
        ["severity", "warning"],
        ["observedCount", warning.observedCount],
        ["threshold", warning.threshold],
        ["toolCallId", warning.toolCallId],
        ["toolName", warning.toolName],
        ["warningInjected", warning.warningInjected],
      ]),
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
  return bag([
    ["webFetchRequests", readFinite(server, "webFetchRequests")],
    ["webSearchRequests", readFinite(server, "webSearchRequests")],
  ]);
}

function nestedUsage(output: unknown): ModelUsage | undefined {
  const root = plainRecord(output);
  const usage = root ? plainRecord(root.modelUsage) : undefined;
  if (!usage) return;
  const row = bag<ModelUsage>([
    ["inputTokens", readFinite(usage, "inputTokens")],
    ["outputTokens", readFinite(usage, "outputTokens")],
    ["totalTokens", readFinite(usage, "totalTokens")],
    ["cacheReadTokens", readFinite(usage, "cacheReadTokens")],
    ["cacheWriteTokens", readFinite(usage, "cacheWriteTokens")],
    ["reasoningTokens", readFinite(usage, "reasoningTokens")],
  ]);
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
    const payload = bag([
      ["content", ""],
      ["stopReason", "tool_internal"],
      ["usage", usage],
      ["toolCallCount", 0],
    ]);
    const event = runtime.createEvent(SessionEventType.ModelComplete, payload, input.traceContext);
    await runtime.appendEvent(event, input.traceContext);
    input.events.push(event);
  }
}
