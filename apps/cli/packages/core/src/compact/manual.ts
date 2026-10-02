import {
  CompactTrigger,
  modelMessageContentBlockToText,
  modelMessageContentToText,
} from "@knorvia/contracts";
import type {
  CompactBoundaryPayload,
  CompactPhase,
  CompactPreservedSegment,
  CompactReason,
  CompactTrigger as CompactTriggerValue,
  MessageId,
  ModelMessageContent,
  TraceContext,
} from "@knorvia/contracts";
import { ESTIMATED_TOKEN_CHAR_DIVISOR } from "@knorvia/shared";
import { groupByAssistantStartedRounds } from "./rounds.js";

export interface CompactModelMessage {
  role: string;
  content: ModelMessageContent;
  toolCalls?: readonly {
    name: string;
    input: unknown;
  }[];
}

export interface TokenUsageLike {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface BuildManualCompactBoundaryInput {
  autoCompactThreshold?: number;
  boundaryId: string;
  compactReason?: CompactReason;
  customInstructions?: string;
  keptMessageCount?: number;
  lastSummarizedMessageId?: MessageId;
  phase?: CompactPhase;
  postCompactTokenCount?: number;
  preservedSegment?: CompactPreservedSegment;
  preCompactTokenCount: number;
  summarizedMessageCount: number;
  summaryMessageId: MessageId;
  traceContext: TraceContext;
  trigger?: CompactTriggerValue;
  truePostCompactTokenCount?: number;
  willRetriggerNextTurn?: boolean;
}

export const MAX_COMPACT_PROMPT_TOO_LONG_RETRIES = 3;
export const COMPACT_PROMPT_TOO_LONG_RETRY_MARKER =
  "[earlier conversation truncated for compaction retry]";
export const COMPACT_PROMPT_TOO_LONG_USER_MESSAGE =
  "Conversation too long to compact automatically. Try /compact again after narrowing the active context.";

export function getMessagesToSummarize(
  messages: readonly CompactModelMessage[],
): CompactModelMessage[] {
  return messages
    .filter(
      (message) =>
        message.role !== "system" &&
        !(
          message.role === "user" &&
          modelMessageContentToText(message.content)
            .trimStart()
            .startsWith("<system-reminder>")
        ),
    )
    .map((message) => ({ ...message }));
}

export function hasEnoughMessagesToCompact(
  messages: readonly CompactModelMessage[],
): boolean {
  const summarizableMessages = getMessagesToSummarize(messages);
  const rounds = groupByAssistantStartedRounds(
    summarizableMessages,
    (message) => message.role,
  );
  return (
    rounds.length >= 2 &&
    summarizableMessages.some((message) => message.role === "assistant")
  );
}

export function buildManualCompactBoundary(
  input: BuildManualCompactBoundaryInput,
): CompactBoundaryPayload {
  return {
    boundaryId: input.boundaryId,
    trigger: input.trigger ?? CompactTrigger.Manual,
    phase: input.phase,
    compactReason: input.compactReason,
    summarySource: "model",
    preCompactTokenCount: input.preCompactTokenCount,
    postCompactTokenCount: input.postCompactTokenCount,
    truePostCompactTokenCount: input.truePostCompactTokenCount,
    autoCompactThreshold: input.autoCompactThreshold,
    willRetriggerNextTurn: input.willRetriggerNextTurn,
    summarizedMessageCount: input.summarizedMessageCount,
    keptMessageCount: input.keptMessageCount ?? 0,
    lastSummarizedMessageId: input.lastSummarizedMessageId,
    preservedSegment: input.preservedSegment,
    summaryMessageIds: [input.summaryMessageId],
    customInstructions: input.customInstructions !== undefined,
    traceId: input.traceContext.traceId,
    turnId: input.traceContext.turnId,
  };
}

export function estimateMessageTokens(
  messages: readonly CompactModelMessage[],
): number {
  let total = 0;
  messages.forEach((message) => {
    const content = message.content;
    const text =
      typeof content === "string"
        ? content
        : content
            .map((block) =>
              block.type === "reasoning"
                ? block.text
                : modelMessageContentBlockToText(block),
            )
            .filter(Boolean)
            .join("\n\n");
    let chars = text.length;
    for (const toolCall of message.toolCalls ?? []) {
      const name = toolCall.name;
      const input = toolCall.input ?? {};
      let serializedInput = "{}";
      try {
        serializedInput = JSON.stringify(input) ?? "{}";
      } catch {
        // Serialization failures use the same empty-object fallback.
      }
      chars += (name + serializedInput).length;
    }
    total += Math.ceil(chars / ESTIMATED_TOKEN_CHAR_DIVISOR);
  });
  return total;
}

export function getUsageTotalTokens(usage?: TokenUsageLike): number {
  const inputTokens =
    usage?.inputTokens ??
    (usage?.cacheReadTokens ?? 0) + (usage?.cacheWriteTokens ?? 0);
  return usage?.totalTokens ?? inputTokens + (usage?.outputTokens ?? 0);
}

export function createCompactBoundaryId(
  randomUUID: () => string = () => crypto.randomUUID(),
): string {
  return "compact_" + randomUUID();
}
