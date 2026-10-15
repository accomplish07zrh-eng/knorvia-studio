// SPDX-License-Identifier: Apache-2.0
// 桩：apps-cli-packages-01-model（生成器 build-stubs.mjs，签名取自 interface.md）
export interface AiSdkMessageTransformOptions {
  apiFormat?: string;
  providerOptions?: Record<string, unknown>;
  providerKind?: "openai" | "anthropic" | "openai-compatible" | "gateway" | "custom";
  stripMedia?: boolean;
  inputFormat?: ModelInputFormat;
}
export function toAiSdkMessages(
  messages: ModelInputMessage[],
  options: AiSdkMessageTransformOptions = {},
): AiSdkModelMessage[] {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
