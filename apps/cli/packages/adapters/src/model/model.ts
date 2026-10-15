// SPDX-License-Identifier: Apache-2.0
// 模型对象：创建时冻结身份/能力/绑定选项，bind 浅合并出新对象；每次调用先做选项与能力校验
// 再进执行器。校验文案与 context 形状是对外可见面，逐字保持。契约形状住在 support/model-contract。

import type {
  Model,
  ModelEvent,
  ModelOptionSpecs,
  ModelOptions,
  ModelPropertiesInput,
  ModelRequest,
  ModelResult,
} from "@knorvia/contracts";
import { AiSdkModelAdapterError } from "./errors.js";
import type { CreateModelOptions, ModelExecutionRequest } from "./support/model-contract.js";

export type {
  CreateModelOptions,
  ModelExecutionRequest,
  ModelExecutor,
} from "./support/model-contract.js";

type RequestBlock = Extract<ModelRequest["messages"][number]["content"], unknown[]>[number];

function invalidRequest(message: string, tagged: boolean): AiSdkModelAdapterError {
  const base = { reason: "invalid_request", retryable: false };
  const context = tagged ? { ...base, source: "runtime" } : base;
  return new AiSdkModelAdapterError("invalid_model_request", message, { context });
}

function validateOptions(spec: ModelOptionSpecs, requested: ModelOptions): Required<ModelOptions> {
  const reasoning = requested.reasoningLevel ?? spec.reasoningLevel.values[0];
  const max = requested.maxOutputTokens ?? spec.maxOutputTokens.max;
  if (!spec.reasoningLevel.values.includes(reasoning)) {
    throw invalidRequest(`Unsupported reasoningLevel: ${reasoning}`, true);
  }
  const ceiling = spec.maxOutputTokens.max;
  const withinCeiling = Number.isInteger(max) && max > 0 && max <= ceiling;
  if (!withinCeiling) {
    throw invalidRequest(
      `maxOutputTokens must be a positive integer no greater than ${ceiling}`,
      true,
    );
  }
  return { reasoningLevel: reasoning, maxOutputTokens: max };
}

function mediaRejection(
  block: RequestBlock,
  capabilities: ModelPropertiesInput,
): string | undefined {
  if (block.type === "image")
    return capabilities.inputFormat.supportsImage ? undefined : "image input";
  if (block.type === "video")
    return capabilities.inputFormat.supportsVideo ? undefined : "video input";
  const pdfish = block.type === "file" && /^application\/pdf(?:;|$)/i.test(block.mediaType);
  return pdfish && !capabilities.inputFormat.supportsPdf ? "PDF input" : undefined;
}

function validateRequest(request: ModelRequest, capabilities: ModelPropertiesInput): void {
  if (request.tools?.length && !capabilities.supportsToolCall) {
    throw invalidRequest("Selected model does not support tools", false);
  }
  if (request.responseJsonSchema && !capabilities.supportsJsonSchemaOutput) {
    throw invalidRequest("Selected model does not support structured output", false);
  }
  for (const message of request.messages) {
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      const rejection = mediaRejection(block, capabilities);
      if (rejection !== undefined) {
        throw invalidRequest(`Selected model does not support ${rejection}`, true);
      }
    }
  }
}

export function createModel(assembly: CreateModelOptions): Model {
  const bound = Object.freeze({ ...assembly.options });
  const spawn = (options: ModelOptions): Model => {
    const resolved = Object.freeze(validateOptions(assembly.optionSpecs, options));
    const prepare = (request: ModelRequest): ModelExecutionRequest => {
      validateRequest(request, assembly.properties);
      return {
        ...request,
        options: validateOptions(assembly.optionSpecs, { ...resolved, ...request.options }),
      };
    };
    const runGenerate = (request: ModelRequest): Promise<ModelResult> =>
      assembly.executor.generateText(prepare(request));
    const runStream = (request: ModelRequest): AsyncIterable<ModelEvent> =>
      assembly.executor.streamText(prepare(request));
    const model = {
      providerId: assembly.providerId,
      modelId: assembly.modelId,
      displayName: assembly.displayName,
      properties: Object.freeze(assembly.properties),
      optionSpecs: Object.freeze(assembly.optionSpecs),
      options: Object.freeze(options),
      bind: (next: ModelOptions = {}) => spawn({ ...options, ...next }),
      generateText: runGenerate,
      streamText: runStream,
    };
    return Object.freeze(model);
  };
  return spawn(bound);
}
