// SPDX-License-Identifier: Apache-2.0
// 桩：apps-cli-packages-01-model（生成器 build-stubs.mjs，签名取自 interface.md）
export const ModelErrorSource: {
  readonly Network: "network";
  readonly Provider: "provider";
  readonly Runtime: "runtime";
} = undefined as never;
export type ModelErrorSource = (typeof ModelErrorSource)[keyof typeof ModelErrorSource];
export type LocalProviderConfigurationErrorContext = Record<string, unknown> & {
  envKey?: string;
  modelId?: ModelId;
  providerId: string;
  reason: typeof ModelFailureReason.ProviderNotConfigured;
  retryable: false;
  source: typeof ModelErrorSource.Runtime;
};
export function createLocalProviderConfigurationErrorContext(
  context: Pick<LocalProviderConfigurationErrorContext, "envKey" | "modelId" | "providerId">,
): LocalProviderConfigurationErrorContext {
  throw new Error("not implemented: apps-cli-packages-01-model");
}
export interface AiSdkModelAdapterErrorOptions {
  cause?: unknown;
  context?: Record<string, unknown>;
}
export class AiSdkModelAdapterError extends Error {
  readonly code: ModelErrorCode;
  override readonly cause?: unknown;
  readonly context?: Record<string, unknown>;
  constructor(code: ModelErrorCode, message: string, options: AiSdkModelAdapterErrorOptions = {}) {
    throw new Error("not implemented: apps-cli-packages-01-model");
  }
  enrichContext(context: Record<string, unknown>): this {
    throw new Error("not implemented: apps-cli-packages-01-model");
  }
}
