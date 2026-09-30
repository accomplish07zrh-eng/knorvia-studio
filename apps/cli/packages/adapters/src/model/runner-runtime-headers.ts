// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type { ModelRequestAuth } from "@knorvia/contracts";
import type { AiSdkModelTextRequest, ResolvedAiSdkModel } from "./runner-runtime.js";
export class RuntimeHeadersRefreshError extends Error {
  constructor(cause: unknown) {
    super("Runtime model headers could not be refreshed", { cause });
    this.name = "RuntimeHeadersRefreshError";
  }
}
export async function resolveModelForAttempt(input: {
  attempt: number;
  reason?: "model-request";
  request: AiSdkModelTextRequest;
  resolveModel: (requestAuth?: ModelRequestAuth) => ResolvedAiSdkModel;
}): Promise<ResolvedAiSdkModel> {
  const provisional = input.resolveModel();
  if (!input.request.refreshRuntimeHeadersBeforeAttempt) return provisional;
  if (input.request.abortSignal?.aborted) throw input.request.abortSignal.reason;
  try {
    const refreshed = await input.request.refreshRuntimeHeadersBeforeAttempt({
      accountAccess: provisional.accountAccess,
      attempt: input.attempt,
      reason: input.reason ?? "model-request",
      abortSignal: input.request.abortSignal,
      providerId: provisional.providerId,
      modelId: provisional.modelId,
      traceContext: input.request.traceContext,
    });
    return input.resolveModel(refreshed.requestAuth);
  } catch (error) {
    if (input.request.abortSignal?.aborted) throw input.request.abortSignal.reason;
    throw new RuntimeHeadersRefreshError(error);
  }
}
