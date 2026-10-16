// SPDX-License-Identifier: Apache-2.0
// 工具批：声明序落账，执行可并行，记录按声明序收口。取消检查点先攒后抛。
import { createRuntimeToolResultEntry } from "../../../agent/message-history.js";
import { recordBrowserTurnToolResult } from "../../../repl/browser-turn-state.js";
import {
  TurnMachineImpl,
  createPartId,
  type MessageId,
  type MessagePart,
  type ModelToolCall,
  type ToolCall,
  type ToolCallId,
  type ToolExecutionResult,
  type ToolSchedule,
  type TraceContext,
} from "../../deps.js";
import {
  createStreamRecoveryAnchorId,
  emitStreamRecoveryAnchor,
  emitStreamingToolLedgerUpdate,
  isErrorForToolResult,
  isTurnCancellationError,
  modelContentForToolResult,
  stringifyToolResultOutput,
  toRecordInput,
} from "../../helpers/index.js";
import { persistToolResultMediaAttachments } from "../../helpers/tool-result-media-persistence.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type {
  ExecuteToolsOptions,
  RuntimeModelTextResult,
  StreamedToolExecutionResult,
} from "../../types.js";
import { emitSyntheticStreamedToolError } from "../streaming-tool-synthetic-result.js";
import { commitTurnRequestEntries } from "./m02-continuation.js";
import { drainInlineGuideForNextRequest } from "./m02-guide.js";
import {
  isAutomationMutationRestrictedTurn,
  isOffPeakCreateRestrictedTurn,
  recordCompletedToolBatch,
  type RegularTurnLoopState,
} from "./m02-loop-state.js";
import { assignKeys, phrase, report } from "./m02-record.js";
import { persistToolModelStepFinish } from "./m02-step-finish.js";
import {
  completedToolBatchState,
  failedToolBatchState,
  mcpToolPartMetadata,
  persistPendingToolPart,
  projectToolNameForNonEmptyBoundary,
  recordToolUsageFromResult,
  runningToolBatchState,
  steerToolBatchFollowUp,
  toolBatchResultDiagnostic,
  handleToolCallAnomalyWarnings,
  emitNestedModelUsageEvents,
  type ToolBatchPartFacts,
} from "./m02-tool-parts.js";

const MISSING_MODEL = phrase(["Model-backed tool execution ", "requires the loop Model"]);
const GUIDE_PARK = phrase(["guide.", "noToolBoundary"]) as "guide.noToolBoundary";

type BatchOptions = {
  assistantCreatedAt: number;
  assistantMessageId: MessageId;
  modelTraceContext: TraceContext;
  result: RuntimeModelTextResult;
  streamedToolResults?: StreamedToolExecutionResult[];
  toolCalls: ModelToolCall[];
};

type Boundary = ReturnType<typeof projectToolNameForNonEmptyBoundary>;
type LedgerRequest = Parameters<typeof emitStreamingToolLedgerUpdate>[3];
type AnchorRequest = Parameters<typeof emitStreamRecoveryAnchor>[3];
type PendingRequest = Parameters<typeof persistPendingToolPart>[1];
type MediaRequest = Parameters<typeof persistToolResultMediaAttachments>[0];

function bag<T extends object>(pairs: ReadonlyArray<readonly [string, unknown]>): T {
  return assignKeys<T>(pairs);
}

function alreadyRecorded(entry: StreamedToolExecutionResult | undefined): boolean {
  if (!entry) return false;
  return entry.ledgerRecorded !== false;
}

class DeclaredToolBatch {
  readonly host: AgentRuntimeInternal;
  readonly state: RegularTurnLoopState;
  readonly options: BatchOptions;
  readonly model: RegularTurnLoopState["model"];
  readonly calls: ToolCall[];
  readonly streamed = new Map<string, StreamedToolExecutionResult>();
  readonly declared = new Map<string, ToolCall>();
  readonly parts = new Map<string, ToolBatchPartFacts>();
  pendingResults: ToolExecutionResult[] = [];
  checkpointCancellation: unknown;

  constructor(host: AgentRuntimeInternal, state: RegularTurnLoopState, options: BatchOptions) {
    this.host = host;
    this.state = state;
    this.options = options;
    const model = state.model;
    if (!model) throw new Error(MISSING_MODEL);
    this.model = model;
    // 第一次 await 之前先读 provider，再读 model。顺序是观察契约。
    const seenProvider = model.providerId;
    const seenModel = model.modelId;
    void seenProvider;
    void seenModel;
    this.calls = options.toolCalls.map((call) =>
      bag<ToolCall>([
        ["id", call.id as ToolCallId],
        ["name", call.name],
        ["input", call.input],
      ]),
    );
    this.seedStreamed(options.streamedToolResults ?? []);
    this.indexDeclared();
  }

  private seedStreamed(entries: readonly StreamedToolExecutionResult[]): void {
    let index = 0;
    while (index < entries.length) {
      const entry = entries[index]!;
      this.streamed.set(entry.toolCallId, entry);
      index += 1;
    }
  }

  private indexDeclared(): void {
    let index = 0;
    while (index < this.calls.length) {
      const call = this.calls[index]!;
      this.declared.set(call.id, call);
      index += 1;
    }
  }

  private adopt(next: unknown): void {
    this.state.turnMachine = new TurnMachineImpl(next as never);
  }

  async run(): Promise<"continue" | "break"> {
    await this.recordDeclarations();
    await this.scheduleDeclared();
    const results = this.orderedResults();
    this.noteBrowser(results);
    await emitNestedModelUsageEvents(
      this.host,
      bag([
        ["events", this.state.events],
        ["results", results],
        ["traceContext", this.options.modelTraceContext],
      ]),
    );
    this.completeMachine(results);
    report(this.host, "debug", phrase(["Tools ", "executed"]), toolBatchResultDiagnostic(results));
    report(
      this.host,
      "debug",
      phrase(["Injecting ", "tool results"]),
      bag([["resultCount", results.length]]),
    );
    await this.settleAll(results);
    if (this.checkpointCancellation) throw this.checkpointCancellation;
    return this.close(results);
  }

  private partFacts(
    declarationIndex: number,
    toolCall: ToolCall,
    entry: StreamedToolExecutionResult | undefined,
  ): ToolBatchPartFacts {
    const partID = entry ? entry.partID : createPartId();
    const input = entry ? entry.input : toRecordInput(toolCall.input);
    const startedAt = entry ? entry.result.startedAt.getTime() : Date.now();
    return bag<ToolBatchPartFacts>([
      ["declarationIndex", declarationIndex],
      ["partID", partID],
      ["input", input],
      ["startedAt", startedAt],
    ]);
  }

  private async recordDeclarations(): Promise<void> {
    let declarationIndex = 0;
    while (declarationIndex < this.calls.length) {
      const toolCall = this.calls[declarationIndex]!;
      const entry = this.streamed.get(toolCall.id);
      const part = this.partFacts(declarationIndex, toolCall, entry);
      this.parts.set(toolCall.id, part);
      if (!alreadyRecorded(entry)) await this.openLedger(toolCall, part, entry);
      declarationIndex += 1;
    }
  }

  private pendingRequest(
    toolCall: ToolCall,
    part: ToolBatchPartFacts,
    presentation: { serverName: string; toolName: string; description?: string } | undefined,
  ): PendingRequest {
    return bag<PendingRequest>([
      ["assistantMessageId", this.options.assistantMessageId],
      ["declarationIndex", part.declarationIndex],
      ["input", part.input],
      ["partID", part.partID],
      ["toolCall", toolCall],
      ["traceContext", this.options.modelTraceContext],
      ["model", this.model],
      ["metadata", mcpToolPartMetadata(presentation)],
    ]);
  }

  private closedLedger(
    toolCall: ToolCall,
    part: ToolBatchPartFacts,
    entry: StreamedToolExecutionResult | undefined,
  ): LedgerRequest {
    const pairs: Array<readonly [string, unknown]> = [
      ["assistantMessageId", this.options.assistantMessageId],
      ["toolCall", toolCall],
      ["status", "tool_call_closed"],
    ];
    if (entry) pairs.push(["executionTiming", "during_stream"]);
    pairs.push(["input", part.input]);
    return bag<LedgerRequest>(pairs);
  }

  private async openLedger(
    toolCall: ToolCall,
    part: ToolBatchPartFacts,
    entry: StreamedToolExecutionResult | undefined,
  ): Promise<void> {
    const presentation = this.host.registry.getMetadata(toolCall.name)?.mcpPresentation;
    await persistPendingToolPart(this.host, this.pendingRequest(toolCall, part, presentation));
    await emitStreamingToolLedgerUpdate(
      this.host,
      this.state.events,
      this.options.modelTraceContext,
      this.closedLedger(toolCall, part, entry),
    );
    if (!entry) return;
    await emitSyntheticStreamedToolError(
      this.host,
      this.state.events,
      this.options.modelTraceContext,
      entry.result,
    );
  }

  private async scheduleDeclared(): Promise<void> {
    const schedule = await this.host.scheduleTools(this.calls);
    this.adopt(
      this.state.turnMachine.scheduleTools(this.calls, this.host.toScheduleState(schedule)),
    );
    const pending = this.calls.filter((call) => !this.streamed.has(call.id));
    this.adopt(this.state.turnMachine.startToolExecution());
    if (pending.length === 0) return;
    await this.runPending(pending, schedule);
  }

  private async markQueued(pending: readonly ToolCall[]): Promise<void> {
    let index = 0;
    while (index < pending.length) {
      const toolCall = pending[index]!;
      index += 1;
      const request = bag<LedgerRequest>([
        ["assistantMessageId", this.options.assistantMessageId],
        ["toolCall", toolCall],
        ["status", "tool_queued"],
        ["input", this.parts.get(toolCall.id)?.input],
      ]);
      await emitStreamingToolLedgerUpdate(
        this.host,
        this.state.events,
        this.options.modelTraceContext,
        request,
      );
    }
  }

  private executionOptions(): ExecuteToolsOptions {
    return bag<ExecuteToolsOptions>([
      ["automationTurn", isAutomationMutationRestrictedTurn(this.state)],
      ["offPeakTurn", isOffPeakCreateRestrictedTurn(this.state)],
      ["signal", this.state.turnAbortSignal],
      ["traceContext", this.options.modelTraceContext],
      ["subagentModelOverride", this.state.subagentModelOverride],
      ["model", this.state.model],
      ["onBatchStart", (ids: string[]) => this.onBatchStart(ids)],
    ]);
  }

  private async runPending(pending: ToolCall[], schedule: ToolSchedule): Promise<void> {
    const sameBatch = pending.length === this.calls.length;
    const pendingSchedule = sameBatch ? schedule : await this.host.scheduleTools(pending);
    const scheduledEvents = await this.host.emitToolScheduledEvents(
      pending,
      pendingSchedule,
      this.options.assistantMessageId,
      this.options.modelTraceContext,
    );
    this.state.events.push(...scheduledEvents);
    await this.markQueued(pending);
    report(
      this.host,
      "debug",
      phrase(["Executing ", "tools"]),
      bag([
        ["streamedToolCallCount", this.streamed.size],
        ["toolCallCount", pending.length],
        ["tools", pending.map((call) => call.name)],
      ]),
    );
    const execution = await this.host.executeTools(
      pending,
      pendingSchedule,
      this.executionOptions(),
    );
    this.pendingResults = execution.results;
    this.state.events.push(...execution.events);
  }

  private runningPart(call: ToolCall, part: ToolBatchPartFacts, boundary: Boundary): MessagePart {
    return bag<MessagePart>([
      ["id", part.partID],
      ["sessionID", this.host.sessionId],
      ["messageID", this.options.assistantMessageId],
      ["type", "tool"],
      ["callID", call.id],
      ["declarationIndex", part.declarationIndex],
      ["tool", boundary.toolName],
      ["metadata", boundary.metadata],
      ["state", runningToolBatchState(this.host, call, part, boundary)],
    ]);
  }

  private startedLedger(call: ToolCall, part: ToolBatchPartFacts): LedgerRequest {
    return bag<LedgerRequest>([
      ["assistantMessageId", this.options.assistantMessageId],
      ["toolCall", call],
      ["status", "tool_started"],
      ["input", part.input],
      ["startedAt", new Date(part.startedAt)],
    ]);
  }

  private async onBatchStart(ids: readonly string[]): Promise<void> {
    if (this.state.turnAbortSignal?.aborted) return;
    let index = 0;
    while (index < ids.length) {
      const id = ids[index]!;
      index += 1;
      const call = this.declared.get(id);
      const part = this.parts.get(id);
      if (!call || !part) continue;
      part.startedAt = Date.now();
      const boundary = projectToolNameForNonEmptyBoundary(call.name);
      await this.host.persistPart(
        this.runningPart(call, part, boundary),
        this.options.modelTraceContext,
      );
      await emitStreamingToolLedgerUpdate(
        this.host,
        this.state.events,
        this.options.modelTraceContext,
        this.startedLedger(call, part),
      );
    }
  }

  private orderedResults(): ToolExecutionResult[] {
    const byCall = new Map<string, ToolExecutionResult>();
    for (const entry of this.streamed.values()) byCall.set(entry.result.toolCallId, entry.result);
    let index = 0;
    while (index < this.pendingResults.length) {
      const result = this.pendingResults[index]!;
      byCall.set(result.toolCallId, result);
      index += 1;
    }
    const ordered: ToolExecutionResult[] = [];
    for (const call of this.calls) {
      const result = byCall.get(call.id);
      if (result) ordered.push(result);
    }
    return ordered;
  }

  private noteBrowser(results: readonly ToolExecutionResult[]): void {
    let index = 0;
    while (index < results.length) {
      const result = results[index]!;
      index += 1;
      recordBrowserTurnToolResult(
        bag([
          ["output", result.output],
          ["sessionId", this.host.sessionId],
          ["toolName", result.toolName],
          ["turnId", this.state.turnId],
        ]),
      );
    }
  }

  private toolContent(
    result: ToolExecutionResult,
  ): Parameters<TurnMachineImpl["completeTool"]>[1]["content"] {
    if (result.success) return modelContentForToolResult(result);
    return result.error?.message ?? stringifyToolResultOutput(result);
  }

  private completeMachine(results: readonly ToolExecutionResult[]): void {
    let index = 0;
    while (index < results.length) {
      const result = results[index]!;
      index += 1;
      const done = bag<Parameters<TurnMachineImpl["completeTool"]>[1]>([
        ["success", result.success],
        ["content", this.toolContent(result)],
      ]);
      this.adopt(this.state.turnMachine.completeTool(result.toolCallId as ToolCallId, done));
    }
    this.adopt(this.state.turnMachine.aggregateResults());
  }

  private mediaRequest(result: ToolExecutionResult): MediaRequest {
    return bag<MediaRequest>([
      ["artifactStore", this.host.artifactStore],
      ["assistantMessageId", this.options.assistantMessageId],
      ["content", modelContentForToolResult(result)],
      ["sessionId", this.host.sessionId],
      ["sessionStore", this.host.sessionStore],
      ["signal", this.state.turnAbortSignal],
      ["toolCallId", result.toolCallId],
      ["toolName", result.toolName],
      ["traceContext", this.options.modelTraceContext],
      ["turnId", this.state.turnId],
    ]);
  }

  private terminalPart(
    result: ToolExecutionResult,
    part: ToolBatchPartFacts,
    boundary: Boundary,
    state: unknown,
  ): MessagePart {
    return bag<MessagePart>([
      ["id", part.partID],
      ["sessionID", this.host.sessionId],
      ["messageID", this.options.assistantMessageId],
      ["type", "tool"],
      ["callID", result.toolCallId as ToolCallId],
      ["declarationIndex", part.declarationIndex],
      ["tool", boundary.toolName],
      ["metadata", boundary.metadata],
      ["state", state],
    ]);
  }

  private async writeTerminal(
    result: ToolExecutionResult,
    part: ToolBatchPartFacts,
    output: string,
    boundary: Boundary,
  ): Promise<void> {
    const media = result.success
      ? await persistToolResultMediaAttachments(this.mediaRequest(result))
      : undefined;
    // 媒体端口可能改写 result，终态必须在 await 之后再读 success。
    const succeeded = result.success;
    const state = succeeded
      ? completedToolBatchState(result, part, output, boundary, media)
      : failedToolBatchState(this.host, result, part, output);
    await this.host.persistPart(
      this.terminalPart(result, part, boundary, state),
      this.options.modelTraceContext,
    );
  }

  private async checkpoint(result: ToolExecutionResult): Promise<boolean> {
    try {
      await this.host.emitFileMutationCheckpoint(
        bag<Parameters<AgentRuntimeInternal["emitFileMutationCheckpoint"]>[0]>([
          ["abortSignal", this.state.turnAbortSignal],
          ["events", this.state.events],
          ["messageId", this.state.userMessageId],
          ["result", result],
          ["toolMessageId", this.options.assistantMessageId],
          ["traceContext", this.options.modelTraceContext],
        ]),
      );
      return true;
    } catch (error) {
      if (!isTurnCancellationError(error, this.state.turnAbortSignal)) throw error;
      if (this.checkpointCancellation === undefined) this.checkpointCancellation = error;
      return false;
    }
  }

  private committedLedger(
    call: ToolCall,
    result: ToolExecutionResult,
    part: ToolBatchPartFacts | undefined,
    recoveryAnchorId: string,
  ): LedgerRequest {
    const timing = this.streamed.has(result.toolCallId) ? "during_stream" : "end_of_stream";
    return bag<LedgerRequest>([
      ["assistantMessageId", this.options.assistantMessageId],
      ["toolCall", call],
      ["status", "tool_result_committed"],
      ["input", part?.input],
      ["startedAt", result.startedAt],
      ["committedAt", result.completedAt],
      ["resultPartId", part?.partID],
      ["recoveryAnchorId", recoveryAnchorId],
      ["executionTiming", timing],
    ]);
  }

  private async anchor(
    result: ToolExecutionResult,
    boundary: Boundary,
    part: ToolBatchPartFacts | undefined,
  ): Promise<void> {
    const call = this.declared.get(result.toolCallId);
    if (!call) return;
    const recoveryAnchorId = createStreamRecoveryAnchorId(
      this.options.assistantMessageId,
      result.toolCallId as ToolCallId,
    );
    const anchor = bag<AnchorRequest>([
      ["assistantMessageId", this.options.assistantMessageId],
      ["toolCallId", result.toolCallId as ToolCallId],
      ["toolName", boundary.toolName],
      ["success", result.success],
      ["resultPartId", part?.partID],
      ["committedAt", result.completedAt],
    ]);
    await emitStreamRecoveryAnchor(
      this.host,
      this.state.events,
      this.options.modelTraceContext,
      anchor,
    );
    await emitStreamingToolLedgerUpdate(
      this.host,
      this.state.events,
      this.options.modelTraceContext,
      this.committedLedger(call, result, part, recoveryAnchorId),
    );
  }

  private async settleResult(result: ToolExecutionResult): Promise<void> {
    await recordToolUsageFromResult(this.host, result, this.options.modelTraceContext);
    const output = stringifyToolResultOutput(result);
    const isError = isErrorForToolResult(result);
    const boundary = projectToolNameForNonEmptyBoundary(result.toolName);
    const part = this.parts.get(result.toolCallId);
    if (part) await this.writeTerminal(result, part, output, boundary);
    report(
      this.host,
      "debug",
      "addToolResult",
      bag([
        ["toolCallId", result.toolCallId],
        ["toolName", result.toolName],
        ["success", result.success],
        ["contentLength", output.length],
      ]),
    );
    const entry = createRuntimeToolResultEntry(
      result.toolCallId,
      result.toolName,
      modelContentForToolResult(result),
      isError,
    );
    commitTurnRequestEntries(this.host, this.state.turnRequestState, [entry]);
    const kept = await this.checkpoint(result);
    if (!kept) return;
    await this.anchor(result, boundary, part);
    await steerToolBatchFollowUp(this.host, this.state, result, this.options.modelTraceContext);
  }

  private async settleAll(results: readonly ToolExecutionResult[]): Promise<void> {
    let index = 0;
    while (index < results.length) {
      const result = results[index]!;
      index += 1;
      await this.settleResult(result);
    }
  }

  private async stopTurn(stopping: ToolExecutionResult): Promise<"continue" | "break"> {
    await persistToolModelStepFinish(this.host, this.state, this.options);
    if (stopping.turnControl?.reason === "automation_create_limit") {
      this.state.automationCreateLimitReached = true;
      recordCompletedToolBatch(this.state);
      report(
        this.host,
        "info",
        phrase(["Automation create limit switched turn ", "to text-only response"]),
        bag([
          ["event", phrase(["automation.create_limit.", "text_only_continuation"])],
          ["module", "core.runtime"],
          ["reason", stopping.turnControl.reason],
          ["status", "completed"],
          ["toolCallId", stopping.toolCallId],
          ["toolName", stopping.toolName],
        ]),
      );
      return "continue" as const;
    }
    if (this.state.activeTurn) {
      await this.host.fallbackPendingGuidesToQueue(
        bag([
          ["activeTurn", this.state.activeTurn],
          ["events", this.state.events],
          ["reasonCode", GUIDE_PARK],
          ["traceContext", this.state.turnTraceContext],
        ]) as never,
      );
    }
    report(
      this.host,
      "info",
      phrase(["Tool result ", "requested turn stop"]),
      bag([
        ["event", phrase(["tool.turn_control.", "stop"])],
        ["module", "core.runtime"],
        ["reason", stopping.turnControl?.reason],
        ["status", "completed"],
        ["toolCallId", stopping.toolCallId],
        ["toolName", stopping.toolName],
      ]),
    );
    if (this.state.activeTurn) this.state.activeTurn.steerable = false;
    this.adopt(this.state.turnMachine.complete(this.state.modelResponse, "success"));
    return "break" as const;
  }

  private async close(results: readonly ToolExecutionResult[]): Promise<"continue" | "break"> {
    const stopping = results.find((result) => result.turnControl?.stopTurnAfterResult === true);
    if (stopping) return this.stopTurn(stopping);
    await handleToolCallAnomalyWarnings(
      this.host,
      this.state,
      bag([
        ["modelTraceContext", this.options.modelTraceContext],
        ["toolCalls", this.options.toolCalls],
      ]),
    );
    await persistToolModelStepFinish(this.host, this.state, this.options);
    await drainInlineGuideForNextRequest(this.host, this.state);
    recordCompletedToolBatch(this.state);
    report(
      this.host,
      "debug",
      phrase(["After inject, ", "message count"]),
      bag([
        ["compactToolTurnsSinceLastCompact", this.state.compactTracking?.toolTurnsSinceCompact],
        ["count", this.host.messageHistory.getMessageCount()],
        [
          "reactiveCompactAttemptedInCurrentModelStep",
          this.state.reactiveCompactAttemptedInCurrentModelStep,
        ],
      ]),
    );
    return "continue" as const;
  }
}

export async function executeToolCallsForModelStep(
  this: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: BatchOptions,
): Promise<"continue" | "break"> {
  const batch = new DeclaredToolBatch(this, state, options);
  return batch.run();
}
