// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-02 合同测试：@knorvia/telemetry（B24–B36）。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { load, packageDir } from "./entry.mjs";

const telemetry = await load("telemetry");
const runtimeModule = await load("telemetry", "agent-trace-runtime");
const support = await load("telemetry", "agent-trace-support");
const sanitizer = await load("telemetry", "error-sanitizer");
const endpointModule = await load("telemetry", "provider-endpoint");
const recorderModule = await load("telemetry", "model-api-recorder");
const bootstrap = await load("telemetry", "bootstrap");
const metricsModule = await load("telemetry", "agent-metrics");
const compat = await load("telemetry", "compatibility-adapters");
const exporterModule = await load("telemetry", "otlp-exporter");

const requireFromTelemetry = createRequire(join(packageDir("telemetry"), "package.json"));
const otelApi = await import(
  pathToFileURL(requireFromTelemetry.resolve("@opentelemetry/api")).href
);
const { AsyncLocalStorageContextManager } = await import(
  pathToFileURL(requireFromTelemetry.resolve("@opentelemetry/context-async-hooks")).href
);

// 默认 Context Manager 是 no-op；合同要求 run 内的 active writer context 可观测，
// 因此在测试进程注册 AsyncLocalStorage 实现，并保留注入激活/收尾故障的开关。
const als = new AsyncLocalStorageContextManager();
als.enable();
let contextMode = "normal";
otelApi.context.setGlobalContextManager({
  active: () => als.active(),
  bind: (target, thisArg) => als.bind(target, thisArg),
  disable: () => als.disable(),
  enable: () => als.enable(),
  with: (ctx, fn, thisArg, ...args) => {
    if (contextMode === "activate-fail") throw new Error("context activation boom");
    if (contextMode === "teardown-fail") {
      als.with(ctx, fn, thisArg, ...args);
      throw new Error("context teardown boom");
    }
    return als.with(ctx, fn, thisArg, ...args);
  },
});

const TRACE_ENDPOINT = "http://127.0.0.1:4318/v1/traces";
const VALID_TRACE_ID = "1234567890abcdef1234567890abcdef";
const DEFAULT_REASONING = {
  capability: "unknown",
  effectiveControl: "unknown",
  effectiveState: "unknown",
  requestedControl: "unknown",
  requestedState: "unknown",
};

function removeDir(path) {
  rmSync(path, { force: true, maxRetries: 5, recursive: true, retryDelay: 50 });
}

function tempDir(t, prefix = "acp02-telemetry-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => removeDir(dir));
  return dir;
}

function enabledEnv(overrides = {}) {
  return {
    KNORVIA_MODEL_TELEMETRY_ENABLED: "1",
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: TRACE_ENDPOINT,
    ...overrides,
  };
}

let spanSequence = 0x100;

function createSpan(name) {
  spanSequence += 1;
  const spanId = spanSequence.toString(16).padStart(16, "0");
  const record = {
    addEventCalls: [],
    attributes: {},
    endCount: 0,
    events: [],
    name,
    spanId,
    status: undefined,
    traceId: VALID_TRACE_ID,
  };
  return {
    addEvent(eventName, attributes) {
      record.addEventCalls.push(eventName);
      record.events.push({ attributes, name: eventName });
    },
    end() {
      record.endCount += 1;
    },
    isRecording() {
      return record.endCount === 0;
    },
    record,
    setAttribute(key, value) {
      record.attributes[key] = value;
    },
    setStatus(status) {
      record.status = status;
    },
    spanContext() {
      return {
        isRemote: false,
        spanId: record.spanId,
        traceFlags: 1,
        traceId: record.traceId,
      };
    },
    updateName(nextName) {
      record.name = nextName;
    },
  };
}

function createTracer({ failOnName } = {}) {
  const spans = [];
  return {
    spans,
    startSpan(name, options, parentContext) {
      if (failOnName === name) throw new Error(`${name} creation boom`);
      const span = createSpan(name);
      span.options = options;
      span.parentContext = parentContext;
      Object.assign(span.record.attributes, options?.attributes ?? {});
      spans.push(span);
      return span;
    },
  };
}

function createMetricsRecorder({ failCreationDrop = false } = {}) {
  const events = [];
  return {
    events,
    recordCommandFirstOutput(durationMs, labels) {
      events.push(["commandFirstOutput", durationMs, labels]);
    },
    recordCreationDrop(spanName, reason) {
      if (failCreationDrop) throw new Error("metric boom");
      events.push(["creationDrop", spanName, reason]);
    },
    recordModelAttemptDetail(labels, detail) {
      events.push(["modelAttemptDetail", labels, detail]);
    },
    recordModelCallAttempts(attemptCount, labels) {
      events.push(["modelCallAttempts", attemptCount, labels]);
    },
    recordModelTokenDelta(tokenType, delta, labels) {
      events.push(["modelTokenDelta", tokenType, delta, labels]);
    },
    recordSpanTerminal(spanName, outcome, durationMs, labels, abandonReason) {
      events.push(["terminal", spanName, outcome, durationMs, labels, abandonReason]);
    },
  };
}

function attemptWriterRecorder(attempt) {
  const push =
    (name) =>
    (...args) =>
      attempt.events.push([name, ...args]);
  return {
    finishAbandoned: push("abandoned"),
    finishCancelled: push("cancelled"),
    finishCompleted: () => attempt.events.push(["completed"]),
    finishFailed: push("failed"),
    markFirstContent: push("firstContent"),
    markFirstProviderEvent: push("firstProviderEvent"),
    markFirstText: push("firstText"),
    markStreamStalled: push("streamStalled"),
    setCacheReadTokens: push("cacheReadTokens"),
    setCacheWriteTokens: push("cacheWriteTokens"),
    setEffectiveReasoningBudgetTokens: push("reasoningBudget"),
    setEffectiveReasoningControl: push("reasoningControl"),
    setEffectiveReasoningLevel: push("reasoningLevel"),
    setEffectiveReasoningState: push("reasoningState"),
    setFinishReason: push("finishReason"),
    setHttpStatusCode: push("httpStatusCode"),
    setInputTokens: push("inputTokens"),
    setOutputTokens: push("outputTokens"),
    setProviderErrorCode: push("providerErrorCode"),
    setProviderErrorMessage: push("providerErrorMessage"),
    setProviderRequestId: push("providerRequestId"),
    setReasoningTokens: push("reasoningTokens"),
    setResponseModel: push("responseModel"),
    setRetryAfterMs: push("retryAfterMs"),
    setStreamOutputCommitted: push("streamOutputCommitted"),
  };
}

function createModelExecution() {
  const calls = [];
  return {
    calls,
    modelExecution: {
      startCall(input) {
        const call = { attempts: [], events: [], input };
        calls.push(call);
        return {
          finishAbandoned(reason) {
            call.events.push(["abandoned", reason]);
          },
          finishCancelled(reason) {
            call.events.push(["cancelled", reason]);
          },
          finishCompleted() {
            call.events.push(["completed"]);
          },
          finishFailed(stage, category, error) {
            call.events.push(["failed", stage, category, error]);
          },
          markFallbackSelected(reason) {
            call.events.push(["fallback", reason]);
          },
          startAttempt(attemptInput) {
            const attempt = { events: [], input: attemptInput };
            call.attempts.push(attempt);
            return attemptWriterRecorder(attempt);
          },
        };
      },
    },
  };
}

function modelEvent(type, overrides = {}) {
  return {
    attempt: 1,
    baseURL: "https://api.example.com/v1/chat/completions",
    maxAttempts: 3,
    modelCall: {
      actorKind: "main",
      logicalCallId: "lc-1",
      operation: "agent_step",
      reasoning: DEFAULT_REASONING,
    },
    modelId: "model-1",
    providerId: "prov-1",
    providerKind: "openai",
    requestId: "req-1",
    timestamp: "2026-01-01T00:00:00.000Z",
    traceId: "trace-b7f3",
    transport: "http",
    type,
    ...overrides,
  };
}

test("B24 包导出面与无 Owner noop", async () => {
  await telemetry.shutdownPreparedModelTelemetry();
  assert.deepEqual(Object.keys(telemetry).sort(), [
    "AgentExecutionTelemetryRuntime",
    "ModelApiTelemetryStatusSink",
    "NoopAgentExecutionTelemetry",
    "PROVIDER_ENDPOINT_SANITIZER_VERSION",
    "ProviderEndpointIdentityCache",
    "claimSanitizedTelemetryError",
    "createModelTelemetry",
    "normalizeTelemetryDeviceMid",
    "parseOtlpHeaders",
    "prepareModelTelemetryEnv",
    "resolveOtlpMetricEndpoint",
    "resolveOtlpTraceEndpoint",
    "sanitizeErrorMessage",
    "sanitizeProviderEndpoint",
    "sanitizeTelemetryError",
    "shutdownPreparedModelTelemetry",
    "updatePreparedTelemetryIdentity",
  ]);
  assert.equal(telemetry.createOwnedAgentTelemetryRuntime, undefined);

  const first = bootstrap.createModelTelemetry();
  const second = bootstrap.createModelTelemetry({});
  assert.equal(first.enabled, false);
  assert.equal(first.agentExecution, first.modelExecution);
  assert.ok(first.agentExecution instanceof runtimeModule.NoopAgentExecutionTelemetry);
  assert.equal(first.agentExecution, second.agentExecution);
  assert.equal(first.statusSink, undefined);
  await first.shutdown();
  await second.shutdown();

  const noop = first.agentExecution;
  assert.equal(noop.captureCausation(), undefined);
  assert.equal(
    noop.startTurn().run(() => 7),
    7,
  );
  assert.equal(noop.startStep().captureCausation(), undefined);
  noop.startTool().finishCompleted();
  noop.startCompaction().finishDiscarded();
  noop.startDetachedOperation().setResultType("ignored");
  const call = noop.startCall();
  call.startAttempt().finishAbandoned("missing_terminal");
  call.finishCompleted();
  noop.abandonSession("s");
});

test("B25 Owner 委托与关闭语义", async () => {
  const operations = [];
  const agentExecution = { kind: "agent" };
  const modelExecution = { kind: "model" };
  const statusSink = { kind: "sink" };
  const owner = {
    abandonSession(sessionId) {
      operations.push(["abandon", sessionId]);
    },
    agentExecution,
    enabled: true,
    async flush(options) {
      operations.push(["flush", options]);
    },
    modelExecution,
    statusSink,
    async shutdown() {
      operations.push(["shutdown"]);
    },
    updateIdentity() {},
  };
  const scoped = bootstrap.createModelTelemetry({ owner, sessionId: "sess-1" });
  assert.equal(scoped.agentExecution, agentExecution);
  assert.equal(scoped.modelExecution, modelExecution);
  assert.equal(scoped.statusSink, statusSink);
  assert.equal(scoped.enabled, true);
  await scoped.shutdown();
  assert.deepEqual(operations, [
    ["abandon", "sess-1"],
    ["flush", { timeoutMs: 1_500 }],
  ]);

  const shared = bootstrap.createModelTelemetry({ owner });
  await shared.shutdown();
  assert.deepEqual(operations.at(-1), ["flush", { timeoutMs: 1_500 }]);
  assert.equal(
    operations.some(([name]) => name === "shutdown"),
    false,
  );

  const failing = {
    ...owner,
    async flush() {
      throw new Error("flush boom");
    },
  };
  await assert.rejects(
    bootstrap.createModelTelemetry({ owner: failing }).shutdown(),
    /flush boom/u,
  );
});

test("B26 OTLP 端点与 header", async () => {
  const trace = bootstrap.resolveOtlpTraceEndpoint;
  const metric = bootstrap.resolveOtlpMetricEndpoint;
  assert.equal(
    trace({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: " https://trace.example/custom " }),
    "https://trace.example/custom",
  );
  assert.equal(
    trace({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://trace.example" }),
    "https://trace.example/",
  );
  assert.equal(
    trace({ OTEL_EXPORTER_OTLP_ENDPOINT: "https://common.example/otlp/" }),
    "https://common.example/otlp/v1/traces",
  );
  assert.equal(
    trace({ OTEL_EXPORTER_OTLP_ENDPOINT: "https://common.example" }),
    "https://common.example/v1/traces",
  );
  assert.equal(
    trace({
      OTEL_EXPORTER_OTLP_ENDPOINT: "https://common.example",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "ftp://trace.example",
    }),
    undefined,
  );
  assert.equal(
    trace({
      OTEL_EXPORTER_OTLP_ENDPOINT: "https://common.example",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "not a url",
    }),
    undefined,
  );
  assert.equal(trace({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "   " }), undefined);
  assert.equal(trace({ OTEL_EXPORTER_OTLP_ENDPOINT: "file:///tmp/x" }), undefined);
  assert.equal(trace({}), undefined);

  assert.equal(
    metric({ OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: "https://metrics.example/m" }),
    "https://metrics.example/m",
  );
  assert.equal(
    metric({ OTEL_EXPORTER_OTLP_ENDPOINT: "https://common.example/base" }),
    "https://common.example/base/v1/metrics",
  );
  assert.equal(
    metric({
      OTEL_EXPORTER_OTLP_ENDPOINT: "https://common.example",
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: "ftp://metrics.example",
    }),
    undefined,
  );
  assert.equal(
    metric({
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://trace.example/t",
    }),
    "https://trace.example/t",
  );
  assert.equal(metric({ OTEL_EXPORTER_OTLP_ENDPOINT: "ftp://common.example" }), undefined);
  assert.equal(metric({}), undefined);

  const headers = bootstrap.parseOtlpHeaders;
  assert.deepEqual(headers("a=1, b = hello=world , bad, =x, c= ,d=%E4%B8%AD"), {
    a: "1",
    b: "hello=world",
    d: "中",
  });
  assert.deepEqual(headers("Authorization=Bearer%20abc"), { Authorization: "Bearer abc" });
  assert.deepEqual(headers("%E0%A4%A=1"), { "%E0%A4%A": "1" });
  assert.equal(headers(""), undefined);
  assert.equal(headers("   "), undefined);
  assert.equal(headers("novalue"), undefined);
  assert.equal(headers(undefined), undefined);
});

test("B27 启用开关、设备 MID 与旁路", async (t) => {
  const prepare = bootstrap.prepareModelTelemetryEnv;
  const shutdown = telemetry.shutdownPreparedModelTelemetry;
  const root = tempDir(t);

  assert.equal(bootstrap.normalizeTelemetryDeviceMid(" abc.DEF-1:2 "), "abc.DEF-1:2");
  assert.equal(bootstrap.normalizeTelemetryDeviceMid("bad id"), undefined);
  assert.equal(bootstrap.normalizeTelemetryDeviceMid("x".repeat(129)), undefined);
  assert.equal(bootstrap.normalizeTelemetryDeviceMid(undefined), undefined);

  const disabled = { KNORVIA_HOME: join(root, "disabled-home") };
  assert.equal(await prepare(disabled), disabled);
  assert.equal(existsSync(join(root, "disabled-home", "v2", "telemetry-state.json")), false);
  const enabledWithoutEndpoint = { KNORVIA_MODEL_TELEMETRY_ENABLED: "1" };
  assert.equal(await prepare(enabledWithoutEndpoint), enabledWithoutEndpoint);
  assert.equal(bootstrap.createModelTelemetry().enabled, false);

  const existing = enabledEnv({ KNORVIA_TELEMETRY_DEVICE_MID: "custom.mid-1:_" });
  try {
    const prepared = await prepare(existing);
    assert.equal(prepared.KNORVIA_TELEMETRY_DEVICE_MID, "custom.mid-1:_");
    assert.equal(prepared.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, TRACE_ENDPOINT);
    const boot = bootstrap.createModelTelemetry({ sessionId: "sess-ready" });
    assert.equal(boot.enabled, true);
    assert.equal(boot.agentExecution, boot.modelExecution);
    assert.ok(boot.statusSink instanceof recorderModule.ModelApiTelemetryStatusSink);
    await boot.shutdown();
  } finally {
    await shutdown();
  }

  const home = join(root, "fresh-home");
  let freshDeviceMid;
  try {
    const prepared = await prepare(enabledEnv({ KNORVIA_HOME: home }));
    const deviceMid = prepared.KNORVIA_TELEMETRY_DEVICE_MID;
    freshDeviceMid = deviceMid;
    assert.match(deviceMid, /^[0-9a-f-]{36}$/u);
    const stateFile = join(home, "v2", "telemetry-state.json");
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    assert.equal(state.deviceMid, deviceMid);
    const repeated = await prepare(enabledEnv({ KNORVIA_HOME: home }));
    assert.equal(repeated.KNORVIA_TELEMETRY_DEVICE_MID, deviceMid);
  } finally {
    await shutdown();
  }

  const corruptHome = join(root, "corrupt-home");
  mkdirSync(join(corruptHome, "v2"), { recursive: true });
  writeFileSync(join(corruptHome, "v2", "telemetry-state.json"), "not-json", "utf8");
  try {
    const prepared = await prepare(enabledEnv({ KNORVIA_HOME: corruptHome }));
    assert.ok(prepared.KNORVIA_TELEMETRY_DEVICE_MID);
    const state = JSON.parse(readFileSync(join(corruptHome, "v2", "telemetry-state.json"), "utf8"));
    assert.equal(state.deviceMid, prepared.KNORVIA_TELEMETRY_DEVICE_MID);
  } finally {
    await shutdown();
  }

  const fileAsHome = join(root, "not-a-directory");
  writeFileSync(fileAsHome, "x", "utf8");
  const broken = enabledEnv({ KNORVIA_HOME: join(fileAsHome, "v2") });
  try {
    assert.equal(await prepare(broken), broken);
    assert.equal(broken.KNORVIA_TELEMETRY_DEVICE_MID, undefined);
  } finally {
    await shutdown();
  }

  const lockedHome = join(root, "locked-home");
  mkdirSync(join(lockedHome, "v2"), { recursive: true });
  const lockedFile = join(lockedHome, "v2", "telemetry-state.lock");
  writeFileSync(lockedFile, JSON.stringify({ createdAt: Date.now(), pid: process.pid }), "utf8");
  try {
    const prepared = await prepare(enabledEnv({ KNORVIA_HOME: lockedHome }));
    assert.equal(prepared.KNORVIA_TELEMETRY_DEVICE_MID, undefined);
    assert.equal(existsSync(lockedFile), true);
  } finally {
    await shutdown();
  }

  const staleHome = join(root, "stale-home");
  mkdirSync(join(staleHome, "v2"), { recursive: true });
  const staleFile = join(staleHome, "v2", "telemetry-state.lock");
  const dead = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
  writeFileSync(staleFile, JSON.stringify({ createdAt: 0, pid: dead.pid }), "utf8");
  const old = new Date(Date.now() - 10 * 60_000);
  utimesSync(staleFile, old, old);
  try {
    const prepared = await prepare(enabledEnv({ KNORVIA_HOME: staleHome }));
    assert.ok(prepared.KNORVIA_TELEMETRY_DEVICE_MID);
    assert.equal(existsSync(staleFile), false);
  } finally {
    await shutdown();
  }

  const sharedHome = join(root, "shared-home");
  try {
    const [left, right] = await Promise.all([
      prepare(enabledEnv({ KNORVIA_HOME: sharedHome })),
      prepare(enabledEnv({ KNORVIA_HOME: sharedHome })),
    ]);
    assert.equal(left.KNORVIA_TELEMETRY_DEVICE_MID, right.KNORVIA_TELEMETRY_DEVICE_MID);
  } finally {
    await shutdown();
  }
  assert.equal(bootstrap.createModelTelemetry().enabled, false);

  const rebuilt = await prepare(enabledEnv({ KNORVIA_HOME: home }));
  try {
    assert.equal(rebuilt.KNORVIA_TELEMETRY_DEVICE_MID, freshDeviceMid);
    assert.equal(bootstrap.createModelTelemetry().enabled, true);
    telemetry.updatePreparedTelemetryIdentity({ identityState: "anonymous" });
  } finally {
    await shutdown();
  }
  telemetry.updatePreparedTelemetryIdentity({ identityState: "authenticated" });
  await shutdown();
});

test("B28 错误消息脱敏与截断", async () => {
  const clean = sanitizer.sanitizeErrorMessage;
  assert.equal(
    clean("GET https://api.example.com/v1/users/1234567?token=abc&x=1 failed"),
    "GET https://api.example.com/v1/users/{segment} failed",
  );
  assert.equal(
    clean(
      "GET http://user:pass@api.example.com:8080/v1/items/123e4567-e89b-42d3-a456-426614174000",
    ),
    "GET http://api.example.com:8080/v1/items/{segment}",
  );
  assert.equal(clean("authorization: Bearer abc.def"), "authorization: {redacted}");
  assert.equal(clean("GET /x?api_key=secret-value&y=2"), "GET /x?api_key={redacted}&y=2");
  assert.equal(clean("password=hunter2"), "password={redacted}");
  assert.equal(clean("password={redacted}"), "password={redacted}");
  assert.equal(clean("Bearer abc123"), "Bearer {redacted}");
  assert.equal(clean("Bearer {redacted}"), "Bearer {redacted}");
  assert.equal(clean("key sk-abcdefghijklmnop end"), "key {secret} end");
  assert.equal(clean(`ghp_${"A".repeat(20)}`), "{secret}");
  assert.equal(clean("AKIAABCDEFGHIJKLMNOP"), "{secret}");
  assert.equal(clean(`AIza${"a".repeat(30)}`), "{secret}");
  assert.equal(clean("user@abcdef012345"), "{secret}");
  assert.equal(clean("mail foo@example.com now"), "mail {email} now");
  assert.equal(clean("at /Users/alice/secret/file.txt"), "at /{path}");
  assert.equal(clean("at /home/bob/x"), "at /{path}");
  assert.equal(clean("at /root/.ssh/id_rsa"), "at /{path}");
  assert.equal(clean("at /tmp/a/b"), "at /{path}");
  assert.equal(clean("at C:\\Users\\alice\\file.txt"), "at {path}");
  assert.equal(clean("a\u0000b\n\n\t c"), "a b c");
  assert.equal(clean("   "), undefined);
  assert.equal(clean(""), undefined);
  assert.equal(clean(undefined), undefined);
  assert.equal(clean("x".repeat(5_000)).length, 2_048);
  const beyondCutoff = `${"a".repeat(4_096)} sk-abcdefghijklmnop`;
  assert.equal(clean(beyondCutoff).includes("{secret}"), false);
});

test("B29 结构化错误与认领", async () => {
  const sanitize = sanitizer.sanitizeTelemetryError;
  const claim = sanitizer.claimSanitizedTelemetryError;

  assert.deepEqual(sanitize(new Error("boom")), { message: "boom", type: "Error" });
  assert.deepEqual(sanitize({ code: " E\t1 ", message: "m", name: "Named" }), {
    code: "E 1",
    message: "m",
    type: "Named",
  });
  assert.deepEqual(sanitize({ name: "bad type!", type: "also bad" }), { type: "UnknownError" });
  assert.deepEqual(sanitize({ type: "Custom_1" }), { type: "Custom_1" });
  assert.deepEqual(sanitize("text"), { type: "UnknownError" });
  assert.deepEqual(sanitize(undefined), { type: "UnknownError" });
  assert.equal(sanitize({ code: "c".repeat(200) }).code.length, 128);
  assert.deepEqual(sanitize({ message: "x".repeat(3_000) }).message.length, 2_048);

  const inner = new Error("inner");
  const middle = new Error("middle");
  middle.cause = inner;
  const outer = new Error("outer");
  outer.cause = middle;
  assert.deepEqual(sanitize(outer), {
    cause: { message: "inner", type: "Error" },
    message: "outer",
    type: "Error",
  });
  assert.deepEqual(
    sanitize({ adapterError: { message: "adapter", name: "AdapterError" }, message: "root" }),
    {
      cause: { message: "adapter", type: "AdapterError" },
      message: "root",
      type: "UnknownError",
    },
  );

  let deepest = { message: "level9", name: "E9" };
  for (let level = 8; level >= 0; level -= 1) {
    deepest = { cause: deepest, message: `level${level}`, name: `E${level}` };
  }
  assert.equal(sanitize(deepest).cause.message, "level7");

  const a = { message: "a" };
  const b = { cause: a, message: "b" };
  a.cause = b;
  assert.deepEqual(sanitize(a), {
    cause: { message: "b", type: "UnknownError" },
    message: "a",
    type: "UnknownError",
  });

  const once = new Error("once");
  assert.deepEqual(claim(once), { message: "once", type: "Error" });
  assert.equal(claim(once), undefined);
  assert.deepEqual(sanitize(once), { message: "once", type: "Error" });

  const nestedInner = new Error("nested-inner");
  const nestedOuter = new Error("nested-outer");
  nestedOuter.cause = nestedInner;
  assert.ok(claim(nestedOuter));
  assert.equal(claim(nestedInner), undefined);
  assert.equal(claim(nestedOuter), undefined);

  const sibling = new Error("sibling");
  assert.ok(claim(sibling));
  assert.deepEqual(claim("not-an-object"), { type: "UnknownError" });
  assert.deepEqual(claim("not-an-object"), { type: "UnknownError" });
});

test("B30 Provider 端点脱敏与 LRU", async () => {
  const sanitize = endpointModule.sanitizeProviderEndpoint;
  assert.equal(endpointModule.PROVIDER_ENDPOINT_SANITIZER_VERSION, "1");
  assert.deepEqual(sanitize("HTTPS://User:Pass@EXAMPLE.com:443/a/b?x=1#h"), {
    origin: "https://example.com",
    route: "/a/b",
    sanitizerVersion: "1",
  });
  assert.equal(sanitize("http://example.com:80/x").origin, "http://example.com");
  assert.equal(sanitize("http://example.com:8080/x").origin, "http://example.com:8080");
  assert.equal(sanitize("https://example.com").route, "/");
  assert.equal(sanitize("https://example.com/user@example.com").route, "/{email}");
  assert.equal(
    sanitize("https://example.com/123e4567-e89b-42d3-a456-426614174000").route,
    "/{uuid}",
  );
  assert.equal(sanitize("https://example.com/1234567").route, "/{id}");
  assert.equal(sanitize("https://example.com/0123456789abcdef").route, "/{hash}");
  assert.equal(sanitize("https://example.com/Abcdefghijklmnopqrst1").route, "/{token}");
  assert.equal(sanitize("https://example.com/a%40b.com").route, "/{email}");
  assert.equal(sanitize("https://example.com/%E0%A4%A").route, "/%E0%A4%A");
  assert.equal(sanitize(`https://example.com/${"x".repeat(200)}`).route.length, 129);
  const longPath = `https://example.com/${Array.from({ length: 20 }, () => "y".repeat(128)).join("/")}`;
  assert.equal(sanitize(longPath).route.length, 1_024);
  assert.equal(sanitize("ftp://example.com/x"), undefined);
  assert.equal(sanitize("not a url"), undefined);
  assert.equal(sanitize(`https://example.com/${"z".repeat(4_090)}`), undefined);

  const cache = new endpointModule.ProviderEndpointIdentityCache(2);
  assert.equal(cache.resolve("k", "https://a.test").origin, "https://a.test");
  assert.equal(cache.resolve("k", "https://b.test").origin, "https://b.test");
  assert.equal(cache.size, 2);
  assert.equal(cache.resolve("k", "https://a.test").origin, "https://a.test");
  assert.equal(cache.resolve("k", "https://c.test").origin, "https://c.test");
  assert.equal(cache.size, 2);
  assert.equal(cache.resolve("k", "https://b.test").origin, "https://b.test");
  assert.equal(cache.size, 2);

  const negative = new endpointModule.ProviderEndpointIdentityCache();
  assert.equal(negative.resolve("k", "not a url"), undefined);
  assert.equal(negative.resolve("k", "not a url"), undefined);
  assert.equal(negative.size, 1);
  const emptyBefore = negative.size;
  assert.equal(negative.resolve("k", "   "), undefined);
  assert.equal(negative.size, emptyBefore);
  assert.equal(negative.resolve(undefined, "https://d.test").origin, "https://d.test");
  assert.equal(negative.resolve("unknown", "https://d.test").origin, "https://d.test");
  assert.equal(negative.size, 2);
  assert.equal(negative.resolve("openai", "https://d.test").origin, "https://d.test");
  assert.equal(negative.size, 3);
});

test("B31 Status Sink 生命周期与状态映射", async () => {
  {
    const { calls, modelExecution } = createModelExecution();
    const sink = new recorderModule.ModelApiTelemetryStatusSink({ modelExecution });
    sink.publish(modelEvent("model_request_started"));
    assert.equal(sink.activeCallCount, 1);
    assert.equal(calls.length, 1);
    const target = {
      providerId: "prov-1",
      providerKind: "openai",
      providerOrigin: "https://api.example.com",
      providerRoute: "/v1/chat/completions",
      reasoning: DEFAULT_REASONING,
      requestedModel: "model-1",
    };
    assert.deepEqual(calls[0].input, {
      callCause: "initial",
      logicalCallId: "lc-1",
      operation: "agent_step",
      requested: target,
      streaming: false,
    });
    assert.deepEqual(calls[0].attempts[0].input, {
      apiOperation: "chat_completions",
      attemptCause: "initial",
      attemptNumber: 1,
      maxAttempts: 3,
      requestId: "req-1",
      target,
      transport: "http",
    });
    assert.deepEqual(calls[0].attempts[0].events, [
      ["reasoningState", "unknown"],
      ["reasoningControl", "unknown"],
    ]);
    sink.publish(modelEvent("model_request_started"));
    assert.equal(calls[0].attempts.length, 1);
    sink.publish(
      modelEvent("model_request_completed", {
        finishReason: "stop",
        providerRequestId: "pr-1",
        requestId: "req-unknown",
        usage: { inputTokens: 1 },
      }),
    );
    assert.equal(calls[0].events.length, 0);
    sink.publish(
      modelEvent("model_request_failed", {
        reason: "cancelled",
        retryable: false,
        requestId: "req-unknown",
      }),
    );
    assert.equal(calls[0].events.length, 0);
    assert.equal(sink.activeCallCount, 1);
  }

  {
    const { calls, modelExecution } = createModelExecution();
    const sink = new recorderModule.ModelApiTelemetryStatusSink({ modelExecution });
    sink.publish(
      modelEvent("model_request_started", {
        modelCall: {
          actorKind: "main",
          callCause: "continuation",
          logicalCallId: "lc-2",
          operation: "agent_step",
          previousLogicalCallId: "lc-1",
          reasoning: {
            ...DEFAULT_REASONING,
            effectiveBudgetTokens: 1_024,
            effectiveLevel: "high",
          },
        },
        transport: "sse",
      }),
    );
    assert.equal(calls[0].input.callCause, "continuation");
    assert.equal(calls[0].input.previousLogicalCallId, "lc-1");
    assert.equal(calls[0].input.streaming, true);
    assert.deepEqual(calls[0].attempts[0].events, [
      ["reasoningState", "unknown"],
      ["reasoningControl", "unknown"],
      ["reasoningLevel", "high"],
      ["reasoningBudget", 1_024],
    ]);
  }

  {
    const { calls, modelExecution } = createModelExecution();
    const sink = new recorderModule.ModelApiTelemetryStatusSink({ modelExecution });
    sink.publish(modelEvent("model_request_started"));
    sink.publish(
      modelEvent("model_request_failed", {
        errorCode: "provider_error",
        errorPhase: "connect",
        exceptionType: "ApiError",
        message: "boom",
        providerErrorCode: "P500",
        providerErrorMessage: "upstream",
        providerRequestId: "pr-1",
        reason: "server_error",
        retryAfterMs: 1_200,
        retryable: true,
        statusCode: 500,
        streamOutputCommitted: true,
      }),
    );
    assert.deepEqual(calls[0].attempts[0].events, [
      ["reasoningState", "unknown"],
      ["reasoningControl", "unknown"],
      ["httpStatusCode", 500],
      ["providerRequestId", "pr-1"],
      ["providerErrorCode", "P500"],
      ["providerErrorMessage", "upstream"],
      ["retryAfterMs", 1_200],
      ["streamOutputCommitted", true],
      [
        "failed",
        "connect",
        "provider",
        { code: "P500", message: "upstream", name: "ApiError", statusCode: 500 },
      ],
    ]);
    assert.equal(calls[0].events.length, 0);
    assert.equal(sink.activeCallCount, 1);

    sink.publish(modelEvent("model_retry_scheduled", { delayMs: 250 }));
    sink.publish(modelEvent("model_request_started", { attempt: 2, requestId: "req-2" }));
    assert.deepEqual(calls[0].attempts[1].input, {
      apiOperation: "chat_completions",
      attemptCause: "retry",
      attemptNumber: 2,
      maxAttempts: 3,
      previousRequestId: "req-1",
      requestId: "req-2",
      retryDelayMs: 250,
      target: {
        providerId: "prov-1",
        providerKind: "openai",
        providerOrigin: "https://api.example.com",
        providerRoute: "/v1/chat/completions",
        reasoning: DEFAULT_REASONING,
        requestedModel: "model-1",
      },
      transport: "http",
    });
    sink.publish(modelEvent("model_first_provider_event", { requestId: "req-2" }));
    sink.publish(modelEvent("model_first_content", { requestId: "req-2" }));
    sink.publish(modelEvent("model_first_text", { requestId: "req-2" }));
    sink.publish(modelEvent("model_stream_stalled", { idleMs: 700, requestId: "req-2" }));
    sink.publish(
      modelEvent("model_request_completed", {
        finishReason: "stop",
        providerRequestId: "pr-2",
        requestId: "req-2",
        streamOutputCommitted: true,
        usage: {
          cacheReadTokens: 4,
          cacheWriteTokens: 5,
          inputTokens: 10,
          outputTokens: 20,
          reasoningTokens: 3,
        },
      }),
    );
    assert.deepEqual(calls[0].attempts[1].events, [
      ["reasoningState", "unknown"],
      ["reasoningControl", "unknown"],
      ["firstProviderEvent"],
      ["firstContent"],
      ["firstText"],
      ["streamStalled", 700],
      ["providerRequestId", "pr-2"],
      ["finishReason", "stop"],
      ["inputTokens", 10],
      ["outputTokens", 20],
      ["reasoningTokens", 3],
      ["cacheReadTokens", 4],
      ["cacheWriteTokens", 5],
      ["streamOutputCommitted", true],
      ["completed"],
    ]);
    assert.deepEqual(calls[0].events, [["completed"]]);
    assert.equal(sink.activeCallCount, 0);
  }

  {
    const { calls, modelExecution } = createModelExecution();
    const sink = new recorderModule.ModelApiTelemetryStatusSink({ modelExecution });
    sink.publish(modelEvent("model_request_started"));
    const raw = new Error("raw failure");
    sink.publishFailure(
      modelEvent("model_request_failed", {
        errorPhase: "prepare",
        message: "limited",
        reason: "rate_limited",
        retryable: false,
        statusCode: 429,
      }),
      raw,
    );
    assert.equal(calls[0].attempts[0].events.at(-1)[2], "rate_limit");
    assert.equal(calls[0].attempts[0].events.at(-1)[1], "configuration");
    assert.equal(calls[0].attempts[0].events.at(-1)[3], raw);
    assert.deepEqual(calls[0].events.at(-1), ["failed", "attempts", "rate_limit", raw]);
    assert.equal(sink.activeCallCount, 0);

    sink.publish(modelEvent("model_request_started"));
    sink.publish(
      modelEvent("model_request_failed", {
        message: "denied",
        reason: "auth_failed",
        retryable: false,
        statusCode: 401,
      }),
    );
    assert.deepEqual(calls[1].attempts[0].events.at(-1), [
      "failed",
      "unhandled",
      "authentication",
      { code: undefined, message: "denied", name: "ModelProviderError", statusCode: 401 },
    ]);
    assert.equal(sink.activeCallCount, 0);

    sink.publish(modelEvent("model_request_started"));
    sink.publish(
      modelEvent("model_request_failed", {
        message: "stopped",
        reason: "cancelled",
        retryable: false,
      }),
    );
    assert.deepEqual(calls[2].attempts[0].events.at(-1), ["cancelled", "abort_signal"]);
    assert.deepEqual(calls[2].events, [["cancelled", "abort_signal"]]);
    assert.equal(sink.activeCallCount, 0);
  }

  {
    const routes = [
      ["https://route.test/chat/completions", "chat_completions"],
      ["https://route.test/v1/responses", "responses"],
      ["https://route.test/v1/messages", "messages"],
      ["https://route.test/v1/models/gemini:generateContent", "generate_content"],
      [undefined, "unknown"],
    ];
    for (const [baseURL, expected] of routes) {
      const { calls, modelExecution } = createModelExecution();
      const sink = new recorderModule.ModelApiTelemetryStatusSink({ modelExecution });
      sink.publish(modelEvent("model_request_started", { baseURL }));
      assert.equal(calls[0].attempts[0].input.apiOperation, expected);
    }
  }
});

test("B32 Status Sink 容量、过期与旁路", async () => {
  let now = 1_000;
  const warnings = [];
  const { calls, modelExecution } = createModelExecution();
  const sink = new recorderModule.ModelApiTelemetryStatusSink({
    maxActiveCalls: 2,
    modelExecution,
    now: () => now,
    onWarning: (message, context) => warnings.push({ context, message }),
  });
  sink.publish(
    modelEvent("model_request_started", {
      modelCall: {
        actorKind: "main",
        logicalCallId: "lc-a",
        operation: "agent_step",
        reasoning: DEFAULT_REASONING,
      },
      sessionId: "sess-a",
    }),
  );
  now += 1;
  sink.publish(
    modelEvent("model_request_started", {
      modelCall: {
        actorKind: "main",
        logicalCallId: "lc-b",
        operation: "agent_step",
        reasoning: DEFAULT_REASONING,
      },
      sessionId: "sess-b",
    }),
  );
  now += 1;
  sink.publish(
    modelEvent("model_request_started", {
      modelCall: {
        actorKind: "main",
        logicalCallId: "lc-c",
        operation: "agent_step",
        reasoning: DEFAULT_REASONING,
      },
      sessionId: "sess-a",
    }),
  );
  assert.equal(sink.activeCallCount, 2);
  assert.deepEqual(calls[0].events, [["abandoned", "missing_terminal"]]);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].message, "Model telemetry active call capacity was reached");
  assert.deepEqual(warnings[0].context, {
    abandonedCount: 1,
    maxActiveCalls: 2,
  });

  now += 1;
  sink.publish(
    modelEvent("model_request_started", {
      modelCall: {
        actorKind: "main",
        logicalCallId: "lc-d",
        operation: "agent_step",
        reasoning: DEFAULT_REASONING,
      },
      sessionId: "sess-b",
    }),
  );
  assert.equal(warnings.length, 1);
  assert.deepEqual(calls[1].events, [["abandoned", "missing_terminal"]]);

  sink.abandonSession("sess-a");
  assert.deepEqual(calls[2].events, [["abandoned", "session_shutdown"]]);
  assert.equal(sink.activeCallCount, 1);
  sink.shutdown();
  assert.deepEqual(calls[3].events, [["abandoned", "process_shutdown"]]);
  assert.equal(sink.activeCallCount, 0);
  sink.shutdown();

  let expiryNow = 0;
  const expiryWarnings = [];
  const expiring = createModelExecution();
  const expirySink = new recorderModule.ModelApiTelemetryStatusSink({
    maxActiveCallAgeMs: 1_000,
    modelExecution: expiring.modelExecution,
    now: () => expiryNow,
    onWarning: (message, context) => expiryWarnings.push({ context, message }),
  });
  expirySink.publish(modelEvent("model_request_started"));
  expiryNow = 500;
  expirySink.publish(modelEvent("model_retry_scheduled", { delayMs: 50 }));
  expiryNow = 1_001;
  expirySink.publish(modelEvent("model_retry_scheduled", { delayMs: 50 }));
  assert.equal(expirySink.activeCallCount, 1);
  expiryNow = 2_001;
  expirySink.publish(modelEvent("model_request_queued"));
  assert.equal(expirySink.activeCallCount, 0);
  assert.deepEqual(expiring.calls[0].events, [["abandoned", "missing_terminal"]]);
  assert.equal(expiryWarnings.length, 1);
  assert.equal(expiryWarnings[0].message, "Expired model telemetry calls were abandoned");
  assert.deepEqual(expiryWarnings[0].context, {
    abandonedCount: 1,
    maxActiveCallAgeMs: 1_000,
  });

  const throwing = createModelExecution();
  const throwingSink = new recorderModule.ModelApiTelemetryStatusSink({
    maxActiveCalls: 1,
    modelExecution: throwing.modelExecution,
    now: () => 0,
    onWarning: () => {
      throw new Error("warning boom");
    },
  });
  throwingSink.publish(
    modelEvent("model_request_started", {
      modelCall: {
        actorKind: "main",
        logicalCallId: "lc-one",
        operation: "agent_step",
        reasoning: DEFAULT_REASONING,
      },
    }),
  );
  assert.doesNotThrow(() =>
    throwingSink.publish(
      modelEvent("model_request_started", {
        modelCall: {
          actorKind: "main",
          logicalCallId: "lc-two",
          operation: "agent_step",
          reasoning: DEFAULT_REASONING,
        },
      }),
    ),
  );
  assert.equal(throwingSink.activeCallCount, 1);
});

test("B33 Runtime 创建、容量与错误分类", async () => {
  {
    const tracer = createTracer();
    const metrics = createMetricsRecorder();
    const warnings = [];
    const runtime = new runtimeModule.AgentExecutionTelemetryRuntime({
      maxActiveWriters: 1,
      metrics,
      onWarning: (message, context) => warnings.push({ context, message }),
      tracer,
    });
    const turn = runtime.startTurn({
      context: {
        actorKind: "main",
        agentName: "knorvia",
        queryId: "q-1",
        sessionId: "sess-1",
        turnId: "turn-1",
      },
      inputSource: "user",
      turnNumber: 2,
    });
    const turnSpan = tracer.spans[0].record;
    assert.equal(turnSpan.name, "agent_turn");
    assert.equal(tracer.spans[0].parentContext, otelApi.ROOT_CONTEXT);
    assert.equal(turnSpan.attributes["knorvia.agent_turn.turn_number"], 2);
    assert.equal(turnSpan.attributes["knorvia.agent_turn.input_source"], "user");
    assert.equal(turnSpan.attributes["knorvia.execution.session_id"], "sess-1");
    assert.equal(turnSpan.attributes["knorvia.execution.turn_id"], "turn-1");
    assert.equal(turnSpan.attributes["knorvia.execution.query_id"], "q-1");
    assert.equal(turnSpan.attributes["knorvia.execution.actor_kind"], "main");
    assert.equal(turnSpan.attributes["knorvia.execution.agent_name"], "knorvia");
    assert.equal(turnSpan.attributes["knorvia.execution.identity_state"], "unknown");

    let causation;
    const value = turn.run(() => {
      causation = runtime.captureCausation();
      const step = runtime.startStep({ stepId: "step-1", stepIndex: 3 });
      assert.equal(
        step.run(() => 7),
        7,
      );
      assert.equal(step.captureCausation(), undefined);
      const stepWhileFull = runtime.startStep({ stepId: "step-2", stepIndex: 4 });
      stepWhileFull.finishCompleted("tool_requested");
      turn.finishCompleted("assistant_message");
      return 7;
    });
    assert.equal(value, 7);
    assert.equal(causation.spanId, turnSpan.spanId);
    assert.equal(causation.traceId, VALID_TRACE_ID);
    assert.equal(causation.sessionId, "sess-1");
    assert.equal(causation.turnId, "turn-1");
    assert.equal(tracer.spans.length, 1);
    assert.deepEqual(metrics.events[0], ["creationDrop", "agent_step", "process_capacity"]);
    assert.deepEqual(warnings[0], {
      context: { activeWriterCount: 1, maxActiveWriters: 1, spanName: "agent_step" },
      message: "Telemetry active writer capacity was reached",
    });
    assert.equal(warnings.length, 1);
    assert.equal(turnSpan.endCount, 1);
    assert.equal(turnSpan.attributes["knorvia.agent_turn.outcome"], "completed");
    assert.equal(turnSpan.attributes["knorvia.agent_turn.result_type"], "assistant_message");
    assert.equal(turnSpan.status.code, otelApi.SpanStatusCode.OK);
    const terminalEvent = metrics.events.find(([kind]) => kind === "terminal");
    assert.equal(terminalEvent[1], "agent_turn");
    assert.equal(terminalEvent[2], "completed");
    assert.equal(typeof terminalEvent[3], "number");
    assert.deepEqual(terminalEvent[4], { actor_kind: "main", input_source: "user" });
    assert.equal(terminalEvent[5], undefined);

    const created = runtime.startTurn({
      context: { actorKind: "main", sessionId: "sess-2", turnId: "turn-2" },
      inputSource: "user",
      turnNumber: 3,
    });
    const createdSpan = tracer.spans.at(-1).record;
    assert.equal(tracer.spans.length, 2);
    created.finishCompleted();
    assert.equal(createdSpan.endCount, 1);
  }

  {
    const tracer = createTracer();
    const metrics = createMetricsRecorder();
    const warnings = [];
    const runtime = new runtimeModule.AgentExecutionTelemetryRuntime({
      maxActiveWriters: 1,
      metrics,
      onWarning: (message, context) => warnings.push({ context, message }),
      tracer,
    });
    runtime.startTurn({ context: {}, inputSource: "user", turnNumber: 1 });
    runtime.startTurn({ context: {}, inputSource: "user", turnNumber: 2 });
    runtime.startTurn({ context: {}, inputSource: "user", turnNumber: 3 });
    const capacityWarnings = warnings.filter(
      ({ message }) => message === "Telemetry active writer capacity was reached",
    );
    assert.equal(capacityWarnings.length, 1);
    assert.equal(capacityWarnings[0].context.spanName, "agent_turn");
  }

  {
    const tracer = createTracer({ failOnName: "tool_execution" });
    const metrics = createMetricsRecorder();
    const warnings = [];
    const runtime = new runtimeModule.AgentExecutionTelemetryRuntime({
      metrics,
      onWarning: (message, context) => warnings.push({ context, message }),
      tracer,
    });
    const tool = runtime.startTool({ registeredToolName: "bash", toolCallId: "tc-1" });
    assert.equal(tracer.spans.length, 0);
    assert.deepEqual(metrics.events[0], ["creationDrop", "tool_execution", "unknown"]);
    assert.deepEqual(warnings[0], {
      context: { errorType: "Error", spanName: "tool_execution" },
      message: "Telemetry writer creation failed",
    });
    assert.equal(tool.captureCausation(), undefined);
    assert.equal(
      tool.run(() => "noop"),
      "noop",
    );
    tool.finishFailed("handler", "unknown");
  }

  {
    const tracer = createTracer();
    const metrics = createMetricsRecorder({ failCreationDrop: true });
    const warnings = [];
    const runtime = new runtimeModule.AgentExecutionTelemetryRuntime({
      maxActiveWriters: 1,
      metrics,
      onWarning: (message, context) => warnings.push({ context, message }),
      tracer,
    });
    runtime.startTurn({ context: {}, inputSource: "user", turnNumber: 1 });
    assert.doesNotThrow(() => runtime.startStep({ stepId: "s", stepIndex: 0 }));
    assert.deepEqual(
      warnings.map(({ message }) => message),
      ["Telemetry metric operation failed", "Telemetry active writer capacity was reached"],
    );
    assert.deepEqual(warnings[0].context, { errorType: "Error" });
  }

  {
    const tracer = createTracer();
    const metrics = createMetricsRecorder();
    const runtime = new runtimeModule.AgentExecutionTelemetryRuntime({
      identity: { identityState: "anonymous", userSubjectId: "user-1" },
      metrics,
      tracer,
    });
    const turn = runtime.startTurn({
      context: { actorKind: "subagent", sessionId: "sess-a", turnId: "turn-a" },
      inputSource: "user",
      turnNumber: 1,
    });
    const step = turn.run(() => runtime.startStep({ stepId: "st", stepIndex: 1 }));
    const stepSpan = tracer.spans[1].record;
    const stepCausation = step.run(() => runtime.captureCausation());
    assert.equal(stepCausation.spanId, stepSpan.spanId);
    assert.equal(stepCausation.sessionId, "sess-a");
    assert.equal(stepCausation.turnId, "turn-a");
    assert.equal(stepSpan.attributes["knorvia.execution.turn_id"], "turn-a");
    assert.equal(stepSpan.attributes["knorvia.execution.session_id"], undefined);
    assert.equal(stepSpan.attributes["knorvia.agent_step.step_id"], "st");
    assert.equal(stepSpan.attributes["knorvia.agent_step.step_index"], 1);
    assert.equal(tracer.spans[0].record.attributes["knorvia.execution.user_subject_id"], "user-1");

    runtime.updateIdentity({ identityState: "authenticated", userSubjectId: "bad id!" });
    const next = runtime.startTurn({
      context: { sessionId: "sess-b", turnId: "turn-b" },
      inputSource: "user",
      turnNumber: 2,
    });
    const nextSpan = tracer.spans.at(-1).record;
    assert.equal(nextSpan.attributes["knorvia.execution.identity_state"], "authenticated");
    assert.equal(nextSpan.attributes["knorvia.execution.user_subject_id"], undefined);
    next.finishCompleted();

    const sessionA = runtime.startTurn({
      context: { sessionId: "sess-a" },
      inputSource: "user",
      turnNumber: 3,
    });
    const sessionB = runtime.startTurn({
      context: { sessionId: "sess-b" },
      inputSource: "user",
      turnNumber: 4,
    });
    const spanA = tracer.spans.at(-2).record;
    const spanB = tracer.spans.at(-1).record;
    runtime.abandonSession("sess-a");
    assert.equal(spanA.endCount, 1);
    assert.equal(spanA.attributes["knorvia.agent_turn.outcome"], "abandoned");
    assert.equal(spanA.attributes["knorvia.agent_turn.abandon_reason"], "session_shutdown");
    assert.equal(spanB.endCount, 0);
    runtime.abandonProcess();
    assert.equal(spanB.attributes["knorvia.agent_turn.abandon_reason"], "process_shutdown");
    runtime.abandonProcess();
    assert.equal(spanB.endCount, 1);
    sessionA.finishCompleted();
    sessionB.finishCompleted();

    const compaction = runtime.startCompaction({});
    assert.equal(tracer.spans.at(-1).record.name, "context_compaction");
    compaction.finishCompleted();
    const detached = runtime.startDetachedOperation({});
    assert.equal(tracer.spans.at(-1).record.name, "detached_operation");
    detached.finishCompleted();
    turn.finishCompleted("other");
    step.finishCompleted("model_completed");
  }
});

test("B34 Writer run 上下文与终结", async () => {
  const makeRuntime = (options = {}) => {
    const tracer = createTracer();
    const warnings = [];
    const runtime = new runtimeModule.AgentExecutionTelemetryRuntime({
      onWarning: (message, context) => warnings.push({ context, message }),
      tracer,
      ...options,
    });
    return { runtime, tracer, warnings };
  };

  {
    const { runtime, tracer } = makeRuntime();
    const turn = runtime.startTurn({ context: { sessionId: "s", turnId: "t" }, turnNumber: 1 });
    let calls = 0;
    const value = turn.run(() => {
      calls += 1;
      return 42;
    });
    assert.equal(value, 42);
    assert.equal(calls, 1);
    const span = tracer.spans[0].record;
    assert.equal(span.attributes["knorvia.agent_turn.outcome"], "abandoned");
    assert.equal(span.attributes["knorvia.agent_turn.abandon_reason"], "missing_terminal");
    assert.equal(span.endCount, 1);
    turn.finishCompleted();
    assert.equal(span.endCount, 1);
  }

  {
    const { runtime, tracer } = makeRuntime();
    const turn = runtime.startTurn({ context: {}, turnNumber: 1 });
    turn.run(() => turn.finishCompleted("tool_request"));
    const span = tracer.spans[0].record;
    assert.equal(span.attributes["knorvia.agent_turn.outcome"], "completed");
    assert.equal(span.attributes["knorvia.agent_turn.result_type"], "tool_request");
    turn.finishFailed("setup", "unknown");
    assert.equal(span.attributes["knorvia.agent_turn.failure_stage"], undefined);
    assert.equal(span.endCount, 1);
  }

  {
    const { runtime, tracer } = makeRuntime();
    const unresolved = runtime.startTurn({ context: {}, turnNumber: 1 });
    assert.equal(await unresolved.run(async () => "async-value"), "async-value");
    assert.equal(
      tracer.spans[0].record.attributes["knorvia.agent_turn.abandon_reason"],
      "missing_terminal",
    );
    const resolved = runtime.startTurn({ context: {}, turnNumber: 2 });
    assert.equal(
      await resolved.run(async () => {
        await Promise.resolve();
        resolved.finishCompleted();
        return 2;
      }),
      2,
    );
    assert.equal(tracer.spans[1].record.attributes["knorvia.agent_turn.outcome"], "completed");
  }

  {
    const { runtime, tracer } = makeRuntime();
    const turn = runtime.startTurn({ context: {}, turnNumber: 1 });
    const boom = new Error("boom");
    assert.throws(
      () =>
        turn.run(() => {
          throw boom;
        }),
      (error) => error === boom,
    );
    const span = tracer.spans[0].record;
    assert.equal(span.attributes["knorvia.agent_turn.outcome"], "failed");
    assert.equal(span.attributes["knorvia.agent_turn.failure_stage"], "unhandled");
    assert.equal(span.attributes["knorvia.agent_turn.error_category"], "unknown");
    assert.equal(span.attributes["error.type"], "Error");
    assert.equal(span.attributes["error.message"], "boom");
    assert.equal(span.status.code, otelApi.SpanStatusCode.ERROR);
    assert.equal(span.endCount, 1);
  }

  {
    const { runtime, tracer } = makeRuntime();
    const abort = new Error("aborted");
    abort.name = "AbortError";
    const turn = runtime.startTurn({ context: {}, turnNumber: 1 });
    assert.throws(() =>
      turn.run(() => {
        throw abort;
      }),
    );
    const span = tracer.spans[0].record;
    assert.equal(span.attributes["knorvia.agent_turn.outcome"], "cancelled");
    assert.equal(span.attributes["knorvia.agent_turn.cancel_reason"], "abort_signal");

    const coded = new Error("coded");
    coded.code = "ABORT_ERR";
    const second = runtime.startTurn({ context: {}, turnNumber: 2 });
    assert.throws(() =>
      second.run(() => {
        throw coded;
      }),
    );
    assert.equal(
      tracer.spans[1].record.attributes["knorvia.agent_turn.cancel_reason"],
      "abort_signal",
    );

    const rejection = runtime.startTurn({ context: {}, turnNumber: 3 });
    await assert.rejects(
      rejection.run(async () => Promise.reject(new Error("rejected"))),
      /rejected/u,
    );
    assert.equal(tracer.spans[2].record.attributes["knorvia.agent_turn.outcome"], "failed");
  }

  {
    const categories = [
      [{ status: 401 }, "authentication"],
      [{ statusCode: 403 }, "authentication"],
      [{ status: 408 }, "timeout"],
      [{ status: 504 }, "timeout"],
      [{ status: 429 }, "rate_limit"],
      [{ code: "request_timeout" }, "timeout"],
      [{ code: "network_down" }, "network"],
      [{ code: "ECONNREFUSED" }, "network"],
      [{ code: "ENOTFOUND" }, "network"],
      [{ code: "tls_handshake" }, "network"],
      [{ code: "other" }, "unknown"],
    ];
    for (const [error, expected] of categories) {
      const { runtime, tracer } = makeRuntime();
      const turn = runtime.startTurn({ context: {}, turnNumber: 1 });
      assert.throws(() =>
        turn.run(() => {
          throw error;
        }),
      );
      assert.equal(
        tracer.spans[0].record.attributes["knorvia.agent_turn.error_category"],
        expected,
      );
    }
  }

  {
    const { runtime, tracer } = makeRuntime();
    const turn = runtime.startTurn({ context: {}, turnNumber: 1 });
    const tool = runtime.startTool({ registeredToolName: "bash", toolCallId: "tc" });
    const shared = new Error("shared failure");
    assert.throws(
      () =>
        turn.run(() =>
          tool.run(() => {
            throw shared;
          }),
        ),
      (error) => error === shared,
    );
    const toolSpan = tracer.spans[1].record;
    const turnSpan = tracer.spans[0].record;
    assert.equal(toolSpan.attributes["error.message"], "shared failure");
    assert.equal(turnSpan.attributes["knorvia.agent_turn.outcome"], "failed");
    assert.equal(turnSpan.attributes["knorvia.agent_turn.error_category"], "unknown");
    assert.equal(turnSpan.attributes["error.message"], undefined);
    assert.equal(turnSpan.attributes["error.type"], undefined);
  }

  {
    const { runtime, tracer, warnings } = makeRuntime();
    contextMode = "activate-fail";
    let calls = 0;
    try {
      const turn = runtime.startTurn({ context: {}, turnNumber: 1 });
      assert.equal(
        turn.run(() => {
          calls += 1;
          return 5;
        }),
        5,
      );
    } finally {
      contextMode = "normal";
    }
    assert.equal(calls, 1);
    assert.deepEqual(warnings.at(-1), {
      context: { errorType: "Error", spanName: "agent_turn" },
      message: "Telemetry context activation failed",
    });
    assert.equal(
      tracer.spans[0].record.attributes["knorvia.agent_turn.abandon_reason"],
      "missing_terminal",
    );
  }

  {
    const { runtime, tracer, warnings } = makeRuntime();
    contextMode = "teardown-fail";
    let calls = 0;
    try {
      const turn = runtime.startTurn({ context: {}, turnNumber: 1 });
      assert.equal(
        turn.run(() => {
          calls += 1;
          return 6;
        }),
        6,
      );
    } finally {
      contextMode = "normal";
    }
    assert.equal(calls, 1);
    assert.deepEqual(warnings.at(-1), {
      context: { errorType: "Error", spanName: "agent_turn" },
      message: "Telemetry context teardown failed",
    });
    assert.equal(
      tracer.spans[0].record.attributes["knorvia.agent_turn.abandon_reason"],
      "missing_terminal",
    );
  }

  {
    const compacted = support.compactAttributes({
      arrBooleans: [true, false],
      arrMixed: [1, "a"],
      arrNumbers: [1, 2],
      arrStrings: ["a", "b"],
      bool: true,
      control: "a\u0000\n b",
      inf: Infinity,
      long: "x".repeat(1_100),
      nan: Number.NaN,
      nil: null,
      num: 2.5,
      object: {},
    });
    assert.deepEqual(compacted, {
      arrBooleans: [true, false],
      arrNumbers: [1, 2],
      arrStrings: ["a", "b"],
      bool: true,
      control: "a b",
      long: "x".repeat(1_024),
      num: 2.5,
    });

    const { runtime, tracer } = makeRuntime();
    const tool = runtime.startTool({ registeredToolName: "  ba\nsh  ", toolCallId: "tc-2" });
    const span = tracer.spans[0].record;
    assert.equal(span.attributes["knorvia.tool_execution.tool_name"], "ba sh");
    assert.equal(span.attributes["gen_ai.tool.call.id"], "tc-2");
    tool.markPermissionRequested();
    tool.markPermissionRequested();
    tool.setPermissionDecision("granted");
    tool.setOutputBytes(12);
    tool.setOutputBytes(-1);
    tool.setOutputTruncated(true);
    assert.deepEqual(span.addEventCalls, ["permission_requested", "permission_decided"]);
    assert.equal(span.attributes["knorvia.tool_execution.output_bytes"], 12);
    assert.equal(span.attributes["knorvia.tool_execution.output_truncated"], true);
    const command = tool.startCommand({ category: "test", safeName: "pnpm test" });
    command.markFirstOutput();
    command.markFirstOutput();
    command.setExitCode(0);
    command.setSignal("SIGTERM");
    command.setTimedOut(true);
    assert.deepEqual(tracer.spans.at(-1).record.addEventCalls, ["first_output"]);
    assert.equal(tracer.spans.at(-1).record.attributes["process.exit.code"], 0);
    command.finishCompleted();
    tool.finishCompleted();
  }
});

function createFakeMeter() {
  const instruments = [];
  const make = (kind) => (name, options) => {
    const records = [];
    const instrument = { kind, name, options, records };
    instruments.push(instrument);
    return {
      add(value, attributes) {
        records.push({ attributes, value });
      },
      record(value, attributes) {
        records.push({ attributes, value });
      },
    };
  };
  return {
    createCounter: make("counter"),
    createHistogram: make("histogram"),
    instruments,
  };
}

test("B35 指标口径与兼容属性", async () => {
  const meter = createFakeMeter();
  const metrics = new metricsModule.OtelAgentTelemetryMetrics(meter);
  assert.deepEqual(meter.instruments.map(({ name }) => name).sort(), [
    "knorvia.agent.step.duration",
    "knorvia.agent.turn.duration",
    "knorvia.command.execution.duration",
    "knorvia.command.execution.time_to_first_output",
    "knorvia.context.compaction.duration",
    "knorvia.detached.operation.duration",
    "knorvia.model.attempt.duration",
    "knorvia.model.attempt.stream_max_idle",
    "knorvia.model.attempt.stream_stall.count",
    "knorvia.model.attempt.time_to_first_content",
    "knorvia.model.attempt.time_to_first_provider_event",
    "knorvia.model.attempt.time_to_first_text",
    "knorvia.model.attempt.tokens",
    "knorvia.model.call.attempts",
    "knorvia.model.call.duration",
    "knorvia.telemetry.abandoned.count",
    "knorvia.telemetry.creation_drop.count",
    "knorvia.tool.execution.duration",
  ]);
  const byName = new Map(meter.instruments.map((instrument) => [instrument.name, instrument]));
  for (const name of [
    "knorvia.agent.turn.duration",
    "knorvia.agent.step.duration",
    "knorvia.tool.execution.duration",
    "knorvia.command.execution.duration",
    "knorvia.context.compaction.duration",
    "knorvia.detached.operation.duration",
    "knorvia.model.call.duration",
    "knorvia.model.attempt.duration",
    "knorvia.model.attempt.time_to_first_provider_event",
    "knorvia.model.attempt.time_to_first_content",
    "knorvia.model.attempt.time_to_first_text",
    "knorvia.model.attempt.stream_max_idle",
    "knorvia.command.execution.time_to_first_output",
  ]) {
    assert.equal(byName.get(name).options.unit, "s");
  }
  assert.equal(byName.get("knorvia.model.call.attempts").options.unit, "{attempt}");
  assert.equal(byName.get("knorvia.model.attempt.tokens").options.unit, "{token}");
  assert.equal(byName.get("knorvia.model.attempt.stream_stall.count").options.unit, "{stall}");
  assert.equal(byName.get("knorvia.telemetry.creation_drop.count").options.unit, "{span}");
  assert.equal(byName.get("knorvia.telemetry.abandoned.count").options.unit, "{span}");

  metrics.recordSpanTerminal("agent_turn", "completed", 1_500, {
    "knorvia.execution.session_id": "sess-1",
    actor_kind: "main",
    error_category: "timeout",
    input_source: "user",
    launch_surface: "standalone_cli",
    outcome: "bogus",
  });
  const turnRecord = byName.get("knorvia.agent.turn.duration").records.at(-1);
  assert.equal(turnRecord.value, 1.5);
  assert.deepEqual(turnRecord.attributes, {
    actor_kind: "main",
    error_category: "timeout",
    input_source: "user",
    launch_surface: "standalone_cli",
    outcome: "completed",
  });

  metrics.recordSpanTerminal(
    "tool_execution",
    "abandoned",
    20,
    { outcome: "abandoned", tool_name: "bash" },
    "missing_terminal",
  );
  assert.equal(byName.get("knorvia.tool.execution.duration").records.at(-1).value, 0.02);
  assert.deepEqual(byName.get("knorvia.telemetry.abandoned.count").records.at(-1), {
    attributes: { abandon_reason: "missing_terminal", span_name: "tool_execution" },
    value: 1,
  });
  const abandonedCount = byName.get("knorvia.telemetry.abandoned.count").records.length;
  metrics.recordSpanTerminal("tool_execution", "completed", 10, { tool_name: "bash" });
  assert.equal(byName.get("knorvia.telemetry.abandoned.count").records.length, abandonedCount);

  metrics.recordCreationDrop("agent_step", "process_capacity");
  assert.deepEqual(byName.get("knorvia.telemetry.creation_drop.count").records.at(-1), {
    attributes: { drop_reason: "process_capacity", span_name: "agent_step" },
    value: 1,
  });

  metrics.recordModelCallAttempts(3, {
    call_cause: "initial",
    error_category: "unknown",
    model: "gpt-4o",
    model_operation: "agent_step",
    model_role: "main",
    outcome: "completed",
    retry_state: "not_needed",
  });
  assert.deepEqual(byName.get("knorvia.model.call.attempts").records.at(-1), {
    attributes: {
      call_cause: "initial",
      error_category: "unknown",
      model_operation: "agent_step",
      model_role: "main",
      outcome: "completed",
      retry_state: "not_needed",
    },
    value: 3,
  });

  const tokenCount = byName.get("knorvia.model.attempt.tokens").records.length;
  metrics.recordModelTokenDelta("input", 0, {});
  metrics.recordModelTokenDelta("input", Number.NaN, {});
  metrics.recordModelTokenDelta("input", Number.POSITIVE_INFINITY, {});
  metrics.recordModelTokenDelta("input", -1, {});
  assert.equal(byName.get("knorvia.model.attempt.tokens").records.length, tokenCount);
  metrics.recordModelTokenDelta("input", 7, {
    "knorvia.execution.session_id": "sess",
    model: "gpt-4o",
    model_operation: "agent_step",
    model_role: "main",
    provider_kind: "openai",
    transport: "http",
  });
  assert.deepEqual(byName.get("knorvia.model.attempt.tokens").records.at(-1), {
    attributes: {
      model: "gpt-4o",
      model_operation: "agent_step",
      model_role: "main",
      provider_kind: "openai",
      token_type: "input",
      transport: "http",
    },
    value: 7,
  });

  metrics.recordModelAttemptDetail(
    {
      model: "gpt-4o",
      model_operation: "agent_step",
      model_role: "main",
      outcome: "completed",
      provider_kind: "openai",
      forbidden: "x",
      transport: "http",
    },
    {
      firstProviderEventMs: 250,
      firstTextMs: 1_000,
      stallCount: 0,
      streamMaxIdleMs: 5_000,
    },
  );
  assert.equal(
    byName.get("knorvia.model.attempt.time_to_first_provider_event").records.at(-1).value,
    0.25,
  );
  assert.equal(byName.get("knorvia.model.attempt.time_to_first_content").records.length, 0);
  assert.equal(byName.get("knorvia.model.attempt.time_to_first_text").records.at(-1).value, 1);
  assert.equal(byName.get("knorvia.model.attempt.stream_stall.count").records.length, 0);
  assert.equal(byName.get("knorvia.model.attempt.stream_max_idle").records.length, 0);

  metrics.recordModelAttemptDetail(
    { model: "gpt-4o", model_operation: "agent_step", model_role: "main", transport: "http" },
    { stallCount: 2, streamMaxIdleMs: 3_000 },
  );
  assert.deepEqual(byName.get("knorvia.model.attempt.stream_stall.count").records.at(-1), {
    attributes: {
      model: "gpt-4o",
      model_operation: "agent_step",
      model_role: "main",
      transport: "http",
    },
    value: 2,
  });
  assert.equal(byName.get("knorvia.model.attempt.stream_max_idle").records.at(-1).value, 3);

  metrics.recordCommandFirstOutput(500, {
    command_category: "test",
    command_safe_name: "pnpm test",
    error_category: "unknown",
    outcome: "completed",
    tool_name: "bash",
  });
  assert.deepEqual(byName.get("knorvia.command.execution.time_to_first_output").records.at(-1), {
    attributes: {
      command_category: "test",
      command_safe_name: "pnpm test",
      error_category: "unknown",
      outcome: "completed",
    },
    value: 0.5,
  });

  for (const method of Object.values(metricsModule.NOOP_AGENT_TELEMETRY_METRICS)) {
    method();
  }

  assert.deepEqual(compat.toolCompatibilityAttributes({ toolCallId: "tc-1", toolName: "bash" }), {
    "gen_ai.operation.name": "execute_tool",
    "gen_ai.tool.call.id": "tc-1",
    "gen_ai.tool.name": "bash",
  });
  assert.deepEqual(
    compat.toolCompatibilityAttributes({ toolCallId: "bad id", toolName: "b".repeat(200) }),
    {
      "gen_ai.operation.name": "execute_tool",
      "gen_ai.tool.name": "b".repeat(128),
    },
  );

  assert.deepEqual(compat.commandCompatibilityAttributes({ exitCode: 0, signal: "SIGTERM" }), {
    "process.exit.code": 0,
    "process.signal.name": "SIGTERM",
  });
  assert.deepEqual(
    compat.commandCompatibilityAttributes({ exitCode: 1.5, signal: "bad signal" }),
    {},
  );

  assert.deepEqual(
    compat.modelAttemptCompatibilityAttributes({
      providerKind: "OpenAI",
      providerOrigin: "https://api.example.com:443",
      reasoning: DEFAULT_REASONING,
      requestedModel: "gpt-4o",
    }),
    {
      "gen_ai.provider.name": "openai",
      "gen_ai.request.model": "gpt-4o",
      "server.address": "api.example.com",
      "server.port": 443,
    },
  );
  assert.deepEqual(
    compat.modelAttemptCompatibilityAttributes({
      providerKind: "openai",
      providerOrigin: "http://localhost",
      reasoning: DEFAULT_REASONING,
      requestedModel: "gpt-4o",
    }),
    {
      "gen_ai.provider.name": "openai",
      "gen_ai.request.model": "gpt-4o",
      "server.address": "localhost",
      "server.port": 80,
    },
  );
  assert.deepEqual(
    compat.modelAttemptCompatibilityAttributes({
      providerKind: "",
      providerOrigin: "not a url",
      reasoning: DEFAULT_REASONING,
      requestedModel: "",
    }),
    {},
  );

  assert.deepEqual(
    compat.modelResponseCompatibilityAttributes({
      finishReason: "stop",
      inputTokens: 10,
      outputTokens: 20,
      responseModel: "gpt-4o-2024",
    }),
    {
      "gen_ai.response.finish_reasons": ["stop"],
      "gen_ai.response.model": "gpt-4o-2024",
      "gen_ai.usage.input_tokens": 10,
      "gen_ai.usage.output_tokens": 20,
    },
  );
  assert.deepEqual(
    compat.modelResponseCompatibilityAttributes({ inputTokens: 1.5, outputTokens: Number.NaN }),
    {},
  );
  assert.deepEqual(compat.httpResponseCompatibilityAttributes(200), {
    "http.response.status_code": 200,
  });
  assert.deepEqual(compat.httpResponseCompatibilityAttributes(200.5), {});
});

test("B36 OTel Runtime 懒加载与资源属性", async () => {
  const traceExporterModule = await import(
    pathToFileURL(requireFromTelemetry.resolve("@opentelemetry/exporter-trace-otlp-proto")).href
  );
  const metricExporterModule = await import(
    pathToFileURL(requireFromTelemetry.resolve("@opentelemetry/exporter-metrics-otlp-proto")).href
  );
  const TraceExporter = traceExporterModule.OTLPTraceExporter;
  const MetricExporter = metricExporterModule.OTLPMetricExporter;
  const originalTraceExport = TraceExporter.prototype.export;
  const originalMetricExport = MetricExporter.prototype.export;
  const traceSpans = [];
  const metricSets = [];
  TraceExporter.prototype.export = function exportSpans(spans, callback) {
    traceSpans.push(...spans);
    callback({ code: 0 });
  };
  MetricExporter.prototype.export = function exportMetrics(metrics, callback) {
    metricSets.push(metrics);
    callback({ code: 0 });
  };

  const owner = exporterModule.createOwnedAgentTelemetryRuntime({
    endpoint: "http://127.0.0.1:4318/v1/traces",
    headers: { "x-test": "1" },
    identity: { identityState: "anonymous", userSubjectId: "user-1" },
    metricEndpoint: "http://127.0.0.1:4318/v1/metrics",
    resource: {
      buildCommitId: "abcdef12",
      cliVersion: "1.2.3",
      deploymentEnvironment: "ci",
      installationId: "install-1",
      productVersion: "9.9.9",
      runtimeDistribution: "source",
      runtimeSurface: "standalone_cli",
      serviceInstanceId: "svc-inst-1",
      serviceName: "cli-agent",
    },
    timeoutMs: 1_000,
    traceSampleRatio: 1,
  });

  try {
    assert.equal(owner.enabled, true);
    assert.equal(owner.agentExecution, owner.modelExecution);
    assert.ok(owner.statusSink instanceof telemetry.ModelApiTelemetryStatusSink);
    assert.equal(typeof owner.abandonSession, "function");
    assert.equal(typeof owner.flush, "function");
    assert.equal(typeof owner.shutdown, "function");
    assert.equal(typeof owner.updateIdentity, "function");

    const turn = owner.agentExecution.startTurn({
      context: { actorKind: "main", sessionId: "sess-1", turnId: "turn-1" },
      inputSource: "user",
      turnNumber: 1,
    });
    turn.finishCompleted("assistant_message");
    owner.updateIdentity({ identityState: "authenticated", userSubjectId: "user-2" });
    const identified = owner.agentExecution.startTurn({
      context: { actorKind: "main", sessionId: "sess-1", turnId: "turn-2" },
      inputSource: "user",
      turnNumber: 2,
    });
    identified.finishCompleted("assistant_message");

    owner.statusSink.publish(
      modelEvent("model_request_started", {
        sessionId: "sess-abandon",
        transport: "http",
      }),
    );
    owner.abandonSession("sess-abandon");

    await owner.flush({ timeoutMs: 2_000 });
    const exportedTurn = traceSpans.find((span) => span.name === "agent_turn");
    assert.ok(exportedTurn);
    assert.equal(exportedTurn.attributes["knorvia.agent_turn.outcome"], "completed");
    assert.ok(traceSpans.some((span) => span.name === "model_call"));
    assert.ok(traceSpans.some((span) => span.name === "model_attempt"));
    const abandonedModelCall = traceSpans.find(
      (span) =>
        span.name === "model_call" &&
        span.attributes["knorvia.model_call.abandon_reason"] === "session_shutdown",
    );
    assert.ok(abandonedModelCall);

    const traceResource = exportedTurn.resource.attributes;
    assert.equal(traceResource["service.name"], "cli-agent");
    assert.equal(traceResource["service.version"], "1.2.3");
    assert.equal(traceResource["knorvia.build.commit_id"], "abcdef12");
    assert.equal(traceResource["knorvia.product.version"], "9.9.9");
    assert.equal(traceResource["knorvia.runtime.distribution"], "source");
    assert.equal(traceResource["knorvia.runtime.surface"], "standalone_cli");
    assert.equal(traceResource["knorvia.telemetry.schema_owner"], "cli");
    assert.equal(typeof traceResource["knorvia.telemetry.schema_version"], "number");
    assert.equal(traceResource["service.instance.id"], "svc-inst-1");
    assert.equal(traceResource["knorvia.device.installation_id"], "install-1");
    assert.equal(traceResource["deployment.environment.name"], "ci");
    assert.equal(traceResource["process.runtime.name"], "nodejs");
    assert.equal(traceResource["os.type"], process.platform);
    assert.equal(
      traceResource["host.arch"],
      process.arch === "x64" ? "amd64" : process.arch === "ia32" ? "x86" : process.arch,
    );

    assert.ok(metricSets.length > 0);
    const metricResource = metricSets.at(-1).resource.attributes;
    assert.equal(metricResource["service.instance.id"], undefined);
    assert.equal(metricResource["knorvia.device.installation_id"], undefined);
    assert.equal(metricResource["service.name"], "cli-agent");
    assert.equal(metricResource["knorvia.telemetry.schema_owner"], "cli");

    const pending = owner.agentExecution.startTurn({
      context: { sessionId: "sess-pending" },
      inputSource: "user",
      turnNumber: 3,
    });
    void pending;
    await owner.shutdown({ timeoutMs: 2_000 });
    const shutdownSpan = traceSpans.find(
      (span) =>
        span.name === "agent_turn" &&
        span.attributes["knorvia.agent_turn.abandon_reason"] === "process_shutdown",
    );
    assert.ok(shutdownSpan);
    await owner.flush();
    await owner.shutdown();
    assert.doesNotThrow(() => owner.abandonSession("sess-pending"));
  } finally {
    await owner.shutdown({ timeoutMs: 2_000 });
    TraceExporter.prototype.export = originalTraceExport;
    MetricExporter.prototype.export = originalMetricExport;
  }
});
