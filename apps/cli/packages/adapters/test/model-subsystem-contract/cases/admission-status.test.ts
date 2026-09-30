// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelNetworkStatusEvent, ModelRequestAdmissionTicket } from "@knorvia/contracts";
import { modelId, registryModel, registryProvider, textMessage } from "../harness/fixtures.js";
import { useSeams } from "../harness/lifecycle.js";
import { loadTargetModule } from "../harness/loader.js";
import { createLogger, createStatusSink } from "../harness/seams.js";

test("admission uses fast path, queues only on a miss, forwards signal, and releases idempotently", async (context) => {
  useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/request-admission")>("request-admission");
  const events: string[] = [];
  let releases = 0;
  const ticket: ModelRequestAdmissionTicket = {
    publish: () => undefined,
    release: () => {
      releases += 1;
    },
  };
  const fast = await module.admitAttempt({
    admission: { acquire: async () => ticket, tryAcquire: () => ticket },
    model: { modelId: "m", providerId: "p" },
    onAdmitted: async () => {
      events.push("admitted");
    },
    onQueued: async () => {
      events.push("queued");
    },
  });
  assert.equal(fast.ticket, ticket);
  assert.equal(events.length, 0);
  fast.release();
  fast.release();
  assert.equal(releases, 1);

  let receivedSignal: AbortSignal | undefined;
  const controller = new AbortController();
  const queued = await module.admitAttempt({
    admission: {
      acquire: async (input) => {
        receivedSignal = input.signal;
        return ticket;
      },
      tryAcquire: () => undefined,
    },
    model: { modelId: "m", providerId: "p" },
    onAdmitted: async () => {
      events.push("admitted");
    },
    onQueued: async () => {
      events.push("queued");
    },
    signal: controller.signal,
  });
  assert.equal(queued.ticket, ticket);
  assert.equal(receivedSignal, controller.signal);
  assert.deepEqual(events, ["queued", "admitted"]);
});

test("admission cancellation rejects promptly when the injected port cooperates", async (context) => {
  useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/request-admission")>("request-admission");
  const controller = new AbortController();
  const waiting = module.admitAttempt({
    admission: {
      acquire: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    },
    model: { modelId: "m", providerId: "p" },
    signal: controller.signal,
  });
  const reason = new Error("cancel queued");
  controller.abort(reason);
  await assert.rejects(waiting, (error) => error === reason);
  const absent = await module.admitAttempt({ model: { modelId: "m", providerId: "p" } });
  assert.equal(absent.ticket, undefined);
  assert.doesNotThrow(() => absent.release());
});

test("status publishing isolates sinks, deduplicates identical objects, and keeps tickets independent", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner-status")>("runner-status");
  const logger = createLogger();
  const shared = createStatusSink();
  const ticket = createStatusSink();
  const failed = statusEvent({
    errorCode: "model_request_failed",
    errorPhase: "response",
    message: "safe",
    reason: "server_error",
    retryable: true,
    type: "model_request_failed",
  });
  const raw = new Error("raw provider secret");
  await module.publishModelStatus(failed, {
    admissionTicket: ticket,
    failureError: raw,
    logger,
    requestStatusSink: shared,
    statusSink: shared,
  });
  assert.equal(shared.events.length, 0);
  assert.equal(shared.failures.length, 1);
  assert.equal(shared.failures[0]?.error, raw);
  assert.equal(ticket.events.length, 1);
  assert.equal(ticket.failures.length, 0);

  const throwing = createStatusSink({ throwOnPublish: true });
  const healthy = createStatusSink();
  await assert.doesNotReject(
    module.publishModelStatus(failed, {
      logger,
      requestStatusSink: throwing,
      statusSink: healthy,
    }),
  );
  assert.equal(healthy.events.length, 1);
  assert.ok(logger.calls.some((call) => call.name === "warn"));
});

test("queued/admitted bypass the not-yet-issued ticket while started reaches it", async (context) => {
  useSeams(context);
  const status = await loadTargetModule<typeof import("@target/runner-status")>("runner-status");
  const admission =
    await loadTargetModule<typeof import("@target/request-admission")>("request-admission");
  const request = createStatusSink();
  const processSink = createStatusSink();
  const ticketSink = createStatusSink();
  const ticket: ModelRequestAdmissionTicket = {
    publish: (event) => ticketSink.publish(event),
    release: () => undefined,
  };
  const statusContext = baseStatusContext();
  const publishers = status.admissionWaitPublishers(statusContext, 1, {
    requestStatusSink: request,
    statusSink: processSink,
  });
  const admitted = await admission.admitAttempt({
    admission: {
      acquire: async () => ticket,
      tryAcquire: () => undefined,
    },
    model: { modelId: "model-test", providerId: "provider-test" },
    onAdmitted: publishers.onAdmitted,
    onQueued: publishers.onQueued,
  });
  assert.equal(admitted.ticket, ticket);
  assert.deepEqual(
    request.events.map((event) => event.type),
    ["model_request_queued", "model_request_admitted"],
  );
  assert.equal(ticketSink.events.length, 0);
  await status.publishModelStatus(statusEvent({ type: "model_request_started" }), {
    admissionTicket: admitted.ticket,
    requestStatusSink: request,
    statusSink: processSink,
  });
  assert.deepEqual(
    ticketSink.events.map((event) => event.type),
    ["model_request_started"],
  );
});

test("attempt ids change after the first physical attempt while logical attribution remains", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner-status")>("runner-status");
  const statusContext = baseStatusContext();
  const first = module.createAttemptStatusContext(statusContext, 1);
  const second = module.createAttemptStatusContext(statusContext, 2);
  const third = module.createAttemptStatusContext(statusContext, 3);
  assert.equal(first.requestId, "logical-request");
  assert.notEqual(second.requestId, first.requestId);
  assert.notEqual(third.requestId, second.requestId);
  assert.equal(second.traceId, first.traceId);
  assert.equal(second.sessionId, first.sessionId);
  assert.equal(second.turnId, first.turnId);
  assert.equal(second.modelCall.logicalCallId, first.modelCall.logicalCallId);
});

test("attribution headers override caller internals and never expose the internal prefix", async (context) => {
  useSeams(context);
  const attribution =
    await loadTargetModule<typeof import("@target/runner-attribution")>("runner-attribution");
  const headers = attribution.createModelRequestAttributionHeaders(baseStatusContext());
  assert.ok(Object.values(headers).includes("logical-request"));
  assert.ok(Object.values(headers).includes("trace-test"));
  assert.ok(Object.values(headers).includes("main"));
  assert.doesNotMatch(JSON.stringify(headers), /knorvia-internal|x-zcode/iu);
  assert.equal(
    attribution.normalizeModelSessionIdForAttribution(" session-test " as never),
    " session-test ",
  );
  assert.equal(attribution.normalizeModelSessionIdForAttribution("sess_abc" as never), "abc");
  assert.equal(
    attribution.normalizeModelSessionIdForAttribution(" sess_abc" as never),
    " sess_abc",
  );
  assert.equal(
    attribution.resolveModelRequestSessionType(undefined, {
      actorKind: "subagent",
      operation: "agent_step",
    } as never),
    "subagent",
  );
});

test("network headers are sanitized before status and logs", async (context) => {
  useSeams(context);
  const module =
    await loadTargetModule<typeof import("@target/runner-network-headers")>(
      "runner-network-headers",
    );
  const sanitized = module.sanitizeModelNetworkHeaders({
    Authorization: "Bearer secret",
    Cookie: "session=secret",
    "Set-Cookie": "token=secret",
    "X-Request-Id": "request-visible",
  });
  assert.equal(sanitized["x-request-id"] ?? sanitized["X-Request-Id"], "request-visible");
  assert.doesNotMatch(JSON.stringify(sanitized), /Bearer secret|session=secret|token=secret/u);
});

test("addStatusSink preserves the documented loss of raw publishFailure fan-out", async (context) => {
  useSeams(context);
  const module = await loadTargetModule<typeof import("@target/runner")>("runner");
  const first = createStatusSink();
  const second = createStatusSink();
  const request = createStatusSink();
  const adapter = new module.AiSdkModelAdapter({
    env: { KNORVIA_RUNTIME_ENV: "test" },
    retry: { maxAttempts: 1 },
    runtime: {
      async generateText() {
        throw Object.assign(new Error("raw failure"), { statusCode: 503 });
      },
      streamText() {
        throw new Error("not used");
      },
    },
    statusSink: first,
  });
  adapter.addStatusSink(second);
  const model = adapter.createModel({
    modelConfig: registryModel(),
    modelId: modelId(),
    providerConfig: registryProvider(),
    providerId: "provider-test",
  });
  await assert.rejects(
    model.bind({ maxOutputTokens: 10, reasoningLevel: "low" }).generateText({
      messages: [textMessage()],
      statusSink: request,
    } as never),
  );
  assert.equal(first.failures.length, 0);
  assert.equal(second.failures.length, 0);
  assert.equal(first.events.filter((event) => event.type === "model_request_failed").length, 1);
  assert.equal(second.events.filter((event) => event.type === "model_request_failed").length, 1);
  assert.equal(request.failures.length, 0);
});

function statusEvent(overrides: Record<string, unknown>): ModelNetworkStatusEvent {
  return {
    attempt: 1,
    maxAttempts: 2,
    modelId: "model-test",
    providerId: "provider-test",
    requestId: "request-test",
    timestamp: "2026-01-01T00:00:00.000Z",
    traceId: "trace-test",
    transport: "http",
    ...overrides,
  } as unknown as ModelNetworkStatusEvent;
}

function baseStatusContext(): import("@target/runner-status").ModelStatusContext {
  return {
    maxAttempts: 3,
    modelCall: {
      actorKind: "main",
      logicalCallId: "logical-call",
      operation: "agent_step",
      reasoning: {
        capability: "unknown",
        effectiveControl: "unknown",
        effectiveState: "unknown",
        requestedControl: "unknown",
        requestedState: "unknown",
      },
    },
    modelId: "model-test",
    modelRequestSessionType: "main",
    providerId: "provider-test",
    requestId: "logical-request",
    sessionId: "session-test",
    traceId: "trace-test",
    transport: "http",
    turnId: "turn-test",
  } as unknown as import("@target/runner-status").ModelStatusContext;
}
