// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import { ModelFailureReason, type ModelErrorCode, type ModelId } from "@knorvia/contracts";
export const ModelErrorSource = {
  Network: "network",
  Provider: "provider",
  Runtime: "runtime",
} as const;
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
  return {
    ...context,
    reason: ModelFailureReason.ProviderNotConfigured,
    retryable: false,
    source: ModelErrorSource.Runtime,
  };
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
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AiSdkModelAdapterError";
    this.code = code;
    this.cause = options.cause;
    this.context = options.context;
  }
  enrichContext(context: Record<string, unknown>): this {
    const target = this.context ?? {};
    if (!this.context) Object.defineProperty(this, "context", { value: target, enumerable: true });
    for (const [key, value] of Object.entries(context))
      if (target[key] === undefined) target[key] = value;
    return this;
  }
}
