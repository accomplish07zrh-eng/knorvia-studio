// SPDX-License-Identifier: Apache-2.0
// 推理块入口：登记与复用规则在 support/reasoning-blocks.ts，这里保持兼容导出面。
import type { ModelReasoningContentBlock } from "../deps.js";
import { obtainReasoningBlock } from "./support/reasoning-blocks.js";

export function getOrCreateReasoningBlock(input: {
  id?: string;
  providerMetadata?: Record<string, unknown>;
  reasoning: ModelReasoningContentBlock[];
  reasoningById: Map<string, ModelReasoningContentBlock>;
}): ModelReasoningContentBlock {
  return obtainReasoningBlock(
    { list: input.reasoning, byId: input.reasoningById },
    { id: input.id, providerMetadata: input.providerMetadata },
  );
}
