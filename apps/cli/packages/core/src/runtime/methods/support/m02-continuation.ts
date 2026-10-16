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
import { type Col } from "./m02-record.js";
import type { RegularTurnLoopState, TurnRequestState } from "./m02-loop-state.js";

const CONTINUE_CAP = 3;
const SCOPE = "output_token_continuation" as const;
// 成功响应上的 model_context_window_exceeded 也算输出上限，先续写而不是直接超窗失败。
const RAW_LIMIT = new Set(["max_tokens", "max_output_tokens", "model_context_window_exceeded"]);

export const OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE =
  "The model's response exceeded the output token maximum.";

const CONTINUE_PROMPT =
  "Output token limit hit. Resume directly — no apology, no recap of what you were doing. Pick up mid-thought if that is where the cut happened. Break remaining work into smaller pieces.";

type ContinuationFacts = Col<"finishReason", string | undefined> &
  Col<"rawFinishReason", string | undefined> &
  Col<"toolCallCount", number> &
  Col<"continuationCount", number>;

type Decision = "continue" | "exhausted" | "none";

export function isOutputTokenLimitFinishReason(
  reason: string | undefined,
  raw: string | undefined,
): boolean {
  const lengthStop = reason === "length";
  const rawKnown = typeof raw === "string" && RAW_LIMIT.has(raw);
  return lengthStop || rawKnown;
}

export function classifyOutputTokenContinuation(facts: ContinuationFacts): Decision {
  const hasTools = facts.toolCallCount > 0;
  const limited = isOutputTokenLimitFinishReason(facts.finishReason, facts.rawFinishReason);
  if (hasTools || !limited) return "none";
  const roomLeft = facts.continuationCount < CONTINUE_CAP;
  return roomLeft ? "continue" : "exhausted";
}

function continuationEntry(): RuntimeMessageEntry {
  const seeded = createRuntimeUserEntry(CONTINUE_PROMPT);
  return { ...seeded, queryScope: SCOPE };
}

function markedContinuation(entry: RuntimeMessageEntry): boolean {
  return entry.kind !== "attachment" && entry.queryScope === SCOPE;
}

export function filterOutputTokenContinuationEntries(
  batch: readonly RuntimeMessageEntry[],
): readonly RuntimeMessageEntry[] {
  const present = batch.some(markedContinuation);
  if (!present) return batch;
  return batch.filter((entry) => markedContinuation(entry) === false);
}

export function preserveCanonicalContextPrefix(
  canonical: readonly RuntimeMessageEntry[],
  local: readonly RuntimeMessageEntry[],
): readonly RuntimeMessageEntry[] {
  // 配置刷新换掉的是 canonical 前缀；回合本地回写只能接尾巴，否则会把刷新撤掉。
  const headCount = countContextPrefixMessages(canonical);
  const localCount = countContextPrefixMessages(local);
  return canonical.slice(0, headCount).concat(local.slice(localCount));
}

export function appendTurnRequestEntries(
  bucket: TurnRequestState,
  batch: readonly RuntimeMessageEntry[],
): void {
  if (batch.length < 1) return;
  bucket.entries = bucket.entries.concat(batch);
}

export function commitTurnRequestEntries(
  host: AgentRuntimeInternal,
  bucket: TurnRequestState,
  batch: readonly RuntimeMessageEntry[],
): void {
  if (batch.length < 1) return;
  host.messageHistory.addEntries(batch);
  appendTurnRequestEntries(bucket, batch);
}

export function hasAssistantReasoningContent(
  note: NonNullable<RuntimeModelTextResult["reasoning"]>[number],
): boolean {
  const prose = note.text.length > 0;
  const vendor = note.providerOptions;
  const tagged = vendor != null && Object.keys(vendor).length > 0;
  return prose || tagged;
}

export function commitAssistantToTurnRequest(
  host: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
  modelResult: RuntimeModelTextResult,
  calls: Parameters<typeof createRuntimeAssistantEntry>[1],
): boolean {
  const notes = modelResult.reasoning?.filter(hasAssistantReasoningContent);
  const callCount = calls?.length ?? 0;
  const noteCount = notes?.length ?? 0;
  const wrote = loop.modelResponse.length > 0;
  const visible = wrote || noteCount > 0 || callCount > 0;
  if (!visible) return visible;
  // 归因用回合已绑定的模型，不用 provider 回包里可能换掉的身份。
  const { providerId, modelId } = loop.model;
  const identity = { providerId, modelId };
  const saved = createRuntimeAssistantEntry(
    loop.modelResponse,
    calls,
    notes,
    identity,
    toTokenUsageInfo(modelResult.usage),
  );
  commitTurnRequestEntries(host, loop.turnRequestState, [saved]);
  return visible;
}

export function appendOutputTokenContinuation(bucket: TurnRequestState): void {
  appendTurnRequestEntries(bucket, [continuationEntry()]);
  bucket.outputTokenContinuationCount = bucket.outputTokenContinuationCount + 1;
}

export function completeOutputTokenRecovery(bucket: TurnRequestState): void {
  bucket.outputTokenContinuationCount = 0;
}

export function finishOutputTokenRecovery(bucket: TurnRequestState): void {
  completeOutputTokenRecovery(bucket);
}
