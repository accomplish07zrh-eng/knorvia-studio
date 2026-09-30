// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type {
  Model,
  ModelEvent,
  ModelOptionSpecs,
  ModelOptions,
  ModelPropertiesInput,
  ModelId,
  ModelProviderId,
  ModelRequest,
  ModelResult,
} from "@knorvia/contracts";
import { AiSdkModelAdapterError } from "./errors.js";
export interface ModelExecutionRequest extends Omit<ModelRequest, "options"> {
  options: Required<ModelOptions>;
}
export interface ModelExecutor {
  generateText(request: ModelExecutionRequest): Promise<ModelResult>;
  streamText(request: ModelExecutionRequest): AsyncIterable<ModelEvent>;
}
export interface CreateModelOptions {
  providerId: ModelProviderId;
  modelId: ModelId;
  displayName?: string;
  properties: ModelPropertiesInput;
  optionSpecs: ModelOptionSpecs;
  options?: ModelOptions;
  executor: ModelExecutor;
}
function validateOptions(specs: ModelOptionSpecs, options: ModelOptions): Required<ModelOptions> {
  const reasoning = options.reasoningLevel ?? specs.reasoningLevel.values[0];
  const max = options.maxOutputTokens ?? specs.maxOutputTokens.max;
  if (!specs.reasoningLevel.values.includes(reasoning))
    throw new AiSdkModelAdapterError(
      "invalid_model_request",
      `Unsupported reasoningLevel: ${reasoning}`,
      { context: { reason: "invalid_request", retryable: false, source: "runtime" } },
    );
  if (!Number.isInteger(max) || max <= 0 || max > specs.maxOutputTokens.max)
    throw new AiSdkModelAdapterError(
      "invalid_model_request",
      `maxOutputTokens must be a positive integer no greater than ${specs.maxOutputTokens.max}`,
      { context: { reason: "invalid_request", retryable: false, source: "runtime" } },
    );
  return { reasoningLevel: reasoning, maxOutputTokens: max };
}
function validateRequest(request: ModelRequest, properties: ModelPropertiesInput): void {
  if (request.tools?.length && !properties.supportsToolCall)
    throw new AiSdkModelAdapterError(
      "invalid_model_request",
      "Selected model does not support tools",
      { context: { reason: "invalid_request", retryable: false } },
    );
  if (request.responseJsonSchema && !properties.supportsJsonSchemaOutput)
    throw new AiSdkModelAdapterError(
      "invalid_model_request",
      "Selected model does not support structured output",
      { context: { reason: "invalid_request", retryable: false } },
    );
  for (const message of request.messages) {
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      const unsupported =
        block.type === "image" && !properties.inputFormat.supportsImage
          ? "image input"
          : block.type === "video" && !properties.inputFormat.supportsVideo
            ? "video input"
            : block.type === "file" &&
                /^application\/pdf(?:;|$)/i.test(block.mediaType) &&
                !properties.inputFormat.supportsPdf
              ? "PDF input"
              : undefined;
      if (unsupported)
        throw new AiSdkModelAdapterError(
          "invalid_model_request",
          `Selected model does not support ${unsupported}`,
          { context: { reason: "invalid_request", retryable: false, source: "runtime" } },
        );
    }
  }
}
export function createModel(input: CreateModelOptions): Model {
  const bound = Object.freeze({ ...input.options });
  const build = (options: ModelOptions): Model => {
    const resolved = Object.freeze(validateOptions(input.optionSpecs, options));
    const model: Model = {
      providerId: input.providerId,
      modelId: input.modelId,
      displayName: input.displayName,
      properties: Object.freeze(input.properties),
      optionSpecs: Object.freeze(input.optionSpecs),
      options: Object.freeze(options),
      bind(next = {}) {
        return build({ ...options, ...next });
      },
      async generateText(request) {
        validateRequest(request, input.properties);
        return input.executor.generateText({
          ...request,
          options: validateOptions(input.optionSpecs, { ...resolved, ...request.options }),
        });
      },
      streamText(request) {
        validateRequest(request, input.properties);
        return input.executor.streamText({
          ...request,
          options: validateOptions(input.optionSpecs, { ...resolved, ...request.options }),
        });
      },
    };
    return Object.freeze(model);
  };
  return build(bound);
}
