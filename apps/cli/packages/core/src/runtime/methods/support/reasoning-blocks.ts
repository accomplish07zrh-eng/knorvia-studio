// SPDX-License-Identifier: Apache-2.0
// 推理块登记处：按块 id 取或建，Map 与数组双登记（Map 负责按 id 复用，数组保留追加顺序）。
// 兼容不发 reasoning_start 的 Anthropic 系供应商：首个 delta 就地建块，后续 delta 复用追加，
// 供 tool_result 重放 assistant thinking。
import type { ModelReasoningContentBlock } from "../../deps.js";

/** 缺省块 id：未携带 id 的推理流共用这一块。 */
export const FALLBACK_REASONING_BLOCK_ID = "__knorvia_default_reasoning__";

/** 块登记处：数组（追加序）+ Map（按 id）成对提供，本模块保证两处同步。 */
export interface ReasoningBlockStore {
  list: ModelReasoningContentBlock[];
  byId: Map<string, ModelReasoningContentBlock>;
}

/** 取或建一个推理块：命中返回既有块；未命中建空块并双登记。 */
export function obtainReasoningBlock(
  store: ReasoningBlockStore,
  input: {
    id?: string;
    providerMetadata?: Record<string, unknown>;
  },
): ModelReasoningContentBlock {
  const blockId = input.id ?? FALLBACK_REASONING_BLOCK_ID;
  const known = store.byId.get(blockId);
  if (known !== undefined) return known;
  const created: ModelReasoningContentBlock = {
    type: "reasoning",
    text: "",
    providerOptions: input.providerMetadata,
  };
  store.byId.set(blockId, created);
  store.list.push(created);
  return created;
}
