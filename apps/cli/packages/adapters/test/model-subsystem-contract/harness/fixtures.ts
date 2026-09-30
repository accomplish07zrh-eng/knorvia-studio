// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type {
  ModelId,
  ModelInputMessage,
  ModelOptionSpecs,
  ModelProperties,
  ModelProviderId,
  ModelTextRequest,
  TraceContext,
} from "@knorvia/contracts";
import type { RegistryModelConfig, RegistryProviderConfig } from "@knorvia/provider";
import type { LanguageModel } from "ai";

export function providerId(value = "provider-test"): ModelProviderId {
  return value as ModelProviderId;
}

export function modelId(value = "model-test"): ModelId {
  return value as ModelId;
}

export function modelProperties(overrides: Partial<ModelProperties> = {}): ModelProperties {
  return {
    contextWindow: 128_000,
    inputFormat: {
      supportsAudio: false,
      supportsImage: true,
      supportsPdf: true,
      supportsText: true,
      supportsVideo: true,
    },
    outputFormat: { supportsText: true },
    requiresMfjsToolSchema: false,
    supportsJsonSchemaOutput: true,
    supportsMidConversationSystem: true,
    supportsNativeWebSearch: true,
    supportsToolCall: true,
    ...overrides,
  };
}

export function optionSpecs(): ModelOptionSpecs {
  return {
    maxOutputTokens: { map: "max-map", max: 32_000 },
    reasoningLevel: { map: "reasoning-map", values: ["low", "high"] },
  };
}

export function registryProvider(overrides: Record<string, unknown> = {}): RegistryProviderConfig {
  return {
    access: { apiKey: "secret-key", type: "api-key" },
    api: {
      baseUrl: "https://provider.invalid/v1",
      headers: { "x-provider": "static" },
      type: "openai-chat-completions",
    },
    builtinModelIds: ["model-test"],
    group: "standard-personal",
    modelOrder: ["model-test"],
    personalModelIds: [],
    visibility: "visible",
    ...overrides,
  } as unknown as RegistryProviderConfig;
}

export function registryModel(overrides: Record<string, unknown> = {}): RegistryModelConfig {
  return {
    enabled: true,
    optionSpecs: optionSpecs(),
    properties: modelProperties(),
    ...overrides,
  } as unknown as RegistryModelConfig;
}

export function textMessage(text = "hello"): ModelInputMessage {
  return { content: text, role: "user" };
}

export function textRequest(overrides: Partial<ModelTextRequest> = {}): ModelTextRequest {
  return { messages: [textMessage()], ...overrides };
}

export function traceContext(): TraceContext {
  return {
    queryId: "query-test" as NonNullable<TraceContext["queryId"]>,
    sessionId: " session-test " as NonNullable<TraceContext["sessionId"]>,
    spanId: "span-test",
    traceId: "trace-test" as TraceContext["traceId"],
    turnId: "turn-test" as NonNullable<TraceContext["turnId"]>,
  };
}

export function fakeLanguageModel(label = "fake-model"): LanguageModel {
  return {
    specificationVersion: "v3",
    provider: "test",
    modelId: label,
  } as unknown as LanguageModel;
}

export function resolvedModel(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    baseURL: "https://provider.invalid/v1",
    headers: { "x-provider": "static" },
    model: fakeLanguageModel(),
    modelId: modelId(),
    properties: modelProperties(),
    providerId: providerId(),
    providerKind: "openai-compatible",
    providerOptions: { test: { enabled: true } },
    ...overrides,
  };
}

export function generateResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    finishReason: "stop",
    providerMetadata: { test: { requestId: "provider-request" } },
    reasoning: [],
    sources: [],
    steps: [],
    text: "done",
    toolCalls: [],
    toolResults: [],
    usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    ...overrides,
  };
}

export function streamResult(
  events: readonly unknown[],
  aggregates: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    consumeStream: async () => undefined,
    finishReason: Promise.resolve("stop"),
    fullStream: toAsyncIterable(events),
    providerMetadata: Promise.resolve({}),
    reasoning: Promise.resolve([]),
    response: Promise.resolve({ headers: {} }),
    sources: Promise.resolve([]),
    text: Promise.resolve(""),
    toolCalls: Promise.resolve([]),
    toolResults: Promise.resolve([]),
    totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
    ...aggregates,
  };
}

export function toAsyncIterable<T>(values: readonly T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const value of values) yield value;
    },
  };
}

export interface Deferred<T> {
  readonly promise: Promise<T>;
  reject(reason?: unknown): void;
  resolve(value: T): void;
}

export function deferred<T>(): Deferred<T> {
  let rejectPromise: (reason?: unknown) => void = () => undefined;
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    rejectPromise = reject;
    resolvePromise = resolve;
  });
  return { promise, reject: rejectPromise, resolve: resolvePromise };
}

export async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) values.push(value);
  return values;
}
