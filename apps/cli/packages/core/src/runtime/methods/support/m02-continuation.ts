// SPDX-License-Identifier: Apache-2.0
// 输出上限后续写：判定、请求条目、助手提交。次数只在截断续写时加，压缩不重置。
import {
  countContextPrefixMessages,
  createRuntimeAssistantEntry,
  createRuntimeUserEntry,
  type RuntimeMessageEntry,
} from "../../../agent/message-history.js";
import { toTokenUsageInfo } from "../../helpers/index.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { RuntimeModelTextResult } from "../../types.js";
import { phrase } from "./m02-record.js";
import type { RegularTurnLoopState, TurnRequestState } from "./m02-loop-state.js";

const CONTINUE_CAP = 3;

const RAW_LIMIT_REASONS = [
  "max_tokens",
  "max_output_tokens",
  "model_context_window_exceeded",
];

export const OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE = phrase([
  "The model's response exceeded ",
  "the output token maximum.",
]);

const CONTINUE_PROMPT = phrase([
  "Output token limit hit. Resume directly — no apology, ",
  "no recap of what you were doing. Pick up mid-thought if that is ",
  "where the cut happened. Break remaining work into smaller pieces.",
]);

const CONTINUATION_SCOPE = "output_token_continuation";

type ContinuationDecision = "continue" | "exhausted" | "none";

function rawReasonLimited(raw: string | undefined): boolean {
  return raw !== undefined && RAW_LIMIT_REASONS.indexOf(raw) >= 0;
}

export function isOutputTokenLimitFinishReason(
  finishReason: string | undefined,
  rawFinishReason: string | undefined,
): boolean {
  // 成功响应上的 model_context_window_exceeded 先续写，不直接当超窗失败。
  return finishReason === "length" || rawReasonLimited(rawFinishReason);
}

export function classifyOutputTokenContinuation(input: {
  finishReason: string | undefined;
  rawFinishReason: string | undefined;
  toolCallCount: number;
  continuationCount: number;
}): ContinuationDecision {
  if (input.toolCallCount > 0) return "none";
  const limited = isOutputTokenLimitFinishReason(input.finishReason, input.rawFinishReason);
  if (!limited) return "none";
  return input.continuationCount < CONTINUE_CAP ? "continue" : "exhausted";
}

function continuationEntry(): RuntimeMessageEntry {
  const base = createRuntimeUserEntry(CONTINUE_PROMPT);
  return { ...base, queryScope: CONTINUATION_SCOPE };
}

function isContinuationEntry(entry: RuntimeMessageEntry): boolean {
  return entry.kind !== "attachment" && entry.queryScope === CONTINUATION_SCOPE;
}

export function filterOutputTokenContinuationEntries(
  entries: readonly RuntimeMessageEntry[],
): readonly RuntimeMessageEntry[] {
  const first = entries.findIndex(isContinuationEntry);
  if (first < 0) return entries;
  return entries.filter((entry) => !isContinuationEntry(entry));
}

export function preserveCanonicalContextPrefix(
  currentCanonicalEntries: readonly RuntimeMessageEntry[],
  turnLocalEntries: readonly RuntimeMessageEntry[],
): readonly RuntimeMessageEntry[] {
  // 配置刷新替换的是 canonical 前缀；turn-local 回写只能带对话尾，否则会撤销刷新。
  const canonicalHead = countContextPrefixMessages(currentCanonicalEntries);
  const localHead = countContextPrefixMessages(turnLocalEntries);
  return [
    ...currentCanonicalEntries.slice(0, canonicalHead),
    ...turnLocalEntries.slice(localHead),
  ];
}

export function appendTurnRequestEntries(
  state: TurnRequestState,
  entries: readonly RuntimeMessageEntry[],
): void {
  if (entries.length === 0) return;
  state.entries = state.entries.concat(entries);
}

export function commitTurnRequestEntries(
  runtime: AgentRuntimeInternal,
  state: TurnRequestState,
  entries: readonly RuntimeMessageEntry[],
): void {
  if (entries.length === 0) return;
  runtime.messageHistory.addEntries(entries);
  appendTurnRequestEntries(state, entries);
}

export function hasAssistantReasoningContent(
  reasoning: NonNullable<RuntimeModelTextResult["reasoning"]>[number],
): boolean {
  const text = reasoning.text;
  const options = reasoning.providerOptions ?? {};
  return text.length > 0 || Object.keys(options).length > 0;
}

export function commitAssistantToTurnRequest(
  runtime: AgentRuntimeInternal,
  state: RegularTurnLoopState,
  result: RuntimeModelTextResult,
  toolCalls: Parameters<typeof createRuntimeAssistantEntry>[1],
): boolean {
  const reasoning = result.reasoning?.filter(hasAssistantReasoningContent);
  const toolCount = toolCalls?.length ?? 0;
  const reasoningCount = reasoning?.length ?? 0;
  const hasBody = state.modelResponse.length > 0 || reasoningCount > 0 || toolCount > 0;
  if (!hasBody) return false;
  // 归因用回合已绑定的模型，不用 provider 回包里可能不同的身份。
  const modelRef = { providerId: state.model.providerId, modelId: state.model.modelId };
  const entry = createRuntimeAssistantEntry(
    state.modelResponse,
    toolCalls,
    reasoning,
    modelRef,
    toTokenUsageInfo(result.usage),
  );
  commitTurnRequestEntries(runtime, state.turnRequestState, [entry]);
  return true;
}

export function appendOutputTokenContinuation(state: TurnRequestState): void {
  appendTurnRequestEntries(state, [continuationEntry()]);
  state.outputTokenContinuationCount += 1;
}

export function completeOutputTokenRecovery(state: TurnRequestState): void {
  state.outputTokenContinuationCount = 0;
}

export function finishOutputTokenRecovery(state: TurnRequestState): void {
  completeOutputTokenRecovery(state);
}
