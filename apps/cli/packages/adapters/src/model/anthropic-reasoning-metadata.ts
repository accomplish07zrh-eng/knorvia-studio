// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { ModelReasoningContentBlock } from "@knorvia/contracts";
type ReasoningTransformOptions = {
  providerKind?: "openai" | "anthropic" | "openai-compatible" | "gateway" | "custom";
};
type ReasoningProviderOptions =
  | { providerOptions: Record<string, unknown> }
  | Record<string, never>;
export function providerOptionsForReasoningBlock(
  block: ModelReasoningContentBlock,
  options: ReasoningTransformOptions,
): ReasoningProviderOptions {
  if (!block.providerOptions || Object.keys(block.providerOptions).length === 0) return {};
  void options;
  return { providerOptions: block.providerOptions };
}
