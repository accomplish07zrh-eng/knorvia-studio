// SPDX-License-Identifier: Apache-2.0
// 回合模型步：遥测包装、请求准备、失败分路、成功收尾。失败分路顺序保持原样。
import { beginLocalTurnPreparation } from "@knorvia/contracts";
import {
  SessionEventType,
  TurnMachineImpl,
  createMessageId,
  getModelUsageTotalTokens,
  type MessageId,
  type ModelNetworkStatusEvent,
} from "../../deps.js";
import * as helpers from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { RuntimeModelStreamSnapshot, RuntimeModelTextResult } from "../../types.js";
import { resolveNormalRequestMaxOutputTokens } from "../model-token-limits.js";
import { createStreamingToolCoordinator } from "../streaming-tool-coordinator.js";
import { persistCancelledStreamSnapshot } from "../cancelled-stream-persistence.js";
import * as retry from "../streaming-recovery.js";
import * as output from "./m02-continuation.js";
import { recordModelHistoryRound, type RegularTurnLoopState } from "./m02-loop-state.js";
import { assignKeys } from "./m02-record.js";
import * as shapes from "./m02-step-shapes.js";
import {
  commitCancelledAssistantSnapshot,
  logTurnModelDiagnostics,
  logTurnModelSuspiciousEmpty,
  persistedFailure,
  prepareFailureFacts,
} from "./m02-step-records.js";
import { recoverTurnModelContext } from "./m02-step-recover.js";
import {
  querySourceForTask,
  recordMainTurnCacheHitUsage,
  recordMainTurnModelUsage,
} from "./m02-step-usage.js";
import {
  finishModelStepWithoutToolCalls,
  persistCompletedAssistantStep,
  persistOutputTokenLimitErrorCarrier,
  captureAssistantPersistenceAnchor,
} from "./m02-stop.js";
import { executeToolCallsForModelStep } from "./m02-tool-batch.js";

type ModelStepResult = "break" | "continue" | "output_continuation";
type StepOptions = shapes.ModelStepInputs;
type ExtractedCalls = ReturnType<AgentRuntimeInternal["extractToolCallsFromResult"]>;
type AssistantUpdate = NonNullable<Parameters<AgentRuntimeInternal["persistAssistantMessage"]>[3]>;
type ContinuationKind = ReturnType<typeof output.classifyOutputTokenContinuation>;

function bag<T extends object>(pairs: ReadonlyArray<readonly [string, unknown]>): T {
  return assignKeys<T>(pairs);
}

function labelFor(
  outcome: ModelStepResult,
): "model_completed" | "tool_requested" | "turn_completed" {
  switch (outcome) {
    case "output_continuation":
      return "model_completed";
    case "continue":
      return "tool_requested";
    default:
      return "turn_completed";
  }
}

function noteStepFailure(
  telemetry: {
    finishCancelled: (reason: "abort_signal") => void;
    finishFailed: (stage: "unhandled", category: "unknown", error: unknown) => void;
  },
  error: unknown,
  signal: AbortSignal,
): void {
  const cancelled = helpers.isTurnCancellationError(error, signal);
  if (cancelled) {
    telemetry.finishCancelled("abort_signal");
    return;
  }
  telemetry.finishFailed("unhandled", "unknown", error);
}

function pauseFor(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

class ModelStep {
  readonly runtime: AgentRuntimeInternal;
  readonly state: RegularTurnLoopState;
  readonly options: StepOptions;
  readonly assistantMessageId: MessageId;
  readonly model: RegularTurnLoopState["model"];
  readonly modelStepIndex: number;
  readonly startedAt: number;
  readonly anchor: ReturnType<typeof captureAssistantPersistenceAnchor>;
  readonly querySource: ReturnType<typeof querySourceForTask>;
  readonly providerId: RegularTurnLoopState["model"]["providerId"];
  readonly modelId: RegularTurnLoopState["model"]["modelId"];
  readonly modelMaxOutputTokens: number;
  readonly contextWindow: number | undefined;
  trace!: ReturnType<typeof shapes.modelStepTrace>;
  finishPreparation!: () => void;
  coordinator!: ReturnType<typeof createStreamingToolCoordinator>;
  networkEventStartIndex = 0;
  snapshot: RuntimeModelStreamSnapshot;
  streamRecovery: RegularTurnLoopState["pendingStreamRecoveryRequest"];
  startedRequestId: string | undefined;
  failedRequestId: string | undefined;

  constructor(
    runtime: AgentRuntimeInternal,
    state: RegularTurnLoopState,
    options: StepOptions,
    assistantMessageId: MessageId,
  ) {
    this.runtime = runtime;
    this.state = state;
    this.options = options;
    this.assistantMessageId = assistantMessageId;
    this.model = state.model;
    this.modelStepIndex = state.modelStepCount;
    this.startedAt = Date.now();
    this.anchor = captureAssistantPersistenceAnchor(runtime);
    this.querySource = querySourceForTask(runtime.config.taskType);
    // await 之前先读身份，再读输出上限和窗口。
    this.providerId = this.model.providerId;
    this.modelId = this.model.modelId;
    this.modelMaxOutputTokens = this.model.optionSpecs.maxOutputTokens.max;
    this.contextWindow = this.model.properties.contextWindow;
    this.snapshot = bag<RuntimeModelStreamSnapshot>([
      ["reasoning", []],
      ["text", ""],
    ]);
  }

  async run(): Promise<ModelStepResult> {
    await this.prepare();
    const asked = await this.ask();
    if (asked === "continue") return "continue";
    return this.accept(asked);
  }

  private async prepare(): Promise<void> {
    this.trace = shapes.modelStepTrace(this.state, this.model, this.querySource);
    this.runtime.logModelRequestSteeringContext(
      shapes.steeringFields(this.state, this.options, this.trace),
    );
    this.finishPreparation = beginLocalTurnPreparation(this.trace, "persistence");
    await this.runtime.persistAssistantMessage(
      this.assistantMessageId,
      this.state.currentUserMessageId,
      this.startedAt,
      undefined,
      this.trace,
      this.model,
    );
    await this.runtime.persistPart(
      shapes.stepStartPart(this.runtime, this.assistantMessageId),
      this.trace,
    );
    const requestEvent = this.runtime.createEvent(
      SessionEventType.ModelRequest,
      shapes.modelRequestPayload(this.state, this.options, this.model, this.querySource),
      this.trace,
    );
    await this.runtime.appendEvent(requestEvent, this.trace);
    this.state.events.push(requestEvent);
    this.finishPreparation();
    this.coordinator = createStreamingToolCoordinator(
      this.runtime,
      this.state,
      bag<Parameters<typeof createStreamingToolCoordinator>[2]>([
        ["assistantMessageId", this.assistantMessageId],
        ["model", this.model],
        ["traceContext", this.trace],
      ]),
    );
    this.networkEventStartIndex = this.state.events.length;
  }

  private captureRecovery(): void {
    this.streamRecovery = this.state.pendingStreamRecoveryRequest;
    this.state.pendingStreamRecoveryRequest = undefined;
  }

  private noteNetwork(event: ModelNetworkStatusEvent): void {
    switch (event.type) {
      case "model_request_started":
        this.startedRequestId = event.requestId;
        return;
      case "model_stream_stalled":
      case "model_request_failed":
        this.failedRequestId = event.requestId;
        return;
      default:
        return;
    }
  }

  private request(normalBudget: number) {
    const fields = bag<Parameters<typeof shapes.buildTurnModelRequest>[3]>([
      ["assistantMessageId", this.assistantMessageId],
      ["model", this.model],
      ["modelTraceContext", this.trace],
      ["normalBudget", normalBudget],
      ["contextWindow", this.contextWindow],
      ["streamRecovery", this.streamRecovery],
      ["coordinator", this.coordinator],
      [
        "onStreamSnapshot",
        (next: RuntimeModelStreamSnapshot) => {
          this.snapshot = next;
        },
      ],
      [
        "onModelNetworkStatus",
        (event: ModelNetworkStatusEvent) => {
          this.noteNetwork(event);
        },
      ],
    ]);
    return shapes.buildTurnModelRequest(this.runtime, this.state, this.options, fields);
  }

  private usageFields(): shapes.UsageFields {
    return bag<shapes.UsageFields>([
      ["assistantMessageId", this.assistantMessageId],
      ["model", this.model],
      ["modelTraceContext", this.trace],
      ["networkEventStartIndex", this.networkEventStartIndex],
      ["startedAt", this.startedAt],
    ]);
  }

  private async ask(): Promise<RuntimeModelTextResult | "continue"> {
    this.captureRecovery();
    try {
      const normalBudget = resolveNormalRequestMaxOutputTokens(
        bag<Parameters<typeof resolveNormalRequestMaxOutputTokens>[0]>([
          ["modelMaxOutputTokens", this.modelMaxOutputTokens],
        ]),
      );
      const result = await this.runtime.runModelTextRequest(this.request(normalBudget));
      helpers.throwIfTurnAborted(this.state.turnAbortSignal);
      return result;
    } catch (error) {
      return this.onModelFault(error);
    }
  }

  private recover(error: unknown): Promise<boolean> {
    return recoverTurnModelContext(
      this.runtime,
      this.state,
      error,
      this.modelStepIndex,
      this.options.requestEntries,
    );
  }

  private async retryStartPlan(
    error: unknown,
    retryDelayMs: number,
    requestFailureId: string | undefined,
  ): Promise<void> {
    const attempt = retry.beginStartPlanBusyAdmissionRetryAttempt(this.state);
    shapes.logStartPlanRetry(this.runtime, this.trace, retryDelayMs, attempt);
    await retry.emitStreamRecoveryStarted(
      this.runtime,
      this.state,
      shapes.recoveryFields(this.assistantMessageId, requestFailureId, this.trace),
      error,
      attempt,
    );
    const discarded = bag<AssistantUpdate>([
      ["completed", Date.now()],
      ["finish", "start_plan_admission_retry_discarded"],
    ]);
    await this.runtime.persistAssistantMessage(
      this.assistantMessageId,
      this.state.userMessageId,
      this.startedAt,
      discarded,
      this.trace,
      this.model,
    );
    this.state.modelResponse = "";
    this.state.modelStepCount += 1;
    recordModelHistoryRound(this.state);
    this.adopt(this.state.turnMachine.receiveModelResponse(""));
    this.adopt(this.state.turnMachine.aggregateResults());
    const facts = bag<Parameters<typeof retry.emitStreamRecoveryRetryEvents>[3]>([
      ["maxRetries", attempt.maxRetries],
      ["retryNumber", attempt.retryNumber],
      ["discardedReasoningBytes", 0],
      ["discardedTextBytes", 0],
      ["reason", "no_tool_committed"],
      ["toolCallIds", []],
    ]);
    await retry.emitStreamRecoveryRetryEvents(
      this.runtime,
      this.state,
      shapes.recoveryFields(this.assistantMessageId, requestFailureId, this.trace),
      facts,
    );
    await this.coordinator.abandon("model_failed");
    await pauseFor(retryDelayMs);
    helpers.throwIfTurnAborted(this.state.turnAbortSignal);
  }

  private async onModelFault(error: unknown): Promise<"continue"> {
    await recordMainTurnModelUsage(
      this.runtime,
      this.state,
      shapes.failedUsage(this.state, this.usageFields(), error),
    );
    const requestFailureId = this.failedRequestId ?? this.startedRequestId;
    const toolCountBefore = this.state.toolCallCount;
    const recoveryExtra = requestFailureId
      ? bag<
          NonNullable<
            Parameters<
              ReturnType<typeof createStreamingToolCoordinator>["recoverFromModelFailure"]
            >[2]
          >
        >([["failedRequestId", requestFailureId]])
      : undefined;
    const recovered = await this.coordinator.recoverFromModelFailure(
      error,
      this.startedAt,
      recoveryExtra,
    );
    if (recovered) {
      if (this.state.toolCallCount > toolCountBefore)
        output.completeOutputTokenRecovery(this.state.turnRequestState);
      return "continue";
    }
    const retryDelayMs = retry.getStartPlanBusyAdmissionRetryDelayMs(
      bag<Parameters<typeof retry.getStartPlanBusyAdmissionRetryDelayMs>[0]>([
        ["error", error],
        ["providerId", this.providerId],
        ["state", this.state],
        ["turnNumber", this.runtime.turnNumber],
      ]),
    );
    let finalError = error;
    if (!this.state.turnAbortSignal.aborted && retryDelayMs !== undefined) {
      await this.retryStartPlan(error, retryDelayMs, requestFailureId);
      return "continue";
    }
    const busyExhausted =
      this.state.streamRecoveryRetryCount > 0 &&
      !this.state.turnAbortSignal.aborted &&
      retry.isStartPlanBusyStreamRecoveryFailure(error);
    if (busyExhausted) finalError = retry.createStartPlanBusyAutoRetryExhaustedError(error);
    const abandonReason = this.state.turnAbortSignal.aborted ? "cancelled" : "model_failed";
    await this.coordinator.abandon(abandonReason);
    const cancelled =
      this.state.turnAbortSignal.aborted &&
      helpers.isTurnCancellationError(finalError, this.state.turnAbortSignal);
    if (cancelled) await this.keepCancelledSnapshot();
    const failureFacts = prepareFailureFacts(finalError, this.state);
    const failedUpdate = bag<AssistantUpdate>([
      ["completed", Date.now()],
      ["error", persistedFailure(finalError, failureFacts)],
    ]);
    await this.runtime.persistAssistantMessage(
      this.assistantMessageId,
      this.state.userMessageId,
      this.startedAt,
      failedUpdate,
      this.trace,
      this.model,
    );
    const contextHit = helpers.isModelContextExceededError(finalError);
    if (contextHit && (await this.recover(finalError))) return "continue";
    throw finalError;
  }

  private async keepCancelledSnapshot(): Promise<void> {
    await persistCancelledStreamSnapshot(
      this.runtime,
      bag<Parameters<typeof persistCancelledStreamSnapshot>[1]>([
        ["assistantCreatedAt", this.startedAt],
        ["assistantMessageId", this.assistantMessageId],
        ["snapshot", this.snapshot],
        ["traceContext", this.trace],
      ]),
    );
    commitCancelledAssistantSnapshot(this.runtime, this.state, this.snapshot);
  }

  private adopt(next: unknown): void {
    this.state.turnMachine = new TurnMachineImpl(next as never);
  }

  private noteCacheHit(result: RuntimeModelTextResult): void {
    const usageNow = result.usage;
    // 三次读取是契约：真值、大于 0、再把该值交给 setCacheHit。
    const seen = Boolean(usageNow.cacheReadTokens);
    if (!seen) return;
    const fresh = usageNow.cacheReadTokens;
    const above = typeof fresh === "number" && fresh > 0;
    if (!above) return;
    const amount = usageNow.cacheReadTokens;
    this.runtime.messageHistory.setCacheHit(amount);
  }

  private applyAutomationLimit(toolCalls: ExtractedCalls): ExtractedCalls {
    if (this.state.automationCreateLimitReached && toolCalls.length > 0) {
      shapes.warnAutomationTools(this.runtime, toolCalls);
      this.state.modelResponse = shapes.automationLimitResponse(this.state.input);
      return [];
    }
    if (this.state.automationCreateLimitReached && this.state.modelResponse.trim().length === 0) {
      this.state.modelResponse = shapes.automationLimitResponse(this.state.input);
    }
    return toolCalls;
  }

  private preparedCalls(result: RuntimeModelTextResult): {
    toolCalls: ExtractedCalls;
    providerToolCallCount: number;
    localTerminal: boolean;
  } {
    const extracted = this.runtime.extractToolCallsFromResult(result);
    const providerToolCallCount = extracted.length;
    const localTerminal = this.state.automationCreateLimitReached === true;
    const toolCalls = this.applyAutomationLimit(extracted);
    return { toolCalls, providerToolCallCount, localTerminal };
  }

  private continuationOf(
    result: RuntimeModelTextResult,
    prepared: { providerToolCallCount: number; localTerminal: boolean },
    rawFinishReason: string | undefined,
  ): ContinuationKind {
    if (prepared.localTerminal) return "none";
    return output.classifyOutputTokenContinuation(
      bag<Parameters<typeof output.classifyOutputTokenContinuation>[0]>([
        ["continuationCount", this.state.turnRequestState.outputTokenContinuationCount],
        ["finishReason", result.finishReason],
        ["rawFinishReason", rawFinishReason],
        ["toolCallCount", prepared.providerToolCallCount],
      ]),
    );
  }

  private async stopForContext(
    result: RuntimeModelTextResult,
    toolCalls: ExtractedCalls,
    continuation: ContinuationKind,
    localTerminal: boolean,
    rawFinishReason: string | undefined,
  ): Promise<boolean> {
    const quiet = !localTerminal && continuation === "none" && toolCalls.length === 0;
    if (!quiet) return false;
    const exceeded = helpers.isContextExceededFinishReason(result.finishReason, rawFinishReason);
    if (!exceeded) return false;
    const contextError = helpers.createModelContextExceededFinishError(
      bag<Parameters<typeof helpers.createModelContextExceededFinishError>[0]>([
        ["finishReason", result.finishReason],
        ["rawFinishReason", rawFinishReason],
      ]),
    );
    const healed = await this.recover(contextError);
    if (healed) return true;
    throw contextError;
  }

  private noteSuspicious(
    result: RuntimeModelTextResult,
    toolCalls: ExtractedCalls,
    continuation: ContinuationKind,
    localTerminal: boolean,
    rawFinishReason: string | undefined,
    responseLength: number,
    usage: RuntimeModelTextResult["usage"],
  ): void {
    const quiet = !localTerminal && continuation === "none";
    if (!quiet) return;
    const suspicious = helpers.isSuspiciousEmptyModelResult(
      result.finishReason,
      responseLength,
      toolCalls.length,
      usage,
    );
    if (!suspicious) return;
    logTurnModelSuspiciousEmpty(
      this.runtime,
      this.trace,
      result,
      usage,
      rawFinishReason,
      responseLength,
      toolCalls,
    );
    helpers.finalizeSuspiciousEmptyModelResult(
      shapes.suspiciousResultFields(
        result,
        bag([
          ["providerId", this.providerId],
          ["modelId", this.modelId],
        ]),
        rawFinishReason,
      ),
    );
  }

  private async persistReasoning(result: RuntimeModelTextResult): Promise<void> {
    const blocks = result.reasoning ?? [];
    let index = 0;
    while (index < blocks.length) {
      const reasoning = blocks[index]!;
      index += 1;
      if (!output.hasAssistantReasoningContent(reasoning)) continue;
      await this.runtime.persistPart(
        shapes.reasoningPart(this.runtime, this.assistantMessageId, this.startedAt, reasoning),
        this.trace,
      );
    }
  }

  private async publishComplete(
    result: RuntimeModelTextResult,
    toolCalls: ExtractedCalls,
  ): Promise<void> {
    const cacheHit =
      this.querySource === "main_turn"
        ? recordMainTurnCacheHitUsage(this.runtime, result.usage)
        : undefined;
    const fileEligible = this.querySource === "main_turn" || this.querySource === "subagent";
    const fileChanges =
      fileEligible && toolCalls.length === 0
        ? helpers.buildTurnFileChangeSummary(this.runtime.currentTurnFileChanges)
        : undefined;
    const payload = shapes.modelCompletePayload(
      this.state,
      result,
      this.querySource,
      this.contextWindow,
      cacheHit,
      fileChanges,
      toolCalls,
    );
    const completedEvent = this.runtime.createEvent(
      SessionEventType.ModelComplete,
      payload,
      this.trace,
    );
    await this.runtime.appendEvent(completedEvent, this.trace);
    this.state.events.push(completedEvent);
  }

  private async accept(result: RuntimeModelTextResult): Promise<ModelStepResult> {
    this.state.modelResponse = result.text;
    this.state.modelStepCount += 1;
    this.state.tokenCount += getModelUsageTotalTokens(result.usage);
    this.noteCacheHit(result);
    const prepared = this.preparedCalls(result);
    const usage = result.usage ?? {};
    const responseLength = this.state.modelResponse.length;
    const rawFinishReason = helpers.readRawFinishReason(result.providerMetadata);
    const continuation = this.continuationOf(result, prepared, rawFinishReason);
    logTurnModelDiagnostics(
      this.runtime,
      this.trace,
      result,
      usage,
      rawFinishReason,
      responseLength,
      prepared.toolCalls,
    );
    const contextStopped = await this.stopForContext(
      result,
      prepared.toolCalls,
      continuation,
      prepared.localTerminal,
      rawFinishReason,
    );
    if (contextStopped) return "continue";
    this.noteSuspicious(
      result,
      prepared.toolCalls,
      continuation,
      prepared.localTerminal,
      rawFinishReason,
      responseLength,
      usage,
    );
    if (continuation !== "none") result.finishReason = "length";
    await this.persistReasoning(result);
    if (this.state.modelResponse.length > 0) {
      await this.runtime.persistPart(
        shapes.textPart(this.runtime, this.state, this.assistantMessageId, this.startedAt),
        this.trace,
      );
    }
    await this.publishComplete(result, prepared.toolCalls);
    this.runtime.lastAssistantCompletedAtMs = Date.now();
    await recordMainTurnModelUsage(
      this.runtime,
      this.state,
      shapes.completedUsage(this.usageFields(), result, prepared.toolCalls),
    );
    this.adopt(this.state.turnMachine.receiveModelResponse(this.state.modelResponse));
    helpers.throwIfTurnAborted(this.state.turnAbortSignal);
    shapes.logModelCompletion(
      this.runtime,
      this.state,
      this.trace,
      this.startedAt,
      prepared.toolCalls,
    );
    return this.finishTools(result, prepared.toolCalls, continuation);
  }

  private async finishContinuation(
    result: RuntimeModelTextResult,
    continuation: ContinuationKind,
  ): Promise<ModelStepResult> {
    this.state.turnRequestState.entries = this.options.requestEntries;
    const committed = await persistCompletedAssistantStep(
      this.runtime,
      this.state,
      shapes.completedAssistantFields(
        this.anchor,
        this.startedAt,
        this.assistantMessageId,
        this.trace,
        result,
      ),
    );
    if (committed) recordModelHistoryRound(this.state);
    if (continuation === "continue") {
      output.appendOutputTokenContinuation(this.state.turnRequestState);
      this.state.reactiveCompactAttemptedInCurrentModelStep = false;
      this.adopt(this.state.turnMachine.aggregateResults());
      return "output_continuation";
    }
    const exhausted = shapes.outputLimitError();
    const projected = helpers.projectExecutionErrorPayload(
      exhausted,
      output.OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE,
    );
    output.completeOutputTokenRecovery(this.state.turnRequestState);
    await persistOutputTokenLimitErrorCarrier(
      this.runtime,
      this.state,
      shapes.outputLimitCarrier(exhausted, projected, result, this.model, this.trace),
    );
    if (this.state.activeTurn) this.state.activeTurn.steerable = false;
    throw exhausted;
  }

  private async finishTools(
    result: RuntimeModelTextResult,
    toolCalls: ExtractedCalls,
    continuation: ContinuationKind,
  ): Promise<ModelStepResult> {
    const executable = toolCalls.filter((toolCall) => (toolCall.providerExecuted ? false : true));
    const streamedToolResults = await this.coordinator.drain(executable);
    if (continuation !== "none") return this.finishContinuation(result, continuation);
    output.completeOutputTokenRecovery(this.state.turnRequestState);
    if (executable.length === 0) {
      return finishModelStepWithoutToolCalls.call(
        this.runtime,
        this.state,
        shapes.stopFields(this.anchor, this.startedAt, this.assistantMessageId, this.trace, result),
      );
    }
    this.state.toolCallCount += executable.length;
    if (output.commitAssistantToTurnRequest(this.runtime, this.state, result, executable))
      recordModelHistoryRound(this.state);
    return executeToolCallsForModelStep.call(
      this.runtime,
      this.state,
      bag<Parameters<typeof executeToolCallsForModelStep>[1]>([
        ["assistantCreatedAt", this.startedAt],
        ["assistantMessageId", this.assistantMessageId],
        ["modelTraceContext", this.trace],
        ["result", result],
        ["toolCalls", executable],
        ["streamedToolResults", streamedToolResults],
      ]),
    );
  }
}

export async function runModelBackedTurnStep(
  this: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: StepOptions,
): Promise<ModelStepResult> {
  const assistantMessageId = createMessageId();
  const telemetry = this.agentTelemetry.step(
    bag<Parameters<AgentRuntimeInternal["agentTelemetry"]["step"]>[0]>([
      ["stepId", assistantMessageId],
      ["stepIndex", state.modelStepCount],
    ]),
  );
  return telemetry.run(async () => {
    try {
      const outcome = await performModelStep(this, state, options, assistantMessageId);
      telemetry.finishCompleted(labelFor(outcome));
      return outcome;
    } catch (error) {
      noteStepFailure(telemetry, error, state.turnAbortSignal);
      throw error;
    }
  });
}

export async function performModelStep(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: shapes.ModelStepInputs,
  assistantMessageId: MessageId,
): Promise<ModelStepResult> {
  const step = new ModelStep(runtime, state, options, assistantMessageId);
  return step.run();
}
