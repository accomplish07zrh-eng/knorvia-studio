// SPDX-License-Identifier: Apache-2.0
// 无工具时的停止收尾：提交或丢弃助手，再走 automation、guide、stop hooks。
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
import { phrase } from "./m02-record.js";
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

export interface AssistantPersistenceAnchor {
  latestAssistantMessageId: AgentRuntimeInternal["latestAssistantMessageId"];
  latestAssistantTurnId: AgentRuntimeInternal["latestAssistantTurnId"];
  latestConversationMessageId: AgentRuntimeInternal["latestConversationMessageId"];
}

export function captureAssistantPersistenceAnchor(
  runtime: AgentRuntimeInternal,
): AssistantPersistenceAnchor {
  return {
    latestAssistantMessageId: runtime.latestAssistantMessageId,
    latestAssistantTurnId: runtime.latestAssistantTurnId,
    latestConversationMessageId: runtime.latestConversationMessageId,
  };
}

function acceptMachine<T>(state: RegularTurnLoopState, next: T): void {
  state.turnMachine = new TurnMachineImpl(next as never);
}

async function parkGuides(runtime: AgentRuntimeInternal, state: RegularTurnLoopState): Promise<void> {
  const activeTurn = state.activeTurn;
  if (!activeTurn) return;
  await runtime.fallbackPendingGuidesToQueue({
    activeTurn,
    events: state.events,
    reasonCode: NO_TOOL_BOUNDARY,
    traceContext: state.turnTraceContext,
  });
}

function sealProduct(state: RegularTurnLoopState, assistantMessageId: MessageId): void {
  state.stableProductStartMessageId = state.currentUserMessageId;
  state.stableBoundaryAssistantMessageId = assistantMessageId;
  acceptMachine(state, state.turnMachine.complete(state.modelResponse, "success"));
}

export async function persistCompletedAssistantStep(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: {
    assistantPersistenceAnchor: AssistantPersistenceAnchor;
    assistantCreatedAt: number;
    assistantMessageId: MessageId;
    includeEmptyAssistant: boolean;
    modelTraceContext: TraceContext;
    result: RuntimeModelTextResult;
  },
): Promise<boolean> {
  const model = state.model;
  if (!model) throw new Error(MISSING_ASSISTANT);
  let committed = commitAssistantToTurnRequest(runtime, state, options.result, undefined);
  if (!committed && options.includeEmptyAssistant) {
    const blank = createRuntimeAssistantEntry(
      "",
      undefined,
      undefined,
      model,
      toTokenUsageInfo(options.result.usage),
    );
    commitTurnRequestEntries(runtime, state.turnRequestState, [blank]);
    committed = true;
  }
  if (!committed) {
    if (runtime.sessionStore) {
      await runtime.sessionStore.removeMessage({
        sessionID: runtime.sessionId,
        messageID: options.assistantMessageId,
      });
    }
    const anchor = options.assistantPersistenceAnchor;
    // 只回滚仍指向这条被丢弃消息的指针。
    if (runtime.latestConversationMessageId === options.assistantMessageId) {
      runtime.latestConversationMessageId = anchor.latestConversationMessageId;
    }
    if (runtime.latestAssistantMessageId === options.assistantMessageId) {
      runtime.latestAssistantMessageId = anchor.latestAssistantMessageId;
      runtime.latestAssistantTurnId = anchor.latestAssistantTurnId;
    }
    return false;
  }
  const tokens = toTokenUsageInfo(options.result.usage);
  await runtime.persistPart(
    {
      id: createPartId(),
      sessionID: runtime.sessionId,
      messageID: options.assistantMessageId,
      type: "step-finish",
      reason: options.result.finishReason,
      cost: 0,
      tokens,
    },
    options.modelTraceContext,
  );
  await runtime.persistAssistantMessage(
    options.assistantMessageId,
    state.currentUserMessageId,
    options.assistantCreatedAt,
    { completed: Date.now(), finish: options.result.finishReason, tokens },
    options.modelTraceContext,
    model,
  );
  return true;
}

export async function persistOutputTokenLimitErrorCarrier(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: {
    error: { data: Record<string, unknown>; name: string };
    finishReason: string;
    model: Model;
    modelTraceContext: TraceContext;
  },
): Promise<void> {
  const messageId = createMessageId();
  const createdAt = Date.now();
  const tokens = emptyTokenUsageInfo();
  const trace = options.modelTraceContext;
  await runtime.persistAssistantMessage(
    messageId,
    state.currentUserMessageId,
    createdAt,
    undefined,
    trace,
    options.model,
  );
  await runtime.persistPart(
    {
      id: createPartId(),
      sessionID: runtime.sessionId,
      messageID: messageId,
      type: "step-finish",
      reason: options.finishReason,
      cost: 0,
      tokens,
    },
    trace,
  );
  await runtime.persistAssistantMessage(
    messageId,
    state.currentUserMessageId,
    createdAt,
    { completed: Date.now(), error: options.error, finish: options.finishReason, tokens },
    trace,
    options.model,
  );
}

export async function finishModelStepWithoutToolCalls(
  this: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  options: {
    assistantPersistenceAnchor: AssistantPersistenceAnchor;
    assistantCreatedAt: number;
    assistantMessageId: MessageId;
    modelTraceContext: TraceContext;
    result: RuntimeModelTextResult;
  },
): Promise<"continue" | "break"> {
  if (!state.model) throw new Error(MISSING_STOP);
  const committed = await persistCompletedAssistantStep(this, state, {
    ...options,
    includeEmptyAssistant: true,
  });
  if (committed) recordModelHistoryRound(state);
  if (state.automationCreateLimitReached) {
    await parkGuides(this, state);
    if (state.activeTurn) state.activeTurn.steerable = false;
    sealProduct(state, options.assistantMessageId);
    return "break";
  }
  if (await drainInlineGuideForNextRequest(this, state)) {
    acceptMachine(state, state.turnMachine.aggregateResults());
    return "continue";
  }
  const hookResult = await this.runStopHooks(
    state.modelResponse,
    state.toolCallCount,
    state.turnTraceContext,
    state.turnAbortSignal,
    state.stopHookContinuationCount > 0,
  );
  if (this.shouldContinueAfterStopHooks(hookResult, state.stopHookContinuationCount)) {
    state.stopHookContinuationCount += 1;
    const hookEntry = this.injectHookAdditionalContextIntoMessageHistory(
      HookEventName.Stop,
      hookResult.additionalContexts,
    );
    appendTurnRequestEntries(state.turnRequestState, hookEntry ? [hookEntry] : []);
    acceptMachine(state, state.turnMachine.aggregateResults());
    return "continue";
  }
  await parkGuides(this, state);
  if (state.activeTurn) state.activeTurn.steerable = false;
  sealProduct(state, options.assistantMessageId);
  return "break";
}
