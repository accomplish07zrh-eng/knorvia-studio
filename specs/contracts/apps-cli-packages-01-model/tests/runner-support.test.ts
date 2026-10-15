// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01-model 契约测试：B53–B62（状态、调试持久化、重试与归一）。
// B54 走「旧写 → 新读 → 新写 → 旧读」往返：fixtures/model-io/written/golden-session.jsonl 为旧实现真值。
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fixturesDir, load } from "./entry.mjs";

const {
  admissionWaitPublishers,
  createAttemptStatusContext,
  createStatusContext,
  modelStatusContextToLogContext,
  publishModelStatus,
  publishModelTelemetryMilestone,
} = await load("model/runner-status");
const {
  isDevelopmentModelIOEnv,
  recordGenerateTextDebug,
  recordStreamTextDebug,
  shouldRecordModelIO,
} = await load("model/runner-debug");
const {
  TerminalStreamChunkError,
  calculateRetryDelay,
  logRetryDelayDecision,
  sleep,
  toAdapterError,
} = await load("model/runner-retry");
const {
  normalizeReasoning,
  normalizeSources,
  normalizeToolCalls,
  normalizeToolResults,
  normalizeUsage,
  toModelStreamEvent,
} = await load("model/runner-normalization");
const {
  createStreamDiagnostics,
  isSuspiciousStreamDiagnostics,
  isZeroOutputModelCompletion,
  logGenerateTextDiagnostics,
  logStreamDiagnostics,
  logStreamFailureDiagnostics,
  logIgnoredStreamChunk,
  recordStreamChunkDiagnostic,
} = await load("model/runner-diagnostics");
const {
  createModelRequestAttributionHeaders,
  normalizeModelSessionIdForAttribution,
  resolveModelRequestSessionType,
} = await load("model/runner-attribution");
const { sanitizeModelNetworkHeaders } = await load("model/runner-network-headers");
const { RuntimeHeadersRefreshError, resolveModelForAttempt } = await load(
  "model/runner-runtime-headers",
);
const { asRecord, isRecord, numberProperty, stringMetadata, stringProperty } =
  await load("model/runner-record");
const {
  modelFailureAttributionFields,
  modelFailureStatusFields,
  providerRequestIdFromHeaders,
  readModelFailureErrorPhase,
} = await load("model/runner-telemetry");

const statusContext = {
  traceId: "trace-1",
  queryId: "q-1",
  sessionId: "sess_abc",
  turnId: "turn-1",
  requestId: "req-1",
  providerId: "prov",
  modelId: "model-x",
  modelRequestSessionType: "main",
  transport: "http",
  maxAttempts: 3,
  modelCall: { actorKind: "main", operation: "model" },
} as never;

test("B53 状态上下文、attempt 上下文与事件发布", async () => {
  const context = createStatusContext({
    maxAttempts: 5,
    request: {
      metadata: { traceId: "meta-trace", requestId: "meta-req", toolCallId: "tc-1" },
      modelRequestSessionType: "other",
    } as never,
    resolved: {
      providerId: "prov",
      modelId: "model-x",
      providerKind: "openai-compatible",
    } as never,
    transport: "sse",
  });
  assert.equal(context.traceId, "meta-trace");
  assert.equal(context.requestId, "meta-req");
  assert.equal(context.toolCallId, "tc-1");
  assert.equal(context.modelRequestSessionType, "other");
  assert.equal(context.transport, "sse");
  assert.equal(context.maxAttempts, 5);
  assert.deepEqual(context.modelCall, { actorKind: "main", operation: "model" });
  const same = createAttemptStatusContext(context, 1);
  assert.equal(same, context);
  const next = createAttemptStatusContext(context, 2);
  assert.notEqual(next.requestId, context.requestId);
  const events: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  const sink = {
    publish: (event: Record<string, unknown>) => {
      events.push(event);
      return Promise.resolve();
    },
    publishFailure: (event: Record<string, unknown>, _error: unknown) => {
      events.push({ ...event, via: "publishFailure" });
      return Promise.resolve();
    },
  };
  const badSink = {
    publish: () => Promise.rejects(new Error("nope")),
  };
  await publishModelStatus(
    {
      type: "model_request_failed",
      requestHeaders: { authorization: "secret", "x-ok": "v" },
      responseHeaders: { cookie: "c" },
    } as never,
    {
      statusSink: sink,
      requestStatusSink: sink,
      logger: { warn: (message: string) => warnings.push(message) } as never,
      failureError: new Error("boom"),
    },
  );
  assert.equal(events.length, 1, "同一接收端按身份去重");
  assert.equal(events[0].via, "publishFailure");
  assert.deepEqual(events[0].requestHeaders, { authorization: "[REDACTED]", "x-ok": "v" });
  assert.deepEqual(events[0].responseHeaders, { cookie: "[REDACTED]" });
  await publishModelStatus({ type: "x" } as never, {
    statusSink: badSink as never,
    logger: { warn: (message: string) => warnings.push(message) } as never,
  });
  assert.deepEqual(warnings, ["Model status sink rejected an event"]);
  const waitEvents: Record<string, unknown>[] = [];
  const wait = admissionWaitPublishers(statusContext, 1, {
    statusSink: {
      publish: (event: Record<string, unknown>) => {
        waitEvents.push(event);
        return Promise.resolve();
      },
    } as never,
    admissionTicket: {
      publish: () => Promise.rejects(new Error("ticket must not see queued/admitted")),
    } as never,
  });
  await wait.onQueued();
  await wait.onAdmitted(7);
  assert.deepEqual(
    waitEvents.map((event) => event.type),
    ["model_request_queued", "model_request_admitted"],
  );
  assert.equal(waitEvents[1].queuedMs, 7);
  const milestone: unknown[] = [];
  await publishModelTelemetryMilestone({ type: "model_first_content" } as never, {
    statusSink: {
      publish: (event: unknown) => {
        milestone.push(event);
        return Promise.resolve();
      },
    } as never,
  });
  assert.equal(milestone.length, 1);
  assert.deepEqual(modelStatusContextToLogContext(statusContext, 2), {
    traceId: "trace-1",
    queryId: "q-1",
    sessionId: "sess_abc",
    turnId: "turn-1",
    requestId: "req-1",
    providerId: "prov",
    modelId: "model-x",
    providerKind: undefined,
    transport: "http",
    attempt: 2,
    maxAttempts: 3,
  });
});

test("B54 调试持久化往返：旧写金样 → 新读 → 新写 → 旧读", async () => {
  const goldenPath = join(fixturesDir, "model-io/written/golden-session.jsonl");
  const goldenLines = readFileSync(goldenPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const mask = (record: Record<string, unknown>) => ({ ...record, completedAt: "<ts>" });
  // 旧读语义：严格形状校验（旧实现的消费者口径）。
  const validate = (record: Record<string, unknown>) => {
    assert.equal(typeof record.kind, "string");
    assert.equal(typeof record.attempt, "number");
    assert.equal(typeof record.startedAt, "number");
    assert.equal(typeof record.completedAt, "number");
    assert.equal(typeof record.providerId, "string");
    assert.equal(typeof record.modelId, "string");
    assert.equal(typeof record.request, "object");
    assert.equal(typeof record.fullRetention, "boolean");
    assert.equal(typeof record.development, "boolean");
    assert.equal(typeof record.request.messageContext, "object");
    return true;
  };
  for (const record of goldenLines) validate(record);
  assert.equal(goldenLines.length, 2);
  assert.equal(goldenLines[0].kind, "generate");
  assert.deepEqual(goldenLines[0].request.messageContext, { mode: "baseline", omitted: 0 });
  assert.equal(goldenLines[1].kind, "stream");
  assert.deepEqual(goldenLines[1].request.messageContext, { mode: "delta", retainedPrefix: 1 });
  assert.equal(goldenLines[0].request.headers.authorization, "[REDACTED]");
  assert.equal(goldenLines[0].response.body, undefined);

  // 新写：同一输入在临时目录重放两条记录。
  const dir = mkdtempSync(join(tmpdir(), "knorvia-model-io-"));
  try {
    const request = {
      messages: [{ role: "user", content: "第一轮" }],
      metadata: { sessionId: "golden-session", skipTranscript: false },
      traceContext: { traceId: "trace-golden", sessionId: "golden-session" },
      maxOutputTokens: 128,
      providerOptions: { reasoningLevel: "low" },
    } as never;
    const options = {
      model: { fake: true },
      messages: [{ role: "user", content: "第一轮" }],
      maxRetries: 0,
      headers: { authorization: "Bearer secret", "x-ok": "v" },
    } as never;
    const resolved = {
      providerId: "prov",
      modelId: "model-x",
      providerKind: "openai-compatible",
      headers: { authorization: "Bearer secret" },
      baseURL: "https://example.invalid",
      model: { fake: true },
    } as never;
    const base = {
      attempt: 1,
      debugDir: dir,
      isDev: false,
      modelIoFullRetentionEnabled: false,
      normalizedToolCalls: undefined,
      recordModelIO: true,
      requestId: "req-golden",
      resolved,
      startedAt: 1_700_000_000_000,
    };
    await recordGenerateTextDebug({
      ...base,
      request,
      options,
      result: {
        text: "ok",
        finishReason: "stop",
        usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
        toolCalls: [],
        steps: [],
        request: { body: { messages: [{ role: "user", content: "第一轮" }] } },
        response: {
          body: { id: "resp-1" },
          headers: { "x-request-id": "rid" },
          id: "resp-1",
        },
      },
    } as never);
    await recordStreamTextDebug({
      ...base,
      request,
      options,
      result: {
        text: Promise.resolve("streamed"),
        reasoning: Promise.resolve(undefined),
        toolResults: Promise.resolve(undefined),
        sources: Promise.resolve(undefined),
        response: Promise.resolve({ id: "resp-2" }),
      },
    } as never);
    const writtenLines = readFileSync(join(dir, "golden-session.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(writtenLines.length, 2);
    for (const record of writtenLines) validate(record);
    assert.deepEqual(mask(writtenLines[0]), mask(goldenLines[0]));
    assert.deepEqual(mask(writtenLines[1]), mask(goldenLines[1]));

    // 门控与限额语义。
    const quiet = mkdtempSync(join(tmpdir(), "knorvia-model-io-quiet-"));
    try {
      await recordGenerateTextDebug({
        ...base,
        debugDir: quiet,
        request: {
          messages: [],
          metadata: { sessionId: "skipped", skipTranscript: true },
        } as never,
        options,
      } as never);
      assert.deepEqual(readdirSync(quiet), []);
    } finally {
      rmSync(quiet, { recursive: true, force: true });
    }
    const full = mkdtempSync(join(tmpdir(), "knorvia-model-io-full-"));
    try {
      await recordGenerateTextDebug({
        ...base,
        debugDir: full,
        modelIoFullRetentionEnabled: true,
        request: {
          messages: [{ role: "user", content: "canonical-full" }],
          metadata: { sessionId: "full-session" },
          traceContext: { sessionId: "full-session" },
        } as never,
        options: {
          model: { fake: true },
          messages: [{ role: "user", content: "sdk-copy" }],
          maxRetries: 0,
        } as never,
        result: { text: "ok" },
      } as never);
      const [line] = readFileSync(join(full, "full-session.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((entry) => JSON.parse(entry));
      assert.equal(line.request.messageContext, undefined);
      // 全量保留：SDK 选项原样记录（不做 canonical/sdk 拆分）。
      assert.deepEqual(line.request.messages, [{ role: "user", content: "sdk-copy" }]);
      assert.equal(line.fullRetention, true);
    } finally {
      rmSync(full, { recursive: true, force: true });
    }
    // 文件名消毒（保留设备名加前缀、非法字符归一）。
    const named = mkdtempSync(join(tmpdir(), "knorvia-model-io-name-"));
    try {
      for (const sessionId of ["con", "a/b\\c"]) {
        await recordGenerateTextDebug({
          ...base,
          debugDir: named,
          request: {
            messages: [{ role: "user", content: "x" }],
            metadata: { sessionId },
            traceContext: { sessionId },
          } as never,
          options,
          result: { text: "ok" },
        } as never);
      }
      const names = readdirSync(named).sort();
      assert.deepEqual(names, ["_con.jsonl", "a_b_c.jsonl"]);
    } finally {
      rmSync(named, { recursive: true, force: true });
    }
    // 生产轮转：目录内 .jsonl（含将写的当前文件）至多 3 个，按 mtime 从旧到新删。
    const rotated = mkdtempSync(join(tmpdir(), "knorvia-model-io-rot-"));
    try {
      for (const [index, name] of ["old1.jsonl", "old2.jsonl", "old3.jsonl"].entries()) {
        const path = join(rotated, name);
        writeFileSync(path, "{}\n", "utf8");
        utimesSync(path, new Date((index + 1) * 60_000), new Date((index + 1) * 60_000));
      }
      await recordGenerateTextDebug({
        ...base,
        debugDir: rotated,
        request: {
          messages: [{ role: "user", content: "x" }],
          metadata: { sessionId: "fresh" },
          traceContext: { sessionId: "fresh" },
        } as never,
        options,
        result: { text: "ok" },
      } as never);
      const names = readdirSync(rotated).sort();
      assert.deepEqual(names, ["fresh.jsonl", "old2.jsonl", "old3.jsonl"]);
    } finally {
      rmSync(rotated, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(shouldRecordModelIO({}), true);
  assert.equal(shouldRecordModelIO({ KNORVIA_RUNTIME_ENV: "test" }), false);
  assert.equal(isDevelopmentModelIOEnv({ KNORVIA_RUNTIME_ENV: "development" }), true);
  assert.equal(isDevelopmentModelIOEnv({}), false);
});

test("B55 重试延迟、退避等待与适配错误", async () => {
  const retry = {
    maxAttempts: 5,
    baseDelayMs: 100,
    backoffFactor: 2,
    maxDelayMs: 1000,
    jitter: false,
  };
  assert.equal(calculateRetryDelay(retry, 1), 100);
  assert.equal(calculateRetryDelay(retry, 3), 400);
  assert.equal(calculateRetryDelay(retry, 9), 1000);
  assert.equal(calculateRetryDelay(retry, 1, 50), 50);
  assert.equal(calculateRetryDelay(retry, 1, 400_000), 100);
  assert.equal(calculateRetryDelay(retry, 1, 50_000), 50_000);
  const jittered = calculateRetryDelay({ ...retry, jitter: true }, 1);
  assert.ok(jittered >= 50 && jittered <= 100);
  await sleep(0);
  const controller = new AbortController();
  controller.abort("stop");
  await assert.rejects(sleep(10, controller.signal), (error: unknown) => error === "stop");
  const terminal = new TerminalStreamChunkError({ message: "term" } as never);
  assert.equal(terminal.name, "TerminalStreamChunkError");
  assert.equal(terminal.message, "term");
  const enriched = toAdapterError(
    new (await load("model/errors")).AiSdkModelAdapterError("model_request_failed", "x", {
      context: { existing: 1 },
    }),
    {
      code: "model_request_failed",
      message: "x",
      reason: "unknown",
      retryReason: "network_error",
      retryable: false,
    } as never,
    statusContext,
    2,
    { errorPhase: "response" },
  );
  assert.equal(enriched.context.existing, 1);
  assert.equal(enriched.context.attempt, 2);
  const fresh = toAdapterError(
    new Error("root"),
    {
      code: "model_rate_limited",
      message: "limited",
      reason: "rate_limited",
      retryReason: "rate_limited",
      retryable: true,
      retryAfterMs: 10,
    } as never,
    statusContext,
    1,
  );
  assert.equal(fresh.code, "model_rate_limited");
  assert.equal(fresh.context.reason, "rate_limited");
  assert.equal(fresh.context.retryAfterMs, 10);
  assert.equal((fresh.cause as Error).message, "root");
  const logged: string[] = [];
  logRetryDelayDecision({
    attempt: 1,
    canRetry: true,
    delayMs: 5,
    failure: { reason: "rate_limited" } as never,
    responseHeaders: {},
    statusContext,
    logger: {
      debug: (message: string) => logged.push(message),
    } as never,
  });
  assert.deepEqual(logged, ["Model retry decision"]);
});

test("B56 结果归一（用量、reasoning、流事件、工具、来源）", () => {
  assert.deepEqual(
    normalizeUsage({
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3,
      inputTokenDetails: { cacheReadTokens: 4, cacheWriteTokens: 5 },
      outputTokenDetails: { reasoningTokens: 6 },
    } as never),
    {
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3,
      cacheReadTokens: 4,
      cacheWriteTokens: 5,
      reasoningTokens: 6,
    },
  );
  assert.equal(normalizeReasoning([]), undefined);
  assert.deepEqual(
    normalizeReasoning([
      { text: "why", providerMetadata: { a: 1 } },
      { text: "", providerMetadata: undefined },
    ] as never),
    [{ type: "reasoning", text: "why", providerOptions: { a: 1 } }],
  );
  const mapped = toModelStreamEvent({
    type: "tool-call",
    toolCallId: "c1",
    toolName: "t",
    input: '{"a":1}',
  } as never);
  assert.equal(mapped?.type, "tool_call");
  assert.deepEqual((mapped as { toolCall: { input: unknown } }).toolCall.input, { a: 1 });
  assert.deepEqual(toModelStreamEvent({ type: "unknown-kind" } as never), undefined);
  const finish = toModelStreamEvent({
    type: "finish",
    finishReason: "stop",
    totalUsage: { totalTokens: 9 },
  } as never);
  assert.equal((finish as { usage: { totalTokens: number } }).usage.totalTokens, 9);
  const calls = normalizeToolCalls({
    toolCalls: [{ toolCallId: "c", toolName: "t", input: '{"x":1}' }],
  } as never);
  assert.equal(calls?.length, 1);
  assert.deepEqual(calls?.[0].input, { x: 1 });
  assert.equal(normalizeToolCalls({} as never), undefined);
  const results = normalizeToolResults(
    {
      toolResults: [{ toolCallId: "c", toolName: "t", input: { raw: true }, output: "o" }],
    } as never,
    [{ id: "c", name: "t", input: { fixed: true } } as never],
  );
  assert.deepEqual(results?.[0].input, { fixed: true });
  assert.equal(normalizeSources({ sources: [{ title: "a" }] } as never)?.length, 1);
  assert.equal(normalizeSources({} as never), undefined);
});

test("B57 终局业务错误探测", async () => {
  const { detectProviderBusinessFinishError } = await load("model/provider-finish-business-error");
  assert.equal(
    detectProviderBusinessFinishError({ providerId: "p", source: { ok: true } }),
    undefined,
  );
  assert.equal(
    detectProviderBusinessFinishError({
      providerId: "p",
      providerKind: "anthropic",
      source: { message: "boom" },
    }),
    undefined,
  );
  const error = detectProviderBusinessFinishError({
    providerId: "p",
    providerKind: "gateway",
    source: { success: false, message: "rejected" },
  });
  assert.equal(error?.providerId, "p");
  assert.equal(error?.providerKind, "openai-compatible");
  assert.equal(error?.providerMessage, "rejected");
  const streamError = detectProviderBusinessFinishError.detectProviderStreamFinishError(
    { providerId: "p", providerKind: "anthropic" } as never,
    { providerCode: "1234" } as never,
    { type: "finish", finishReason: "stop", usage: {} } as never,
  );
  assert.equal(streamError?.providerCode, "1234");
  assert.equal(streamError?.providerKind, "anthropic");
});

test("B58 流诊断计数与零输出判定", () => {
  assert.equal(
    isZeroOutputModelCompletion({
      textLength: 0,
      reasoningLength: 0,
      toolCallCount: 0,
      usage: undefined,
    }),
    true,
  );
  assert.equal(
    isZeroOutputModelCompletion({
      textLength: 0,
      reasoningLength: 0,
      toolCallCount: 0,
      usage: { totalTokens: 1 } as never,
    }),
    false,
  );
  const diagnostics = createStreamDiagnostics();
  recordStreamChunkDiagnostic(diagnostics, { type: "text-delta", text: "ab" });
  recordStreamChunkDiagnostic(diagnostics, { type: "reasoning-delta", delta: "xyz" });
  recordStreamChunkDiagnostic(diagnostics, { type: "tool-call" });
  recordStreamChunkDiagnostic(diagnostics, { type: "error", error: "e" });
  recordStreamChunkDiagnostic(diagnostics, { type: "finish", finishReason: "stop" });
  assert.equal(diagnostics.textDeltaChars, 2);
  assert.equal(diagnostics.reasoningDeltaChars, 3);
  assert.equal(diagnostics.toolCallCount, 1);
  assert.equal(diagnostics.errorChunkCount, 1);
  assert.equal(diagnostics.finishReason, "stop");
  assert.equal(diagnostics.chunkCounts["text-delta"], 1);
  assert.equal(isSuspiciousStreamDiagnostics(diagnostics), true);
  const logs: string[] = [];
  const logger = {
    debug: (message: string) => logs.push(`debug:${message}`),
    warn: (message: string) => logs.push(`warn:${message}`),
  } as never;
  logGenerateTextDiagnostics({
    attempt: 1,
    completedAt: 2,
    startedAt: 1,
    result: {} as never,
    toolCallCount: 0,
    usage: {} as never,
    statusContext,
    logger,
  });
  logStreamDiagnostics({
    attempt: 1,
    diagnostics,
    durationMs: 3,
    emittedError: true,
    emittedEvent: true,
    statusContext,
    logger,
  });
  logStreamFailureDiagnostics({
    attempt: 1,
    canRetry: false,
    diagnostics,
    durationMs: 3,
    emittedError: true,
    emittedEvent: true,
    emittedRetryBoundaryEvent: false,
    error: new Error("x"),
    failure: { reason: "server_error" } as never,
    statusContext,
    logger,
  });
  logIgnoredStreamChunk({ attempt: 1, chunk: { type: "raw" }, statusContext, logger });
  assert.deepEqual(logs, [
    "debug:Model generate completed",
    "debug:Model stream completed",
    "warn:Model stream failed",
    "debug:Ignored model stream chunk",
  ]);
});

test("B59 归因头与会话类型（语义常量）", () => {
  assert.equal(normalizeModelSessionIdForAttribution(undefined), undefined);
  assert.equal(normalizeModelSessionIdForAttribution("sess_abc"), "abc");
  assert.equal(normalizeModelSessionIdForAttribution("sess_"), undefined);
  assert.equal(normalizeModelSessionIdForAttribution("plain"), "plain");
  assert.equal(
    resolveModelRequestSessionType("subagent", { actorKind: "main", operation: "model" }),
    "subagent",
  );
  assert.equal(
    resolveModelRequestSessionType(undefined, { actorKind: "subagent", operation: "model" }),
    "subagent",
  );
  assert.equal(
    resolveModelRequestSessionType(undefined, { actorKind: "worker", operation: "run-subagent-x" }),
    "subagent",
  );
  assert.equal(
    resolveModelRequestSessionType(undefined, { actorKind: "main", operation: "model" }),
    "main",
  );
  assert.equal(
    resolveModelRequestSessionType(undefined, { actorKind: "worker", operation: "model" }),
    "other",
  );
  assert.deepEqual(
    createModelRequestAttributionHeaders({
      ...statusContext,
      queryId: undefined,
      sessionId: "sess_abc",
    } as never),
    {
      "x-knorvia-request-id": "req-1",
      "x-knorvia-trace-id": "trace-1",
      "x-knorvia-session-type": "main",
      "x-knorvia-session-id": "abc",
    },
  );
});

test("B60 网络头脱敏（敏感头清单）", () => {
  assert.deepEqual(
    sanitizeModelNetworkHeaders({
      Authorization: "secret",
      "proxy-authorization": "secret",
      "x-api-key": "secret",
      "api-key": "secret",
      cookie: "c",
      "set-cookie": "c",
      "x-ok": "v",
      count: 3,
    }),
    {
      Authorization: "[REDACTED]",
      "proxy-authorization": "[REDACTED]",
      "x-api-key": "[REDACTED]",
      "api-key": "[REDACTED]",
      cookie: "[REDACTED]",
      "set-cookie": "[REDACTED]",
      "x-ok": "v",
    },
  );
  assert.deepEqual(sanitizeModelNetworkHeaders(null), {});
  assert.deepEqual(sanitizeModelNetworkHeaders("x"), {});
});

test("B61 attempt 级运行时头刷新", async () => {
  const plain = await resolveModelForAttempt({
    attempt: 1,
    request: {} as never,
    resolveModel: () => ({ id: "provisional" }) as never,
  });
  assert.equal((plain as { id: string }).id, "provisional");
  const seen: unknown[] = [];
  const refreshed = await resolveModelForAttempt({
    attempt: 2,
    request: {
      refreshRuntimeHeadersBeforeAttempt: async (input: unknown) => {
        seen.push(input);
        return { headersApplied: true, requestAuth: { apiKey: "k" } };
      },
    } as never,
    resolveModel: (requestAuth?: unknown) => ({ requestAuth }) as never,
  });
  assert.deepEqual((refreshed as { requestAuth: unknown }).requestAuth, { apiKey: "k" });
  assert.equal((seen[0] as { attempt: number }).attempt, 2);
  await assert.rejects(
    resolveModelForAttempt({
      attempt: 1,
      request: {
        refreshRuntimeHeadersBeforeAttempt: async () => {
          throw new Error("refresh failed");
        },
      } as never,
      resolveModel: () => ({}) as never,
    }),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeHeadersRefreshError);
      assert.equal(error.message, "Runtime model headers could not be refreshed");
      return true;
    },
  );
  const aborted = new AbortController();
  aborted.abort("cancelled");
  await assert.rejects(
    resolveModelForAttempt({
      attempt: 1,
      request: {
        abortSignal: aborted.signal,
        refreshRuntimeHeadersBeforeAttempt: async () => ({ headersApplied: true }),
      } as never,
      resolveModel: () => ({}) as never,
    }),
    (error: unknown) => error === "cancelled",
  );
});

test("B62 记录字段工具与失败遥测归因", () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord([]), true);
  assert.equal(isRecord(null), false);
  assert.deepEqual(asRecord("x"), {});
  assert.equal(stringProperty({ a: "s" }, "a"), "s");
  assert.equal(stringProperty({ a: 1 }, "a"), undefined);
  assert.equal(numberProperty({ a: 1.5 }, "a"), 1.5);
  assert.equal(numberProperty({ a: Number.NaN }, "a"), undefined);
  assert.equal(numberProperty(undefined, "a"), undefined);
  assert.equal(stringMetadata("s"), "s");
  assert.equal(stringMetadata(3), undefined);
  assert.equal(readModelFailureErrorPhase({ context: { errorPhase: "stream" } }), "stream");
  assert.equal(readModelFailureErrorPhase({ errorPhase: "response" }), "response");
  assert.equal(readModelFailureErrorPhase({}), undefined);
  assert.deepEqual(
    modelFailureAttributionFields({}, { reason: "network_error" } as never, "connect"),
    { errorPhase: "connect", exceptionKind: "transport" },
  );
  assert.deepEqual(
    modelFailureAttributionFields({}, { reason: "invalid_request" } as never, undefined),
    { errorPhase: undefined, exceptionKind: "protocol" },
  );
  assert.deepEqual(modelFailureAttributionFields({}, { reason: "unknown" } as never, "response"), {
    errorPhase: "response",
    exceptionKind: "api_call",
  });
  const business = { isProviderBusinessError: true, message: "x" };
  assert.equal(
    modelFailureAttributionFields(business, { reason: "unknown" } as never, "response")
      .exceptionKind,
    "provider_business",
  );
  const fields = modelFailureStatusFields(
    Object.assign(new Error("x"), {
      name: "CustomError",
      isProviderBusinessError: true,
      providerCode: "9",
      providerMessage: "m",
    }),
    { code: "model_request_failed", retryAfterMs: 5 } as never,
    "response",
  );
  assert.equal(fields.errorCode, "model_request_failed");
  assert.equal(fields.exceptionType, "CustomError");
  assert.equal(fields.retryAfterMs, 5);
  assert.equal(fields.providerErrorCode, "9");
  assert.equal(providerRequestIdFromHeaders({ "X-Request-Id": "rid" }), "rid");
  assert.equal(providerRequestIdFromHeaders({ "cf-ray": "cf" }), "cf");
  assert.equal(providerRequestIdFromHeaders({ other: "x" }), undefined);
});

void writeFileSync;
