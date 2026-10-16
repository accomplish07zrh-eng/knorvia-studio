// SPDX-License-Identifier: Apache-2.0
// 输出截断后续写。次数只在真正续写时增加，压缩与失败重试都不清零。
import {
  countContextPrefixMessages,
  createRuntimeAssistantEntry,
  createRuntimeUserEntry,
  type RuntimeMessageEntry,
} from "../../../agent/message-history.js";
import { toTokenUsageInfo } from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { RuntimeModelTextResult } from "../../types.js";
import { assignKeys, phrase } from "./m02-record.js";
import type { RegularTurnLoopState, TurnRequestState } from "./m02-loop-state.js";

const CONTINUE_CAP = 3;
const SCOPE = "output_token_continuation" as const;
// 成功响应上的 model_context_window_exceeded 也算输出上限，先续写而不是直接超窗失败。
const RAW_LIMIT = new Set("max_tokens max_output_tokens model_context_window_exceeded".split(" "));

export const OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE = phrase([
  "The model's response exceeded the ",
  "output token maximum.",
]);

const CONTINUE_PROMPT = phrase([
  "Output token limit hit. Resume directly — no apology, no recap of ",
  "what you were doing. Pick up mid-thought if that is where the cut happened. ",
  "Break remaining work into smaller pieces.",
]);

type ContinuationFacts = {
  finishReason: string | undefined; // m02
  rawFinishReason: string | undefined; // m02
  toolCallCount: number; // m02
  continuationCount: number; // m02
};

type Decision = "continue" | "exhausted" | "none";

export function isOutputTokenLimitFinishReason(
  // m02
  finishReason: string | undefined, // m02
  rawFinishReason: string | undefined, // m02
): boolean {
  // m02
  const lengthStop = finishReason === "length";
  const rawKnown = typeof rawFinishReason === "string" && RAW_LIMIT.has(rawFinishReason);
  return lengthStop ? true : rawKnown;
}

export function classifyOutputTokenContinuation(facts: ContinuationFacts): Decision {
  const calls = facts.toolCallCount;
  const used = facts.continuationCount;
  const limited = isOutputTokenLimitFinishReason(facts.finishReason, facts.rawFinishReason);
  if (calls > 0 || !limited) return "none";
  return used < CONTINUE_CAP ? "continue" : "exhausted";
}

function continuationEntry(): RuntimeMessageEntry {
  const seeded = createRuntimeUserEntry(CONTINUE_PROMPT);
  const stamped: RuntimeMessageEntry = { ...seeded, queryScope: SCOPE };
  return stamped;
}

function markedContinuation(entry: RuntimeMessageEntry): boolean {
  if (entry.kind === "attachment") return false;
  return entry.queryScope === SCOPE;
}

export function filterOutputTokenContinuationEntries(
  // m02
  entries: readonly RuntimeMessageEntry[], // m02
): readonly RuntimeMessageEntry[] {
  // m02
  const hit = entries.some(markedContinuation);
  if (!hit) return entries;
  const kept: RuntimeMessageEntry[] = [];
  for (const entry of entries) {
    // m02
    if (markedContinuation(entry)) continue;
    kept.push(entry);
  }
  return kept.concat();
}

export function preserveCanonicalContextPrefix(
  // m02
  currentCanonicalEntries: readonly RuntimeMessageEntry[], // m02
  turnLocalEntries: readonly RuntimeMessageEntry[], // m02
): readonly RuntimeMessageEntry[] {
  // m02
  // 配置刷新换掉的是 canonical 前缀；回合本地回写只能接尾巴，否则会把刷新撤掉。
  const headCount = countContextPrefixMessages(currentCanonicalEntries);
  const localCount = countContextPrefixMessages(turnLocalEntries);
  const head = currentCanonicalEntries.slice(0, headCount);
  const tail = turnLocalEntries.slice(localCount);
  return head.concat(tail);
}

export function appendTurnRequestEntries(
  // m02
  state: TurnRequestState, // m02
  entries: readonly RuntimeMessageEntry[], // m02
): void {
  // m02
  const incoming = entries.length;
  if (incoming < 1) return;
  const joined = state.entries.concat(entries);
  state.entries = joined;
}

export function commitTurnRequestEntries(
  // m02
  runtime: AgentRuntimeInternal, // m02
  state: TurnRequestState, // m02
  entries: readonly RuntimeMessageEntry[], // m02
): void {
  // m02
  const batch = entries.slice();
  if (batch.length < 1) return;
  runtime.messageHistory.addEntries(batch);
  appendTurnRequestEntries(state, batch);
}

export function hasAssistantReasoningContent(
  // m02
  reasoning: NonNullable<RuntimeModelTextResult["reasoning"]>[number], // m02
): boolean {
  // m02
  const prose = reasoning.text;
  const vendor = reasoning.providerOptions;
  const tagged = vendor != null && Object.keys(vendor).length > 0;
  return prose.length > 0 || tagged;
}

export function commitAssistantToTurnRequest(
  // m02
  runtime: AgentRuntimeInternal, // m02
  state: RegularTurnLoopState, // m02
  result: RuntimeModelTextResult, // m02
  toolCalls: Parameters<typeof createRuntimeAssistantEntry>[1], // m02
): boolean {
  // m02
  const notes = result.reasoning?.filter(hasAssistantReasoningContent);
  const callCount = toolCalls?.length ?? 0;
  const noteCount = notes?.length ?? 0;
  const wrote = state.modelResponse.length > 0;
  if (!wrote && noteCount < 1 && callCount < 1) return false;
  // 归因用回合已绑定的模型，不用 provider 回包里可能换掉的身份。
  const bound = state.model;
  const identity = assignKeys<{
    providerId: typeof bound.providerId;
    modelId: typeof bound.modelId;
  }>([
    ["providerId", bound.providerId],
    ["modelId", bound.modelId],
  ]);
  const saved = createRuntimeAssistantEntry(
    state.modelResponse, // m02
    toolCalls, // m02
    notes,
    identity, // m02
    toTokenUsageInfo(result.usage), // m02
  );
  commitTurnRequestEntries(runtime, state.turnRequestState, [saved]);
  return true; // m02
}

export function appendOutputTokenContinuation(state: TurnRequestState): void {
  // m02
  const marker = continuationEntry();
  appendTurnRequestEntries(state, [marker]);
  state.outputTokenContinuationCount = state.outputTokenContinuationCount + 1;
}

export function completeOutputTokenRecovery(state: TurnRequestState): void {
  // m02
  const cleared = state.outputTokenContinuationCount * 0;
  state.outputTokenContinuationCount = cleared;
}

export function finishOutputTokenRecovery(state: TurnRequestState): void {
  // m02
  completeOutputTokenRecovery(state); // m02
}
