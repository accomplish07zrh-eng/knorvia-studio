// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { ModelInputMessage, ModelId, ModelProviderId } from "@knorvia/contracts";
function clean(messages: ModelInputMessage[], removeStored: boolean): ModelInputMessage[] {
  const normalized: ModelInputMessage[] = [];
  for (const message of messages) {
    if (!Array.isArray(message.content)) {
      normalized.push({ ...message });
      continue;
    }
    const content = message.content.filter((block) => {
      if (block.type !== "reasoning") return true;
      if (
        !block.text &&
        (!block.providerOptions || Object.keys(block.providerOptions).length === 0)
      )
        return false;
      if (!removeStored) return true;
      const options = block.providerOptions as Record<string, unknown> | undefined;
      return !(options && ("itemId" in options || "item_id" in options));
    });
    if (message.role === "assistant" && content.length === 0 && !message.toolCalls?.length)
      continue;
    normalized.push({ ...message, content });
  }
  return normalized;
}
export function normalizeReasoningHistory(
  messages: ModelInputMessage[],
  targetModel?: { modelId: ModelId; providerId: ModelProviderId },
): ModelInputMessage[] {
  const openAiResponses = String(targetModel?.providerId ?? "")
    .toLowerCase()
    .includes("openai");
  return clean(messages, openAiResponses);
}
export function repairReasoningHistoryAfterSignatureRejection(
  messages: ModelInputMessage[],
  error: unknown,
): ModelInputMessage[] | undefined {
  const text = error instanceof Error ? error.message : String(error ?? "");
  if (!/signature|thinking(?:[_ -]?block)?/i.test(text)) return undefined;
  let changed = false;
  const stripSignatures = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stripSignatures);
    if (typeof value !== "object" || value === null) return value;
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (["signature", "thinking_signature", "encrypted_content"].includes(key)) {
        changed = true;
        continue;
      }
      output[key] = stripSignatures(entry);
    }
    return output;
  };
  const repaired = messages.map((message) => {
    if (!Array.isArray(message.content)) return message;
    const content = message.content.map((block) => {
      if (block.type !== "reasoning" || !block.providerOptions) return block;
      const options = stripSignatures(block.providerOptions) as Record<string, unknown>;
      return { ...block, providerOptions: options };
    });
    return { ...message, content };
  });
  return changed ? repaired : undefined;
}
