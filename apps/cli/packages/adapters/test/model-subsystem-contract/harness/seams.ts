// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { Logger, ModelNetworkStatusEvent, ModelStatusSink } from "@knorvia/contracts";
import { SEAM_SYMBOL_KEY } from "./constants.js";
import { OwnedClock } from "./owned-clock.js";
import { VirtualFileSystem } from "./virtual-fs.js";

export interface CallRecord {
  readonly args: readonly unknown[];
  readonly name: string;
}

type UnknownFunction = (...args: readonly unknown[]) => unknown;

class SeamApiCallError extends Error {
  readonly data?: unknown;
  readonly isRetryable: boolean;
  readonly requestBodyValues: unknown;
  readonly responseBody?: string;
  readonly responseHeaders?: Record<string, string>;
  readonly statusCode?: number;
  readonly url: string;

  constructor(input: {
    message: string;
    url: string;
    requestBodyValues: unknown;
    cause?: unknown;
    data?: unknown;
    isRetryable?: boolean;
    responseBody?: string;
    responseHeaders?: Record<string, string>;
    statusCode?: number;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "AI_APICallError";
    if (input.data !== undefined) {
      this.data = input.data;
    }
    this.isRetryable = input.isRetryable ?? false;
    this.requestBodyValues = input.requestBodyValues;
    if (input.responseBody !== undefined) {
      this.responseBody = input.responseBody;
    }
    if (input.responseHeaders !== undefined) {
      this.responseHeaders = input.responseHeaders;
    }
    if (input.statusCode !== undefined) {
      this.statusCode = input.statusCode;
    }
    this.url = input.url;
  }

  static isInstance(value: unknown): value is SeamApiCallError {
    return (
      value instanceof SeamApiCallError || Reflect.get(Object(value), "name") === "AI_APICallError"
    );
  }
}

class SeamRetryError extends Error {
  readonly errors: unknown[];
  readonly lastError: unknown;
  readonly reason: "maxRetriesExceeded" | "errorNotRetryable" | "abort";

  constructor(input: {
    message: string;
    reason: "maxRetriesExceeded" | "errorNotRetryable" | "abort";
    errors: unknown[];
  }) {
    super(input.message);
    this.name = "AI_RetryError";
    this.errors = input.errors;
    this.lastError = input.errors.at(-1);
    this.reason = input.reason;
  }

  static isInstance(value: unknown): value is SeamRetryError {
    return (
      value instanceof SeamRetryError || Reflect.get(Object(value), "name") === "AI_RetryError"
    );
  }
}

export interface SeamState {
  readonly calls: CallRecord[];
  readonly clock: OwnedClock;
  readonly crypto: {
    randomUUID: () => string;
    getRandomValues: <T extends ArrayBufferView>(value: T) => T;
  };
  readonly fs: VirtualFileSystem;
  readonly os: { homedir: () => string; platform: () => NodeJS.Platform; tmpdir: () => string };
  readonly process: {
    readonly env: Record<string, string | undefined>;
    readonly platform: NodeJS.Platform;
    readonly versions: Record<string, string>;
    cwd(): string;
  };
  readonly transport: { fetch: typeof globalThis.fetch };
  runtime: Record<string, unknown>;
  currentInvocationContext: unknown;
  deviceMid: string;
  generateText: UnknownFunction;
  streamText: UnknownFunction;
  providerModelFactory: (kind: string, options: unknown, modelId: string) => unknown;
  optionMapApply: (
    body: Record<string, unknown>,
    values: Record<string, unknown>,
  ) => Record<string, unknown>;
  cuaFramePredicate: (text: string) => boolean;
  dataRoot: string;
}

const activeSymbol = Symbol.for(SEAM_SYMBOL_KEY);
let uuidCounter = 0;

function record(state: SeamState, name: string, args: readonly unknown[]): void {
  state.calls.push({ args, name });
}

function defaultUnexpected(name: string): UnknownFunction {
  return (...args: readonly unknown[]): never => {
    throw new Error(`Unexpected ${name} call with ${args.length} argument(s)`);
  };
}

export function createSeamState(): SeamState {
  const calls: CallRecord[] = [];
  const clock = new OwnedClock();
  const fs = new VirtualFileSystem();
  const state: SeamState = {
    calls,
    clock,
    crypto: {
      getRandomValues: <T extends ArrayBufferView>(value: T): T => {
        new Uint8Array(value.buffer, value.byteOffset, value.byteLength).fill(7);
        return value;
      },
      randomUUID: () => {
        uuidCounter += 1;
        return `00000000-0000-4000-8000-${uuidCounter.toString().padStart(12, "0")}`;
      },
    },
    cuaFramePredicate: (text) => text.includes('"image_ref"'),
    currentInvocationContext: undefined,
    dataRoot: "/virtual/knorvia",
    deviceMid: "device-mid-test",
    fs,
    generateText: defaultUnexpected("AI SDK generateText"),
    optionMapApply: (body, values) => ({ ...body, appliedOptions: { ...values } }),
    os: {
      homedir: () => "/virtual/home",
      platform: () => "linux",
      tmpdir: () => "/virtual/tmp",
    },
    process: {
      cwd: () => "/virtual/cwd",
      env: {},
      platform: "linux",
      versions: { node: "24.14.0" },
    },
    providerModelFactory: (kind, options, modelId) => ({ kind, modelId, options }),
    runtime: {},
    streamText: defaultUnexpected("AI SDK streamText"),
    transport: {
      fetch: async (...args) => {
        record(state, "transport.fetch", args);
        throw new Error("Unexpected transport.fetch call");
      },
    },
  };
  return state;
}

export function installSeams(state: SeamState): void {
  Reflect.set(globalThis, activeSymbol, state);
  state.runtime = seamRuntimeExports();
}

export function currentSeams(): SeamState {
  const value = Reflect.get(globalThis, activeSymbol);
  if (typeof value !== "object" || value === null) throw new Error("No active contract-test seams");
  return value as SeamState;
}

export function removeSeams(state: SeamState): void {
  if (Reflect.get(globalThis, activeSymbol) === state)
    Reflect.deleteProperty(globalThis, activeSymbol);
}

export function createLogger(): Logger & { readonly calls: CallRecord[] } {
  const calls: CallRecord[] = [];
  const logger: Logger & { readonly calls: CallRecord[] } = {
    calls,
    child(context) {
      calls.push({ args: [context], name: "child" });
      return logger;
    },
    debug(message, context) {
      calls.push({ args: [message, context], name: "debug" });
    },
    error(message, error, context) {
      calls.push({ args: [message, error, context], name: "error" });
    },
    info(message, context) {
      calls.push({ args: [message, context], name: "info" });
    },
    warn(message, context) {
      calls.push({ args: [message, context], name: "warn" });
    },
  };
  return logger;
}

export function createStatusSink(options?: { throwOnPublish?: boolean }): ModelStatusSink & {
  readonly events: ModelNetworkStatusEvent[];
  readonly failures: readonly {
    readonly error: unknown;
    readonly event: ModelNetworkStatusEvent;
  }[];
} {
  const events: ModelNetworkStatusEvent[] = [];
  const failures: { error: unknown; event: ModelNetworkStatusEvent }[] = [];
  return {
    events,
    failures,
    publish(event) {
      if (options?.throwOnPublish === true) throw new Error("sink rejected event");
      events.push(event);
    },
    publishFailure(event, error) {
      failures.push({ error, event });
    },
  };
}

export function seamRuntimeExports(): Record<string, unknown> {
  const state = currentSeams();
  const call =
    (name: string, implementation: UnknownFunction): UnknownFunction =>
    (...args: readonly unknown[]) => {
      record(state, name, args);
      return implementation(...args);
    };
  const provider = (kind: string, options: unknown): UnknownFunction => {
    const makeModel = (modelId: unknown): unknown =>
      state.providerModelFactory(kind, options, String(modelId));
    const webSearch = call(`${kind}.tools.webSearch`, (input) => ({
      input,
      type: "provider-web-search",
    }));
    return Object.assign(makeModel, {
      chat: makeModel,
      languageModel: makeModel,
      messages: makeModel,
      responses: makeModel,
      tools: {
        webSearch: webSearch,
        webSearch_20250305: webSearch,
        webSearch_20260209: webSearch,
      },
    });
  };
  return {
    APICallError: SeamApiCallError,
    DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS: 600_000,
    ModelApiActorKind: {
      MainAgent: "main",
      Subagent: "subagent",
      System: "system",
      Tool: "tool",
      WorkflowChild: "workflow_child",
    },
    ModelApiOperation: {
      AgentStep: "agent_step",
      ContextCompaction: "context_compaction",
      GitCommitMessage: "workspace_git_commit_message",
      GoalTitle: "goal_title_generation",
      GoalVerification: "goal_completion_verification",
      ProjectMemoryExtract: "project_memory_extract",
      ReadSessionContextExtract: "read_session_context_extract",
      ReadSessionContextSynthesize: "read_session_context_synthesize",
      SessionTitle: "session_title_generation",
      ToolInternalModelCall: "tool_internal_model_call",
      WebFetch: "web_fetch_processing",
      WebSearch: "web_search",
      WorkspaceGenerateText: "workspace_generate_text",
    },
    ModelErrorCode: modelErrorCodes,
    ModelFailureExceptionKind: {
      ApiCall: "api_call",
      Generic: "generic",
      Protocol: "protocol",
      ProviderBusiness: "provider_business",
      Transport: "transport",
      TypeError: "type_error",
      Validation: "validation",
    },
    ModelFailureReason: modelFailureReasons,
    ModelRequestSessionType: { Main: "main", Other: "other", Subagent: "subagent" },
    ModelRetryBudget: { Default: "default", Unbounded: "unbounded" },
    ModelRetryReason: modelRetryReasons,
    ModelTransportKind: { Http: "http", Sse: "sse", WebSocket: "websocket" },
    Output: { object: call("ai.Output.object", (input) => input) },
    RetryError: SeamRetryError,
    anthropic: provider("anthropic-builtin", undefined),
    compileModelOptionMaps: call("optionMap.compile", (specs) => ({
      apply: call("optionMap.apply", (body, values) =>
        state.optionMapApply(body as Record<string, unknown>, values as Record<string, unknown>),
      ),
      specs,
    })),
    containsOfficialCuaImageRefCredentialText: call("cua.framePredicate", (text) =>
      state.cuaFramePredicate(String(text)),
    ),
    createAnthropic: call("provider.createAnthropic", (options) => provider("anthropic", options)),
    createNetworkProxyFetch: call("network.createProxyFetch", () => state.transport.fetch),
    createOpenAI: call("provider.createOpenAI", (options) => provider("openai", options)),
    createOpenAICompatible: call("provider.createOpenAICompatible", (options) =>
      provider("openai-compatible", options),
    ),
    ensureCliDeviceMid: call("device.ensureMid", async () => state.deviceMid),
    generateText: call("ai.generateText", (...args) => state.generateText(...args)),
    getCurrentModelInvocationContext: call(
      "contracts.getInvocationContext",
      () => state.currentInvocationContext,
    ),
    jsonSchema: call("ai.jsonSchema", (schema) => ({ schema })),
    normalizeKnorviaRuntimeEnv: call("shared.normalizeRuntimeEnv", (value) =>
      value === "development" || value === "production" || value === "test" ? value : undefined,
    ),
    resolveKnorviaDataRoot: call("shared.resolveDataRoot", () => state.dataRoot),
    streamText: call("ai.streamText", (...args) => state.streamText(...args)),
    tool: call("ai.tool", (definition) => definition),
    withOpenRouterAttributionHeaders: call("shared.openRouterHeaders", (headers) => headers),
  };
}

const modelErrorCodes = {
  InvalidModelSelection: "invalid_model_selection",
  InvalidModelRequest: "invalid_model_request",
  InvalidModelResponse: "invalid_model_response",
  ModelConfigMissing: "model_config_missing",
  ModelContextExceeded: "model_context_exceeded",
  ModelNotFound: "model_not_found",
  ModelRateLimited: "model_rate_limited",
  ModelRequestAuthMissing: "model_request_auth_missing",
  ModelRequestCancelled: "model_request_cancelled",
  ModelRequestFailed: "model_request_failed",
  ModelRequestTimeout: "model_request_timeout",
  ProviderNotFound: "provider_not_found",
  ProviderNotConfigured: "provider_not_configured",
};

const modelFailureReasons = {
  AuthFailed: "auth_failed",
  AuthRefresh: "auth_refresh",
  Cancelled: "cancelled",
  ContextExceeded: "context_exceeded",
  InvalidRequest: "invalid_request",
  NetworkError: "network_error",
  OffpeakQueued: "offpeak_queued",
  ProviderNotConfigured: "provider_not_configured",
  ProviderOverloaded: "provider_overloaded",
  ProxyError: "proxy_error",
  RateLimited: "rate_limited",
  ReasoningSignatureRepair: "reasoning_signature_repair",
  ServerError: "server_error",
  StaleConnection: "stale_connection",
  StreamIdleTimeout: "stream_idle_timeout",
  Timeout: "timeout",
  TlsError: "tls_error",
  Unknown: "unknown",
};

const modelRetryReasons = {
  AuthRefresh: "auth_refresh",
  NetworkError: "network_error",
  OffpeakQueued: "offpeak_queued",
  ProviderOverloaded: "provider_overloaded",
  RateLimited: "rate_limited",
  ReasoningSignatureRepair: "reasoning_signature_repair",
  ServerError: "server_error",
  StaleConnection: "stale_connection",
  StreamIdleTimeout: "stream_idle_timeout",
  Timeout: "timeout",
};
