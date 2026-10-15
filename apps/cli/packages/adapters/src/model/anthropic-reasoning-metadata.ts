// SPDX-License-Identifier: Apache-2.0
// reasoning 块的 provider 侧选项透传：块上带了非空选项才包装一层，
// 否则返回空对象，投影层据此决定是否附带 providerOptions。选项原样透传、不按 provider 分流。

import type { ModelReasoningContentBlock } from "@knorvia/contracts";

type ProviderKind = "openai" | "anthropic" | "openai-compatible" | "gateway" | "custom";
type TransformContext = { providerKind?: ProviderKind };
interface OptionCarrier {
  providerOptions: Record<string, unknown>;
}
type ReasoningProviderOptions = OptionCarrier | Record<string, never>;

function carriesOptions(entry: ModelReasoningContentBlock): boolean {
  return entry.providerOptions !== undefined && Object.keys(entry.providerOptions).length > 0;
}

export function providerOptionsForReasoningBlock(
  entry: ModelReasoningContentBlock,
  transform: TransformContext,
): ReasoningProviderOptions {
  void transform;
  if (!carriesOptions(entry)) return {};
  return { providerOptions: entry.providerOptions as Record<string, unknown> };
}
