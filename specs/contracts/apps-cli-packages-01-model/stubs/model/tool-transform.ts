// SPDX-License-Identifier: Apache-2.0
// 桩：apps-cli-packages-01-model（生成器 build-stubs.mjs，签名取自 interface.md）
export interface AiSdkToolTransformOptions {
  requiresMfjsToolSchema?: boolean;
  supportsNativeWebSearch?: boolean;
  providerKind?: "openai" | "anthropic" | "openai-compatible" | "gateway" | "custom";
  modelId?: string;
}
export function toAiSdkTools(
  tools?: ModelToolContract[],
  options: AiSdkToolTransformOptions = {},
): ToolSet | undefined {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
