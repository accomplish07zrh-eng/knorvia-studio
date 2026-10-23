// SPDX-License-Identifier: Apache-2.0
// 工具批：声明序落账，执行可并行，记录按声明序收口。取消检查点先攒后抛。
import { createRuntimeToolResultEntry } from "../../../agent/message-history.js";
import { recordBrowserTurnToolResult } from "@knorvia/repl-core";
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
import { commitTurnRequestEntries } from "../turn-output-token-continuation.js";
import { drainInlineGuideForNextRequest } from "../turn-guide-drain.js";
import {
  isAutomationMutationRestrictedTurn,
  isOffPeakCreateRestrictedTurn,
  recordCompletedToolBatch,
  type RegularTurnLoopState,
} from "../turn-loop-state.js";
import { layer, report } from "./m02-record.js";
import { persistToolModelStepFinish } from "../turn-step-finish.js";
import { mcpToolPartMetadata } from "../tool-part-metadata.js";
import {
  persistPendingToolPart,
  projectToolNameForNonEmptyBoundary,
} from "../tool-part-persistence.js";
import { emitNestedModelUsageEvents } from "../turn-nested-model-usage.js";
import { steerToolBatchFollowUp } from "../turn-tool-batch-follow-up.js";
import {
  completedToolBatchState,
  failedToolBatchState,
  runningToolBatchState,
  toolBatchResultDiagnostic,
  type ToolBatchPartFacts,
} from "../turn-tool-batch-parts.js";
import { recordToolUsageFromResult } from "../turn-tool-usage.js";
import { handleToolCallAnomalyWarnings } from "../turn-tool-warnings.js";

const MISSING_MODEL = "Model-backed tool execution requires the loop Model";
const GUIDE_PARK = "guide.noToolBoundary" as const;
const RUNTIME_MODULE = "core.runtime";

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
    this.calls = options.toolCalls.map((call) => {
      const id = call.id as ToolCallId;
      const { name, input } = call;
      return { id, name, input };
    });
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
    const { events } = this.state;
    const traceContext = this.options.modelTraceContext;
    await emitNestedModelUsageEvents(this.host, { events, results, traceContext });
    this.completeMachine(results);
    report(this.host, "debug", "Tools executed", toolBatchResultDiagnostic(results));
    report(this.host, "debug", "Injecting tool results", { resultCount: results.length });
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
    return { declarationIndex, partID, input, startedAt };
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
    const { assistantMessageId, modelTraceContext: traceContext } = this.options;
    const { declarationIndex, input, partID } = part;
    const model = this.model;
    const metadata = mcpToolPartMetadata(presentation);
    return {
      assistantMessageId,
      declarationIndex,
      input,
      partID,
      toolCall,
      traceContext,
      model,
      metadata,
    };
  }

  private closedLedger(
    toolCall: ToolCall,
    part: ToolBatchPartFacts,
    entry: StreamedToolExecutionResult | undefined,
  ): LedgerRequest {
    const assistantMessageId = this.options.assistantMessageId;
    const status = "tool_call_closed" as const;
    const executionTiming = "during_stream" as const;
    return layer<LedgerRequest>(
      { assistantMessageId, toolCall, status },
      entry ? { executionTiming } : undefined,
      { input: part.input },
    );
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
      const assistantMessageId = this.options.assistantMessageId;
      const status = "tool_queued" as const;
      const input = this.parts.get(toolCall.id)?.input;
      const request: LedgerRequest = { assistantMessageId, toolCall, status, input };
      await emitStreamingToolLedgerUpdate(
        this.host,
        this.state.events,
        this.options.modelTraceContext,
        request,
      );
    }
  }

  private executionOptions(): ExecuteToolsOptions {
    const automationTurn = isAutomationMutationRestrictedTurn(this.state);
    const offPeakTurn = isOffPeakCreateRestrictedTurn(this.state);
    const signal = this.state.turnAbortSignal;
    const traceContext = this.options.modelTraceContext;
    const { subagentModelOverride, model } = this.state;
    return {
      automationTurn,
      offPeakTurn,
      signal,
      traceContext,
      subagentModelOverride,
      model,
      onBatchStart: (ids: string[]) => this.onBatchStart(ids),
    };
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
    const streamedToolCallCount = this.streamed.size;
    const toolCallCount = pending.length;
    const tools = pending.map((call) => call.name);
    report(this.host, "debug", "Executing tools", { streamedToolCallCount, toolCallCount, tools });
    const execution = await this.host.executeTools(
      pending,
      pendingSchedule,
      this.executionOptions(),
    );
    this.pendingResults = execution.results;
    this.state.events.push(...execution.events);
  }

  private toolShell(
    callId: ToolCallId,
    part: ToolBatchPartFacts,
    boundary: Boundary,
    state: unknown,
  ): MessagePart {
    const { sessionId } = this.host;
    const { assistantMessageId } = this.options;
    const { partID: id, declarationIndex } = part;
    const { toolName, metadata } = boundary;
    return {
      id,
      sessionID: sessionId,
      messageID: assistantMessageId,
      type: "tool",
      callID: callId,
      declarationIndex,
      tool: toolName,
      metadata,
      state,
    } as MessagePart;
  }

  private runningPart(call: ToolCall, part: ToolBatchPartFacts, boundary: Boundary): MessagePart {
    return this.toolShell(
      call.id as ToolCallId,
      part,
      boundary,
      runningToolBatchState(this.host, call, part, boundary),
    );
  }

  private startedLedger(call: ToolCall, part: ToolBatchPartFacts): LedgerRequest {
    const assistantMessageId = this.options.assistantMessageId;
    const status = "tool_started" as const;
    const input = part.input;
    const startedAt = new Date(part.startedAt);
    return { assistantMessageId, toolCall: call, status, input, startedAt };
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
      const { output, toolName } = result;
      const { sessionId } = this.host;
      const { turnId } = this.state;
      recordBrowserTurnToolResult({ output, sessionId, toolName, turnId });
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
      const { success } = result;
      const content = this.toolContent(result);
      const done = { success, content };
      this.adopt(this.state.turnMachine.completeTool(result.toolCallId as ToolCallId, done));
    }
    this.adopt(this.state.turnMachine.aggregateResults());
  }

  private mediaRequest(result: ToolExecutionResult): MediaRequest {
    const { artifactStore, sessionId, sessionStore } = this.host;
    const { assistantMessageId, modelTraceContext: traceContext } = this.options;
    const { turnAbortSignal: signal, turnId } = this.state;
    const { toolCallId, toolName } = result;
    return {
      artifactStore,
      assistantMessageId,
      content: modelContentForToolResult(result),
      sessionId,
      sessionStore,
      signal,
      toolCallId,
      toolName,
      traceContext,
      turnId,
    };
  }

  private terminalPart(
    result: ToolExecutionResult,
    part: ToolBatchPartFacts,
    boundary: Boundary,
    state: unknown,
  ): MessagePart {
    return this.toolShell(result.toolCallId as ToolCallId, part, boundary, state);
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
      const { turnAbortSignal: abortSignal, events, userMessageId: messageId } = this.state;
      const toolMessageId = this.options.assistantMessageId;
      const traceContext = this.options.modelTraceContext;
      await this.host.emitFileMutationCheckpoint({
        abortSignal,
        events,
        messageId,
        result,
        toolMessageId,
        traceContext,
      });
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
    const assistantMessageId = this.options.assistantMessageId;
    const status = "tool_result_committed" as const;
    const input = part?.input;
    const { startedAt, completedAt: committedAt } = result;
    const resultPartId = part?.partID;
    const executionTiming = timing;
    return {
      assistantMessageId,
      toolCall: call,
      status,
      input,
      startedAt,
      committedAt,
      resultPartId,
      recoveryAnchorId,
      executionTiming,
    };
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
    const assistantMessageId = this.options.assistantMessageId;
    const toolCallId = result.toolCallId as ToolCallId;
    const toolName = boundary.toolName;
    const { success, completedAt: committedAt } = result;
    const resultPartId = part?.partID;
    const anchor: AnchorRequest = {
      assistantMessageId,
      toolCallId,
      toolName,
      success,
      resultPartId,
      committedAt,
    };
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
    report(this.host, "debug", "addToolResult", {
      toolCallId: result.toolCallId,
      toolName: result.toolName,
      success: result.success,
      contentLength: output.length,
    });
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

  private controlNotice(event: string, stopping: ToolExecutionResult) {
    const module = RUNTIME_MODULE;
    const reason = stopping.turnControl?.reason;
    const status = "completed";
    const { toolCallId, toolName } = stopping;
    return { event, module, reason, status, toolCallId, toolName };
  }

  private async stopTurn(stopping: ToolExecutionResult): Promise<"continue" | "break"> {
    await persistToolModelStepFinish(this.host, this.state, this.options);
    if (stopping.turnControl?.reason === "automation_create_limit") {
      this.state.automationCreateLimitReached = true;
      recordCompletedToolBatch(this.state);
      report(
        this.host,
        "info",
        "Automation create limit switched turn to text-only response",
        this.controlNotice("automation.create_limit.text_only_continuation", stopping),
      );
      return "continue" as const;
    }
    if (this.state.activeTurn) {
      const { activeTurn, events, turnTraceContext } = this.state;
      await this.host.fallbackPendingGuidesToQueue({
        activeTurn,
        events,
        reasonCode: GUIDE_PARK,
        traceContext: turnTraceContext,
      } as never);
    }
    report(
      this.host,
      "info",
      "Tool result requested turn stop",
      this.controlNotice("tool.turn_control.stop", stopping),
    );
    if (this.state.activeTurn) this.state.activeTurn.steerable = false;
    this.adopt(this.state.turnMachine.complete(this.state.modelResponse, "success"));
    return "break" as const;
  }

  private async close(results: readonly ToolExecutionResult[]): Promise<"continue" | "break"> {
    const stopping = results.find((result) => result.turnControl?.stopTurnAfterResult === true);
    if (stopping) return this.stopTurn(stopping);
    const { modelTraceContext, toolCalls } = this.options;
    await handleToolCallAnomalyWarnings(this.host, this.state, { modelTraceContext, toolCalls });
    await persistToolModelStepFinish(this.host, this.state, this.options);
    await drainInlineGuideForNextRequest(this.host, this.state);
    recordCompletedToolBatch(this.state);
    const compactToolTurnsSinceLastCompact = this.state.compactTracking?.toolTurnsSinceCompact;
    const count = this.host.messageHistory.getMessageCount();
    const reactiveCompactAttemptedInCurrentModelStep =
      this.state.reactiveCompactAttemptedInCurrentModelStep;
    report(this.host, "debug", "After inject, message count", {
      compactToolTurnsSinceLastCompact,
      count,
      reactiveCompactAttemptedInCurrentModelStep,
    });
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
