// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import { jsonSchema, Output } from "ai";
import type { EnvRecord } from "./model-execution.js";
import type {
  AiSdkGenerateTextOptions,
  AiSdkModelTextRequest,
  AiSdkStreamTextOptions,
  ResolvedAiSdkModel,
} from "./runner-runtime.js";
import type { ModelStatusContext } from "./runner-status.js";
import { createModelRequestAttributionHeaders } from "./runner-status.js";
import { mergeModelRequestHeaders } from "./model-request-headers.js";
import { toAiSdkMessages } from "./transform.js";
import { toAiSdkTools } from "./tool-transform.js";
import { isOpenCodeGoBaseUrl } from "./opencode-session.js";

function omitUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

export function createGenerateTextOptions(input: {
  anthropicMetadataUserId?: string;
  env?: EnvRecord;
  includeModelIO: boolean;
  request: AiSdkModelTextRequest;
  resolved: ResolvedAiSdkModel;
  statusContext: ModelStatusContext;
}): AiSdkGenerateTextOptions {
  const providerOptions = { ...input.resolved.providerOptions, ...input.request.providerOptions };
  const openCodeSessionHeaders =
    isOpenCodeGoBaseUrl(input.resolved.baseURL) && input.statusContext.sessionId !== undefined
      ? { "x-opencode-session": String(input.statusContext.sessionId) }
      : undefined;
  if (input.anthropicMetadataUserId)
    providerOptions.anthropic = {
      ...(providerOptions.anthropic as Record<string, unknown> | undefined),
      metadata: { userId: input.anthropicMetadataUserId },
    };
  return omitUndefined({
    model: input.resolved.model,
    messages: toAiSdkMessages(input.request.messages, {
      providerKind: input.resolved.providerKind,
      providerOptions,
      inputFormat: input.resolved.properties.inputFormat,
    }),
    tools: toAiSdkTools(input.request.tools, {
      providerKind: input.resolved.providerKind,
      modelId: input.resolved.modelId,
      requiresMfjsToolSchema: input.resolved.properties.requiresMfjsToolSchema,
      supportsNativeWebSearch: input.resolved.properties.supportsNativeWebSearch,
    }),
    toolChoice: input.request.toolChoice,
    temperature: input.request.temperature,
    maxOutputTokens: input.request.maxOutputTokens,
    topP: input.request.topP,
    topK: input.request.topK,
    presencePenalty: input.request.presencePenalty,
    frequencyPenalty: input.request.frequencyPenalty,
    stopSequences: input.request.stopSequences,
    seed: input.request.seed,
    output: input.request.responseJsonSchema
      ? Output.object({ schema: jsonSchema(input.request.responseJsonSchema) })
      : undefined,
    providerOptions,
    abortSignal: input.request.abortSignal,
    headers: mergeModelRequestHeaders(
      input.resolved.headers,
      openCodeSessionHeaders,
      createModelRequestAttributionHeaders(input.statusContext),
    ),
    maxRetries: 0,
  }) as AiSdkGenerateTextOptions;
}
export function createStreamTextOptions(input: {
  anthropicMetadataUserId?: string;
  env?: EnvRecord;
  includeModelIO: boolean;
  request: AiSdkModelTextRequest;
  resolved: ResolvedAiSdkModel;
  statusContext: ModelStatusContext;
}): AiSdkStreamTextOptions {
  return createGenerateTextOptions(input) as AiSdkStreamTextOptions;
}
