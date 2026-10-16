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
import { type Col } from "./m02-record.js";
import {
  appendTurnRequestEntries,
  commitAssistantToTurnRequest,
  commitTurnRequestEntries,
} from "./m02-continuation.js";
import { drainInlineGuideForNextRequest } from "./m02-guide.js";
import { recordModelHistoryRound, type RegularTurnLoopState } from "./m02-loop-state.js";

const MISSING_ASSISTANT = "Model-backed assistant persistence requires the loop Model";
const MISSING_STOP = "Model-backed turn stop requires the loop Model";
const NO_TOOL_BOUNDARY = "guide.noToolBoundary" as const;
const BREAK_STEP = "break" as const;
const CONTINUE_STEP = "continue" as const;
const STOP_EVENT = HookEventName.Stop;

type PointerKey =
  | "latestAssistantMessageId"
  | "latestAssistantTurnId"
  | "latestConversationMessageId";

export type AssistantPersistenceAnchor = {
  [Key in PointerKey]: AgentRuntimeInternal[Key];
};

type KeptAssistant = Col<"assistantPersistenceAnchor", AssistantPersistenceAnchor> &
  Col<"assistantCreatedAt", number> &
  Col<"assistantMessageId", MessageId> &
  Col<"includeEmptyAssistant", boolean> &
  Col<"modelTraceContext", TraceContext> &
  Col<"result", RuntimeModelTextResult>;

type StopOptions = Col<"assistantPersistenceAnchor", AssistantPersistenceAnchor> &
  Col<"assistantCreatedAt", number> &
  Col<"assistantMessageId", MessageId> &
  Col<"modelTraceContext", TraceContext> &
  Col<"result", RuntimeModelTextResult>;

type LimitCarrier = Col<"error", { data: Record<string, unknown>; name: string }> &
  Col<"finishReason", string> &
  Col<"model", Model> &
  Col<"modelTraceContext", TraceContext>;

function adopt(loop: RegularTurnLoopState, next: unknown): void {
  loop.turnMachine = new TurnMachineImpl(next as never);
}

function stepFinish(
  host: AgentRuntimeInternal,
  messageId: MessageId,
  reason: string,
  tokens: unknown,
) {
  const { sessionId } = host;
  return {
    id: createPartId(),
    sessionID: sessionId,
    messageID: messageId,
    type: "step-finish" as const,
    reason,
    cost: 0,
    tokens,
  };
}

function successClosure(reason: string, tokens: unknown) {
  return { completed: Date.now(), finish: reason, tokens };
}

function failedClosure(reason: string, tokens: unknown, fault: LimitCarrier["error"]) {
  return { completed: Date.now(), error: fault, finish: reason, tokens };
}

export function captureAssistantPersistenceAnchor(
  host: AgentRuntimeInternal,
): AssistantPersistenceAnchor {
  const { latestAssistantMessageId, latestAssistantTurnId, latestConversationMessageId } = host;
  return { latestAssistantMessageId, latestAssistantTurnId, latestConversationMessageId };
}

function rewindPointers(
  host: AgentRuntimeInternal,
  messageId: MessageId,
  anchor: AssistantPersistenceAnchor,
): void {
  const conversationStillOwns = host.latestConversationMessageId === messageId;
  const assistantStillOwns = host.latestAssistantMessageId === messageId;
  if (conversationStillOwns) host.latestConversationMessageId = anchor.latestConversationMessageId;
  if (assistantStillOwns) {
    host.latestAssistantMessageId = anchor.latestAssistantMessageId;
    host.latestAssistantTurnId = anchor.latestAssistantTurnId;
  }
}

async function discardAssistant(host: AgentRuntimeInternal, options: KeptAssistant): Promise<void> {
  const store = host.sessionStore;
  if (store) {
    const { sessionId } = host;
    const { assistantMessageId } = options;
    await store.removeMessage({ sessionID: sessionId, messageID: assistantMessageId } as never);
  }
  rewindPointers(host, options.assistantMessageId, options.assistantPersistenceAnchor);
}

export async function persistCompletedAssistantStep(
  host: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
  options: KeptAssistant,
): Promise<boolean> {
  const chosen = loop.model;
  if (!chosen) throw new Error(MISSING_ASSISTANT);
  let stored = commitAssistantToTurnRequest(host, loop, options.result, undefined);
  if (stored === false && options.includeEmptyAssistant) {
    commitTurnRequestEntries(host, loop.turnRequestState, [
      createRuntimeAssistantEntry(
        "",
        undefined,
        undefined,
        chosen,
        toTokenUsageInfo(options.result.usage),
      ),
    ]);
    stored = true;
  }
  if (stored === false) {
    await discardAssistant(host, options);
    return stored;
  }
  const tokens = toTokenUsageInfo(options.result.usage);
  await host.persistPart(
    stepFinish(host, options.assistantMessageId, options.result.finishReason, tokens) as never,
    options.modelTraceContext,
  );
  await host.persistAssistantMessage(
    options.assistantMessageId,
    loop.currentUserMessageId,
    options.assistantCreatedAt,
    successClosure(options.result.finishReason, tokens),
    options.modelTraceContext,
    chosen,
  );
  return stored;
}

export async function persistOutputTokenLimitErrorCarrier(
  host: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
  options: LimitCarrier,
): Promise<void> {
  const messageId = createMessageId();
  const createdAt = Date.now();
  const tokens = emptyTokenUsageInfo();
  await host.persistAssistantMessage(
    messageId,
    loop.currentUserMessageId,
    createdAt,
    undefined,
    options.modelTraceContext,
    options.model,
  );
  await host.persistPart(
    stepFinish(host, messageId, options.finishReason, tokens) as never,
    options.modelTraceContext,
  );
  await host.persistAssistantMessage(
    messageId,
    loop.currentUserMessageId,
    createdAt,
    failedClosure(options.finishReason, tokens, options.error),
    options.modelTraceContext,
    options.model,
  );
}

async function parkGuides(host: AgentRuntimeInternal, loop: RegularTurnLoopState): Promise<void> {
  const slot = loop.activeTurn;
  if (!slot) return;
  const { events, turnTraceContext } = loop;
  await host.fallbackPendingGuidesToQueue({
    activeTurn: slot,
    events,
    reasonCode: NO_TOOL_BOUNDARY,
    traceContext: turnTraceContext,
  } as never);
}

function sealSuccess(loop: RegularTurnLoopState, assistantMessageId: MessageId): void {
  loop.stableProductStartMessageId = loop.currentUserMessageId;
  loop.stableBoundaryAssistantMessageId = assistantMessageId;
  adopt(loop, loop.turnMachine.complete(loop.modelResponse, "success"));
}

async function maybeContinueOnHooks(
  host: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
): Promise<typeof CONTINUE_STEP | undefined> {
  const repeated = loop.stopHookContinuationCount > 0;
  const hookResult = await host.runStopHooks(
    loop.modelResponse,
    loop.toolCallCount,
    loop.turnTraceContext,
    loop.turnAbortSignal,
    repeated,
  );
  const again = host.shouldContinueAfterStopHooks(hookResult, loop.stopHookContinuationCount);
  if (again === false) return undefined;
  loop.stopHookContinuationCount = loop.stopHookContinuationCount + 1;
  const injected = host.injectHookAdditionalContextIntoMessageHistory(
    STOP_EVENT,
    hookResult.additionalContexts,
  );
  appendTurnRequestEntries(loop.turnRequestState, injected ? [injected] : []);
  adopt(loop, loop.turnMachine.aggregateResults());
  return CONTINUE_STEP;
}

export async function finishModelStepWithoutToolCalls(
  this: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
  options: StopOptions,
): Promise<"continue" | "break"> {
  const host: AgentRuntimeInternal = this;
  if (!loop.model) throw new Error(MISSING_STOP);
  // includeEmptyAssistant 是后补的键，排在其余字段之后。
  const {
    assistantPersistenceAnchor,
    assistantCreatedAt,
    assistantMessageId,
    modelTraceContext,
    result,
  } = options;
  const request: KeptAssistant = {
    assistantPersistenceAnchor,
    assistantCreatedAt,
    assistantMessageId,
    modelTraceContext,
    result,
    includeEmptyAssistant: true,
  };
  const kept = await persistCompletedAssistantStep(host, loop, request);
  if (kept) recordModelHistoryRound(loop);
  if (loop.automationCreateLimitReached) {
    if (loop.activeTurn) {
      await parkGuides(host, loop);
      // 回调可能换掉 activeTurn。这里重读，清掉就抛，不另做一次真值判断。
      loop.activeTurn!.steerable = false;
    }
    sealSuccess(loop, options.assistantMessageId);
    return BREAK_STEP;
  }
  const drained = await drainInlineGuideForNextRequest(host, loop);
  if (drained) {
    adopt(loop, loop.turnMachine.aggregateResults());
    return CONTINUE_STEP;
  }
  const hooked = await maybeContinueOnHooks(host, loop);
  if (hooked !== undefined) return hooked;
  await parkGuides(host, loop);
  if (loop.activeTurn) loop.activeTurn.steerable = false;
  sealSuccess(loop, options.assistantMessageId);
  return BREAK_STEP;
}
