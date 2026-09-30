// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { AiSdkProviderKind } from "./model-execution.js";
import { ProviderBusinessError, readProviderBusinessFailureFromBody } from "./model-execution.js";
import type { ModelStreamEvent } from "@knorvia/contracts";
import type { ResolvedAiSdkModel } from "./runner-runtime.js";
export function detectProviderBusinessFinishError(options: {
  providerId: string;
  providerKind?: AiSdkProviderKind | string;
  source: unknown;
}): ProviderBusinessError | undefined {
  const failure = readProviderBusinessFailureFromBody(options.source);
  if (!failure) return undefined;
  const source = options.source as Record<string, unknown>;
  const explicitFailure = source?.success === false || failure.providerCode !== undefined;
  if (!explicitFailure) return undefined;
  return new ProviderBusinessError({
    ...failure,
    providerCode: failure.providerCode === undefined ? undefined : String(failure.providerCode),
    providerId: options.providerId,
    providerKind:
      options.providerKind === "anthropic" || options.providerKind === "openai"
        ? options.providerKind
        : "openai-compatible",
  });
}
export namespace detectProviderBusinessFinishError {
  export function detectProviderStreamFinishError(
    resolved: ResolvedAiSdkModel,
    raw: Record<string, unknown>,
    event: Extract<ModelStreamEvent, { type: "finish" }>,
  ): ProviderBusinessError | undefined {
    return (
      detectProviderBusinessFinishError({
        providerId: resolved.providerId,
        providerKind: resolved.providerKind,
        source: raw,
      }) ??
      detectProviderBusinessFinishError({
        providerId: resolved.providerId,
        providerKind: resolved.providerKind,
        source: event.providerMetadata,
      })
    );
  }
}
