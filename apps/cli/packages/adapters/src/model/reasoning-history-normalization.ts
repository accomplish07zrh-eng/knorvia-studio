// SPDX-License-Identifier: Apache-2.0
// reasoning 历史归一：空 reasoning 块与「已存 itemId 不重放」的块按目标剔除，空 assistant 整条剔除；
// 签名被拒后只对 providerOptions 做一次递归修补（去 signature/thinking_signature/encrypted_content）。

import type { ModelInputMessage, ModelId, ModelProviderId } from "@knorvia/contracts";

const SIGNATURE_KEYS = new Set(["signature", "thinking_signature", "encrypted_content"]);
const SIGNATURE_TEXT = /signature|thinking(?:[_ -]?block)?/iu;

function sweep(entries: ModelInputMessage[], dropStored: boolean): ModelInputMessage[] {
  const kept: ModelInputMessage[] = [];
  for (const entry of entries) {
    if (!Array.isArray(entry.content)) {
      kept.push({ ...entry });
      continue;
    }
    const content = entry.content.filter((chunk) => {
      if (chunk.type !== "reasoning") return true;
      const hasText = Boolean(chunk.text);
      const attached = chunk.providerOptions as Record<string, unknown> | undefined;
      const hasOptions = attached !== undefined && Object.keys(attached).length > 0;
      if (!hasText && !hasOptions) return false;
      if (!dropStored) return true;
      if (!attached) return true;
      return !("itemId" in attached || "item_id" in attached);
    });
    const assistantEmpty =
      entry.role === "assistant" && content.length === 0 && !entry.toolCalls?.length;
    if (assistantEmpty) continue;
    kept.push({ ...entry, content });
  }
  return kept;
}

export function normalizeReasoningHistory(
  history: ModelInputMessage[],
  target?: { modelId: ModelId; providerId: ModelProviderId },
): ModelInputMessage[] {
  const providerText = String(target?.providerId ?? "").toLowerCase();
  return sweep(history, providerText.includes("openai"));
}

function scrubValue(node: unknown, state: { changed: boolean }): unknown {
  if (Array.isArray(node)) {
    const list: unknown[] = [];
    for (const entry of node) list.push(scrubValue(entry, state));
    return list;
  }
  if (typeof node !== "object" || node === null) return node;
  const rebuilt: Record<string, unknown> = {};
  for (const key of Object.keys(node)) {
    const entry = (node as Record<string, unknown>)[key];
    if (SIGNATURE_KEYS.has(key)) {
      state.changed = true;
      continue;
    }
    rebuilt[key] = scrubValue(entry, state);
  }
  return rebuilt;
}

export function repairReasoningHistoryAfterSignatureRejection(
  history: ModelInputMessage[],
  failure: unknown,
): ModelInputMessage[] | undefined {
  const text = failure instanceof Error ? failure.message : String(failure ?? "");
  if (!SIGNATURE_TEXT.test(text)) return undefined;
  const state = { changed: false };
  const repaired = history.map((entry) => {
    if (!Array.isArray(entry.content)) return entry;
    const content = entry.content.map((chunk) => {
      if (chunk.type !== "reasoning" || !chunk.providerOptions) return chunk;
      return {
        ...chunk,
        providerOptions: scrubValue(chunk.providerOptions, state) as Record<string, unknown>,
      };
    });
    return { ...entry, content };
  });
  return state.changed ? repaired : undefined;
}
