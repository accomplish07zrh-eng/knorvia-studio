// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelNetworkStatusEvent, ModelRequestAdmissionTicket } from "@knorvia/contracts";
import { waitUntil } from "../harness/async.js";
import {
  deferred,
  generateResult,
  modelId,
  registryModel,
  registryProvider,
  resolvedModel,
  textMessage,
  textRequest,
  traceContext,
} from "../harness/fixtures.js";
import { settleOwnedWork, useSeams } from "../harness/lifecycle.js";
import { loadTargetModule } from "../harness/loader.js";
import { createLogger, createStatusSink } from "../harness/seams.js";

test("generate normalizes result fields, malformed tool input, sources, and structured output", async (context) => {
  useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/runner-generate")>("runner-generate");
  const logger = createLogger();
  const result = await module.runGenerateText({
    env: { KNORVIA_RUNTIME_ENV: "test" },
    logger,
    modelIoFullRetentionEnabled: false,
    request: runtimeRequest({ responseJsonSchema: { type: "object" } }),
    resolveModel: () => resolvedModel() as never,
    resolved: resolvedModel() as never,
    retry: retryOptions(0),
    runtime: {
      async generateText() {
        return generateResult({
          output: { answer: 42 },
          reasoning: [
            {
              providerMetadata: { anthropic: { signature: "sig" } },
              text: "thought",
              type: "reasoning",
            },
          ],
          sources: [
            { id: "source", sourceType: "url", type: "source", url: "https://example.invalid" },
          ],
          toolCalls: [
            { input: "{", providerExecuted: true, toolCallId: "call-1", toolName: "run" },
          ],
          toolResults: [
            { input: "{}", output: { ok: true }, toolCallId: "call-1", toolName: "run" },
          ],
        }) as never;
      },
      streamText() {
        throw new Error("not used");
      },
    },
  });
  assert.equal(result.text, JSON.stringify({ answer: 42 }));
  assert.deepEqual(result.toolCalls, [
    { id: "call-1", input: {}, name: "run", providerExecuted: true },
  ]);
  assert.equal(result.toolResults?.[0]?.name, "run");
  assert.equal(result.sources?.[0]?.url, "https://example.invalid");
  assert.equal(result.reasoning?.[0]?.text, "thought");
  assert.ok(logger.calls.some((call) => call.name === "warn"));
});

test("missing or unserializable structured output fails instead of returning plain text", async (context) => {
  useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/runner-generate")>("runner-generate");
  for (const output of [undefined, { circular: undefined }] as const) {
    const value =
      output === undefined
        ? undefined
        : (() => {
            const circular: Record<string, unknown> = {};
            circular.self = circular;
            return circular;
          })();
    const notCalled = Symbol("not-called");
    let suppliedOutput: unknown = notCalled;
    let sdkCalls = 0;
    await assert.rejects(
      module.runGenerateText({
        env: { KNORVIA_RUNTIME_ENV: "test" },
        modelIoFullRetentionEnabled: false,
        request: runtimeRequest({ responseJsonSchema: { type: "object" } }),
        resolveModel: () => resolvedModel() as never,
        resolved: resolvedModel() as never,
        retry: retryOptions(0),
        runtime: {
          async generateText() {
            sdkCalls += 1;
            suppliedOutput = value;
            return generateResult({ output: value }) as never;
          },
          streamText() {
            throw new Error("not used");
          },
        },
      }),
    );
    assert.equal(sdkCalls, 1);
    assert.notEqual(suppliedOutput, notCalled);
    assert.equal(suppliedOutput, value);
  }
});

test("a failed attempt releases admission before retry backoff and gets a new ticket/request id", async (context) => {
  const seams = useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/runner-generate")>("runner-generate");
  const statuses = createStatusSink();
  const ticketEvents: ModelNetworkStatusEvent[][] = [];
  const released: boolean[] = [];
  let runtimeCalls = 0;
  const request = runtimeRequest({
    modelRequestAdmission: {
      async acquire() {
        const index = ticketEvents.length;
        ticketEvents.push([]);
        released.push(false);
        return {
          publish(event) {
            ticketEvents[index]?.push(event);
          },
          release() {
            released[index] = true;
          },
        } satisfies ModelRequestAdmissionTicket;
      },
    },
    statusSink: statuses,
  });
  const promise = module.runGenerateText({
    env: { KNORVIA_RUNTIME_ENV: "test" },
    modelIoFullRetentionEnabled: false,
    request,
    resolveModel: () => resolvedModel() as never,
    resolved: resolvedModel() as never,
    retry: retryOptions(1, 100),
    runtime: {
      async generateText() {
        runtimeCalls += 1;
        if (runtimeCalls === 1) throw Object.assign(new Error("temporary"), { statusCode: 503 });
        return generateResult() as never;
      },
      streamText() {
        throw new Error("not used");
      },
    },
  });
  await waitUntil(() => seams.clock.pendingDelays().length > 0, 50);
  assert.equal(released[0], true);
  assert.equal(ticketEvents.length, 1);
  await seams.clock.advanceBy(100);
  const result = await promise;
  assert.equal(result.text, "done");
  assert.equal(runtimeCalls, 2);
  assert.equal(released[1], true);
  const started = statuses.events.filter((event) => event.type === "model_request_started");
  assert.equal(started.length, 2);
  assert.notEqual(started[0]?.requestId, started[1]?.requestId);
});

test("generate cancellation rejects immediately and discards a late runtime resolution", async (context) => {
  useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/runner-generate")>("runner-generate");
  const delayed = deferred<never>();
  const controller = new AbortController();
  const statuses = createStatusSink();
  const promise = module.runGenerateText({
    env: { KNORVIA_RUNTIME_ENV: "test" },
    modelIoFullRetentionEnabled: false,
    request: runtimeRequest({ abortSignal: controller.signal, statusSink: statuses }),
    resolveModel: () => resolvedModel() as never,
    resolved: resolvedModel() as never,
    retry: retryOptions(0),
    runtime: {
      generateText: async () => delayed.promise,
      streamText() {
        throw new Error("not used");
      },
    },
  });
  await Promise.resolve();
  controller.abort(new Error("user cancelled"));
  await assert.rejects(promise, hasCode("model_request_cancelled"));
  delayed.resolve(generateResult() as never);
  await Promise.resolve();
  assert.equal(
    statuses.events.some((event) => event.type === "model_request_completed"),
    false,
  );
  assert.equal(statuses.events.filter((event) => event.type === "model_request_failed").length, 1);
});

test("runtime header refresh runs for every physical account attempt and preserves logical context", async (context) => {
  useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/runner-runtime-headers")>(
      "runner-runtime-headers",
    );
  const calls: unknown[] = [];
  const request = runtimeRequest({
    refreshRuntimeHeadersBeforeAttempt: async (
      input: Parameters<
        NonNullable<
          import("@target/runner-runtime").AiSdkModelTextRequest["refreshRuntimeHeadersBeforeAttempt"]
        >
      >[0],
    ) => {
      calls.push(input);
      return {
        headersApplied: true,
        requestAuth: { headers: { "x-attempt": String(input.attempt) } },
      };
    },
  });
  const auth: unknown[] = [];
  const resolve = (requestAuth?: unknown): never => {
    auth.push(requestAuth);
    return resolvedModel({
      accountAccess: {
        accountType: "zai",
        entitled: true,
        mode: "off-peak",
        type: "zhipu-account",
      },
    }) as never;
  };
  await module.resolveModelForAttempt({ attempt: 1, request, resolveModel: resolve });
  await module.resolveModelForAttempt({ attempt: 2, request, resolveModel: resolve });
  assert.equal(calls.length, 2);
  assert.equal(Reflect.get(calls[0] as object, "attempt"), 1);
  assert.equal(Reflect.get(calls[1] as object, "attempt"), 2);
  for (const call of calls) {
    assert.equal(Reflect.get(call as object, "modelId"), "model-test");
    assert.equal(Reflect.get(call as object, "providerId"), "provider-test");
    assert.equal(Reflect.get(call as object, "traceContext"), request.traceContext);
  }
  assert.deepEqual(
    auth.filter((value) => value !== undefined),
    [{ headers: { "x-attempt": "1" } }, { headers: { "x-attempt": "2" } }],
  );
});

test("pre-start missing account auth releases admission without a failed runner event", async (context) => {
  const seams = useSeams(context);
  const runner = await loadTargetModule<typeof import("@target/runner")>("runner");
  const statuses = createStatusSink();
  const ticketEvents: ModelNetworkStatusEvent[] = [];
  let authCalls = 0;
  let released = 0;
  let runtimeCalls = 0;
  seams.currentInvocationContext = {
    modelRequestAdmission: {
      async acquire() {
        return {
          publish(event: ModelNetworkStatusEvent) {
            ticketEvents.push(event);
          },
          release() {
            released += 1;
          },
        };
      },
      tryAcquire: () => undefined,
    },
    statusSink: statuses,
    traceContext: traceContext(),
  };
  const adapter = new runner.AiSdkModelAdapter({
    env: { KNORVIA_RUNTIME_ENV: "test" },
    retry: { maxAttempts: 1 },
    runtime: {
      async generateText() {
        runtimeCalls += 1;
        return generateResult() as never;
      },
      streamText() {
        throw new Error("not used");
      },
    },
  });
  const accountProvider = registryProvider({
    access: { accountType: "zai", entitled: true, mode: "off-peak", type: "zhipu-account" },
  });
  const model = adapter.createModel({
    modelConfig: registryModel(),
    modelId: modelId(),
    providerConfig: accountProvider,
    providerId: "provider-test",
    requestDependencies: {
      requestAuth: {
        source: {
          async resolve() {
            authCalls += 1;
            return undefined;
          },
        },
      },
    },
  });
  await assert.rejects(
    model
      .bind({ maxOutputTokens: 10, reasoningLevel: "low" })
      .generateText({ messages: [textMessage()] }),
    hasCode("model_request_auth_missing"),
  );
  assert.equal(authCalls, 1);
  assert.equal(released, 1);
  assert.equal(runtimeCalls, 0);
  assert.deepEqual(
    statuses.events.map((event) => event.type),
    ["model_request_queued", "model_request_admitted"],
  );
  assert.equal(ticketEvents.length, 0);
});

test("ordinary API-key models never invoke the account auth source", async (context) => {
  const seams = useSeams(context);
  const runner = await loadTargetModule<typeof import("@target/runner")>("runner");
  let authCalls = 0;
  const adapter = new runner.AiSdkModelAdapter({
    env: { KNORVIA_RUNTIME_ENV: "test" },
    runtime: {
      async generateText() {
        return generateResult() as never;
      },
      streamText() {
        throw new Error("not used");
      },
    },
  });
  const model = adapter.createModel({
    modelConfig: registryModel(),
    modelId: modelId(),
    providerConfig: registryProvider(),
    providerId: "provider-test",
    requestDependencies: {
      requestAuth: {
        source: {
          resolve: async () => {
            authCalls += 1;
            return undefined;
          },
        },
      },
    },
  });
  await model
    .bind({ maxOutputTokens: 10, reasoningLevel: "low" })
    .generateText({ messages: [textMessage()] });
  await settleOwnedWork(seams);
  assert.equal(authCalls, 0);
});

function runtimeRequest(
  overrides: Record<string, unknown> = {},
): import("@target/runner-runtime").AiSdkModelTextRequest {
  return {
    ...textRequest(),
    modelCall: { actorKind: "main", operation: "agent_step", reasoning: { requestedLevel: "low" } },
    modelRequestSessionType: "main",
    traceContext: traceContext(),
    ...overrides,
  } as unknown as import("@target/runner-runtime").AiSdkModelTextRequest;
}

function retryOptions(
  retryCount: number,
  baseDelayMs = 0,
): import("@target/retry-policy").ResolvedAiSdkModelRetryOptions {
  return {
    backoffFactor: 2,
    baseDelayMs,
    jitter: false,
    maxAttempts: retryCount + 1,
    maxDelayMs: 60_000,
  };
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error) =>
    typeof error === "object" && error !== null && Reflect.get(error, "code") === code;
}
