// SPDX-License-Identifier: Apache-2.0
// 无工具步的收尾：先落助手或按锚点丢弃，再按 automation、guide、stop hook 分流。
import { createRuntimeAssistantEntry } from "../../../agent/message-history.js";
import {
  HookEventName,
  TurnMachineImpl,
  createMessageId,
  createPartId,
  type MessageId,
  type Model,
  type TraceContext,
} from "../../deps.js";
import { emptyTokenUsageInfo, toTokenUsageInfo } from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { RuntimeModelTextResult } from "../../types.js";
import { assignKeys, phrase } from "./m02-record.js";
import {
  appendTurnRequestEntries,
  commitAssistantToTurnRequest,
  commitTurnRequestEntries,
} from "./m02-continuation.js";
import { drainInlineGuideForNextRequest } from "./m02-guide.js";
import { recordModelHistoryRound, type RegularTurnLoopState } from "./m02-loop-state.js";

const MISSING_ASSISTANT = phrase([
  "Model-backed assistant persistence ",
  "requires the loop Model",
]);
const MISSING_STOP = phrase(["Model-backed turn stop ", "requires the loop Model"]);
const NO_TOOL_BOUNDARY = phrase(["guide.", "noToolBoundary"]) as "guide.noToolBoundary";

type PointerKey =
  | "latestAssistantMessageId"
  | "latestAssistantTurnId"
  | "latestConversationMessageId";
type RequiredPointers = { [Key in PointerKey]: AgentRuntimeInternal[Key] };

export interface AssistantPersistenceAnchor extends RequiredPointers {
  // 丢弃未提交助手时，只回写仍指向这条消息的指针。
}

type KeptAssistant = {
  assistantPersistenceAnchor: AssistantPersistenceAnchor; // m02
  assistantCreatedAt: number; // m02
  assistantMessageId: MessageId; // m02
  includeEmptyAssistant: boolean; // m02
  modelTraceContext: TraceContext; // m02
  result: RuntimeModelTextResult; // m02
};

type StopOptions = {
  assistantPersistenceAnchor: AssistantPersistenceAnchor; // m02
  assistantCreatedAt: number; // m02
  assistantMessageId: MessageId; // m02
  modelTraceContext: TraceContext; // m02
  result: RuntimeModelTextResult; // m02
};

type LimitCarrier = {
  error: { data: Record<string, unknown>; name: string }; // m02
  finishReason: string; // m02
  model: Model; // m02
  modelTraceContext: TraceContext; // m02
};

function adopt(state: RegularTurnLoopState, next: unknown): void {
  state.turnMachine = new TurnMachineImpl(next as never);
}

function stepFinish(
  runtime: AgentRuntimeInternal, // m02
  messageId: MessageId,
  reason: string, // m02
  tokens: unknown,
) {
  // m02
  return assignKeys([
    ["id", createPartId()],
    ["sessionID", runtime.sessionId],
    ["messageID", messageId],
    ["type", "step-finish"],
    ["reason", reason],
    ["cost", 0],
    ["tokens", tokens],
  ]);
}

function successClosure(reason: string, tokens: unknown) {
  return assignKeys([
    ["completed", Date.now()],
    ["finish", reason],
    ["tokens", tokens],
  ]);
}

function failedClosure(reason: string, tokens: unknown, fault: LimitCarrier["error"]) {
  return assignKeys([
    ["completed", Date.now()],
    ["error", fault],
    ["finish", reason],
    ["tokens", tokens],
  ]);
}

export function captureAssistantPersistenceAnchor(
  // m02
  runtime: AgentRuntimeInternal, // m02
): AssistantPersistenceAnchor {
  // m02
  return assignKeys<AssistantPersistenceAnchor>([
    ["latestAssistantMessageId", runtime.latestAssistantMessageId],
    ["latestAssistantTurnId", runtime.latestAssistantTurnId],
    ["latestConversationMessageId", runtime.latestConversationMessageId],
  ]);
}

function rewindPointers(
  runtime: AgentRuntimeInternal, // m02
  messageId: MessageId,
  anchor: AssistantPersistenceAnchor,
): void {
  // m02
  const conversationStillOwns = runtime.latestConversationMessageId === messageId;
  const assistantStillOwns = runtime.latestAssistantMessageId === messageId;
  if (conversationStillOwns)
    runtime.latestConversationMessageId = anchor.latestConversationMessageId;
  if (assistantStillOwns) {
    runtime.latestAssistantMessageId = anchor.latestAssistantMessageId;
    runtime.latestAssistantTurnId = anchor.latestAssistantTurnId;
  }
}

async function discardAssistant(
  runtime: AgentRuntimeInternal, // m02
  options: KeptAssistant,
): Promise<void> {
  // m02
  const store = runtime.sessionStore; // m02
  if (store) {
    await store.removeMessage(
      assignKeys([
        ["sessionID", runtime.sessionId],
        ["messageID", options.assistantMessageId],
      ]) as never,
    );
  }
  rewindPointers(runtime, options.assistantMessageId, options.assistantPersistenceAnchor);
}

export async function persistCompletedAssistantStep(
  // m02
  runtime: AgentRuntimeInternal, // m02
  state: RegularTurnLoopState, // m02
  options: KeptAssistant,
): Promise<boolean> {
  // m02
  const chosen = state.model;
  if (chosen == null) throw new Error(MISSING_ASSISTANT);
  let stored = commitAssistantToTurnRequest(runtime, state, options.result, undefined);
  if (stored === false && options.includeEmptyAssistant) {
    const blank = createRuntimeAssistantEntry(
      "", // m02
      undefined, // m02
      undefined, // m02
      chosen,
      toTokenUsageInfo(options.result.usage), // m02
    );
    commitTurnRequestEntries(runtime, state.turnRequestState, [blank]);
    stored = true;
  }
  if (stored === false) {
    await discardAssistant(runtime, options);
    return stored; // m02
  }
  const tokens = toTokenUsageInfo(options.result.usage); // m02
  const reason = options.result.finishReason;
  await runtime.persistPart(
    // m02
    stepFinish(runtime, options.assistantMessageId, reason, tokens) as never,
    options.modelTraceContext, // m02
  );
  await runtime.persistAssistantMessage(
    // m02
    options.assistantMessageId, // m02
    state.currentUserMessageId, // m02
    options.assistantCreatedAt, // m02
    successClosure(reason, tokens),
    options.modelTraceContext, // m02
    chosen,
  );
  return stored; // m02
}

export async function persistOutputTokenLimitErrorCarrier(
  // m02
  runtime: AgentRuntimeInternal, // m02
  state: RegularTurnLoopState, // m02
  options: LimitCarrier,
): Promise<void> {
  // m02
  const messageId = createMessageId(); // m02
  const createdAt = Date.now(); // m02
  const tokens = emptyTokenUsageInfo(); // m02
  const trace = options.modelTraceContext;
  const parent = state.currentUserMessageId;
  await runtime.persistAssistantMessage(
    // m02
    messageId, // m02
    parent, // m02
    createdAt, // m02
    undefined, // m02
    trace, // m02
    options.model, // m02
  );
  await runtime.persistPart(
    // m02
    stepFinish(runtime, messageId, options.finishReason, tokens) as never,
    trace, // m02
  );
  await runtime.persistAssistantMessage(
    // m02
    messageId, // m02
    parent, // m02
    createdAt, // m02
    failedClosure(options.finishReason, tokens, options.error),
    trace, // m02
    options.model, // m02
  );
}

async function parkGuides(
  runtime: AgentRuntimeInternal, // m02
  state: RegularTurnLoopState, // m02
): Promise<void> {
  // m02
  const slot = state.activeTurn;
  if (!slot) return;
  await runtime.fallbackPendingGuidesToQueue(
    assignKeys([
      ["activeTurn", slot],
      ["events", state.events],
      ["reasonCode", NO_TOOL_BOUNDARY],
      ["traceContext", state.turnTraceContext],
    ]) as never,
  );
}

function freezeSteering(state: RegularTurnLoopState): void {
  const slot = state.activeTurn;
  if (slot) slot.steerable = false;
}

function markStable(state: RegularTurnLoopState, assistantMessageId: MessageId): void {
  state.stableProductStartMessageId = state.currentUserMessageId; // m02
  state.stableBoundaryAssistantMessageId = assistantMessageId;
  adopt(state, state.turnMachine.complete(state.modelResponse, "success"));
}

async function stopAtBoundary(
  runtime: AgentRuntimeInternal, // m02
  state: RegularTurnLoopState, // m02
  assistantMessageId: MessageId, // m02
): Promise<"break"> {
  await parkGuides(runtime, state);
  freezeSteering(state);
  markStable(state, assistantMessageId);
  return "break"; // m02
}

function followGuide(state: RegularTurnLoopState): "continue" {
  adopt(state, state.turnMachine.aggregateResults());
  return "continue"; // m02
}

async function maybeContinueOnHooks(
  runtime: AgentRuntimeInternal, // m02
  state: RegularTurnLoopState, // m02
): Promise<"continue" | undefined> {
  const repeated = state.stopHookContinuationCount > 0;
  const hookResult = await runtime.runStopHooks(
    state.modelResponse, // m02
    state.toolCallCount, // m02
    state.turnTraceContext, // m02
    state.turnAbortSignal, // m02
    repeated,
  );
  const again = runtime.shouldContinueAfterStopHooks(hookResult, state.stopHookContinuationCount);
  if (again === false) return undefined;
  state.stopHookContinuationCount += 1; // m02
  const injected = runtime.injectHookAdditionalContextIntoMessageHistory(
    HookEventName.Stop, // m02
    hookResult.additionalContexts, // m02
  );
  const appended = injected ? [injected] : [];
  appendTurnRequestEntries(state.turnRequestState, appended);
  adopt(state, state.turnMachine.aggregateResults());
  return "continue"; // m02
}

export async function finishModelStepWithoutToolCalls( // m02
  this: AgentRuntimeInternal,
  // m02
  state: RegularTurnLoopState, // m02
  options: StopOptions,
): Promise<"continue" | "break"> {
  // m02
  const runtime: AgentRuntimeInternal = this;
  if (state.model == null) throw new Error(MISSING_STOP);
  const request = assignKeys<KeptAssistant>([
    ["assistantPersistenceAnchor", options.assistantPersistenceAnchor],
    ["assistantCreatedAt", options.assistantCreatedAt],
    ["assistantMessageId", options.assistantMessageId],
    ["includeEmptyAssistant", true],
    ["modelTraceContext", options.modelTraceContext],
    ["result", options.result],
  ]);
  const kept = await persistCompletedAssistantStep(runtime, state, request);
  if (kept) recordModelHistoryRound(state);
  if (state.automationCreateLimitReached)
    return stopAtBoundary(runtime, state, options.assistantMessageId);
  const drained = await drainInlineGuideForNextRequest(runtime, state);
  if (drained) return followGuide(state);
  const hooked = await maybeContinueOnHooks(runtime, state);
  if (hooked !== undefined) return hooked;
  return stopAtBoundary(runtime, state, options.assistantMessageId);
}
