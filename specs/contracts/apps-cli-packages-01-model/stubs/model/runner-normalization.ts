// SPDX-License-Identifier: Apache-2.0
// 桩：apps-cli-packages-01-model（生成器 build-stubs.mjs，签名取自 interface.md）
export function normalizeUsage(usage?: Partial<LanguageModelUsage>): ModelUsage {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function normalizeReasoning(
  reasoning?: readonly { providerMetadata?: unknown; text?: string; type?: string }[],
): ModelReasoningContentBlock[] | undefined {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function toModelStreamEvent(chunk: TextStreamPart<ToolSet>): ModelStreamEvent | undefined {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function normalizeToolCalls(
  result: AiSdkGenerateTextResult,
  logger?: Logger,
): ModelTextResult["toolCalls"] {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function normalizeToolResults(
  result: AiSdkGenerateTextResult,
  normalizedToolCalls?: ModelTextResult["toolCalls"],
): ModelToolResult[] | undefined {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export function normalizeSources(result: AiSdkGenerateTextResult): ModelSource[] | undefined {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
