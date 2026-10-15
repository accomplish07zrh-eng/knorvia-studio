// SPDX-License-Identifier: Apache-2.0
// core-runtime-methods-01 契约测试：请求元数据、限额、流式队列与流状态（B3/B4/B7–B11）。
// B7 的进入顺序与背压用 gate 握手断言，无 sleep、无固定超时。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { contractDir, contractsBundle, coreDeps, methods } from "./entry.mjs";
import { createMethodsRuntime, type FakeMethodsRuntime } from "./fixtures.js";

const { ModelRequestSessionType, ModelRetryBudget, SessionEventType } = await contractsBundle();
const { CoreErrorType } = await coreDeps();
const sessionType = await methods("model-request-session-type");
const tokenLimits = await methods("model-token-limits");
const reasoningStream = await methods("reasoning-stream");
const streamQueue = await methods("model-streaming-event-queue");
const streamEvent = await methods("model-streaming-event");
const streamState = await methods("model-request-stream-state");
const modelRequest = await methods("model");

const trace = {
  spanId: "span-contract-0001",
  traceId: "trace-contract-0001",
  turnId: "turn-contract-0001",
} as never;

/** 微任务排空：确定性地让挂起的 promise 链走到下一个稳定点（不引入计时）。 */
const flushMicrotasks = async (turns = 6) => {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
};

const requestOptions = () =>
  ({
    assistantMessageId: "assistant-msg-0001",
    events: [],
    traceContext: trace,
  }) as never;

test("B3 会话类型与重试预算解析", () => {
  assert.equal(
    sessionType.resolveModelRequestSessionTypeFromTaskType("subagent_child"),
    ModelRequestSessionType.Subagent,
  );
  assert.equal(
    sessionType.resolveModelRequestSessionTypeFromTaskType("workflow_child"),
    ModelRequestSessionType.Other,
  );
  assert.equal(
    sessionType.resolveModelRequestSessionTypeFromTaskType("nested_workflow_child"),
    ModelRequestSessionType.Other,
    "workflow child 不是 subagent，统一归 other",
  );
  for (const taskType of [undefined, "main", "fork_child", "unknown-task"]) {
    assert.equal(
      sessionType.resolveModelRequestSessionTypeFromTaskType(taskType),
      ModelRequestSessionType.Main,
      `其余分支归 Main：${String(taskType)}`,
    );
  }

  assert.equal(
    sessionType.resolveModelRetryBudgetFromTaskType("workflow_child"),
    ModelRetryBudget.Unbounded,
  );
  assert.equal(
    sessionType.resolveModelRetryBudgetFromTaskType("nested_workflow_child"),
    ModelRetryBudget.Unbounded,
  );
  for (const taskType of [undefined, "subagent_child", "main", "fork_child"]) {
    assert.equal(
      sessionType.resolveModelRetryBudgetFromTaskType(taskType),
      ModelRetryBudget.Default,
      `其余分支沿用默认预算：${String(taskType)}`,
    );
  }
});

test("B4 max output token 两级限额", () => {
  assert.equal(
    tokenLimits.resolveNormalRequestMaxOutputTokens({ modelMaxOutputTokens: undefined }),
    32_000,
  );
  assert.equal(
    tokenLimits.resolveNormalRequestMaxOutputTokens({ modelMaxOutputTokens: Number.NaN }),
    32_000,
  );
  assert.equal(
    tokenLimits.resolveNormalRequestMaxOutputTokens({ modelMaxOutputTokens: 0 }),
    32_000,
  );
  assert.equal(
    tokenLimits.resolveNormalRequestMaxOutputTokens({ modelMaxOutputTokens: -5 }),
    32_000,
  );
  assert.equal(
    tokenLimits.resolveNormalRequestMaxOutputTokens({ modelMaxOutputTokens: 65_536 }),
    65_536,
  );
  assert.equal(
    tokenLimits.resolveNormalRequestMaxOutputTokens({ modelMaxOutputTokens: 1_234.9 }),
    1_234,
  );

  const baseline = 8_000;
  const step = (overrides: Record<string, unknown>) =>
    tokenLimits.resolveModelStepMaxOutputTokens({
      baselineMaxOutputTokens: baseline,
      contextWindow: 20_000,
      estimatedCurrentUsage: 5_000,
      modelContextBudgetStrategy: undefined,
      ...overrides,
    });
  assert.equal(step({}), 8_000, "min(baseline, 20000-5000-1000=14000)");
  assert.equal(step({ contextWindow: 12_000 }), 6_000, "min(baseline, 12000-5000-1000)");
  assert.equal(step({ contextWindow: undefined }), baseline, "contextWindow 缺失回 baseline");
  assert.equal(step({ contextWindow: Number.POSITIVE_INFINITY }), baseline, "非有限回 baseline");
  assert.equal(step({ contextWindow: 0 }), baseline, "非正回 baseline");
  assert.equal(step({ estimatedCurrentUsage: Number.NaN }), baseline, "用量非有限回 baseline");
  assert.equal(step({ estimatedCurrentUsage: -1 }), baseline, "用量负数回 baseline");
  assert.equal(step({ contextWindow: 5_999 }), baseline, "剩余-预留 ≤ 0 回 baseline");
  assert.equal(
    step({ modelContextBudgetStrategy: "legacy" }),
    8_000,
    "legacy 同样按 preflight 口径",
  );

  const context = tokenLimits.modelRequestTokenLimitLogContext({
    contextWindow: 20_000,
    maxOutputTokens: 8_000,
    modelContextBudgetStrategy: "legacy",
    traceContext: trace,
  });
  assert.equal(context.event, "model.request.token_limits");
  assert.equal(context.module, "core.runtime");
  assert.equal(context.contextWindow, 20_000);
  assert.equal(context.maxOutputTokens, 8_000);
  assert.equal(context.inputBudgetTokens, 12_000);
  assert.equal(context.modelContextBudgetStrategy, "preflight-v1", "恒取 shared 默认策略");
  assert.equal(
    tokenLimits.modelRequestTokenLimitLogContext({
      contextWindow: undefined,
      maxOutputTokens: 8_000,
      modelContextBudgetStrategy: "preflight-v1",
      traceContext: trace,
    }).inputBudgetTokens,
    undefined,
    "任一缺失为 undefined",
  );
  assert.equal(
    tokenLimits.modelRequestTokenLimitLogContext({
      contextWindow: 100.9,
      maxOutputTokens: 300.2,
      modelContextBudgetStrategy: undefined,
      traceContext: trace,
    }).inputBudgetTokens,
    0,
    "floor 后相减、下限 0",
  );
});

test("B7 流式事件队列进入顺序", async () => {
  // 进入顺序 = enqueue 序；写入严格串行（第二条的写入不在第一条完成前进入）。
  const fake = createMethodsRuntime();
  const events: unknown[] = [];
  const queue = streamQueue.createModelStreamingEventQueue({
    events,
    runtime: fake.runtime,
    traceContext: trace,
    highWaterMark: 2,
  });
  const gate = fake.gateNextEmit();
  queue.enqueue({ kind: "text_delta", delta: "one" });
  queue.enqueue({ kind: "text_delta", delta: "two" });
  await flushMicrotasks();
  assert.deepEqual(fake.journal, ["enter:emit:text_delta"], "串行尾链：第二条写入等第一条完成");
  gate.close();
  await queue.drain();
  assert.deepEqual(fake.journal, [
    "enter:emit:text_delta",
    "exit:emit:text_delta",
    "enter:emit:text_delta",
    "exit:emit:text_delta",
  ]);
  assert.equal(events.length, 2);

  // 高水位背压：pending 达到 highWaterMark 时 maybeApplyBackpressure 等尾链清空。
  const pressurized = createMethodsRuntime();
  const pressurizedQueue = streamQueue.createModelStreamingEventQueue({
    events: [],
    runtime: pressurized.runtime,
    traceContext: trace,
    highWaterMark: 2,
  });
  const pressurizedGate = pressurized.gateNextEmit();
  pressurizedQueue.enqueue({ kind: "text_delta", delta: "a" });
  pressurizedQueue.enqueue({ kind: "text_delta", delta: "b" });
  let backpressured = false;
  const waiting = pressurizedQueue.maybeApplyBackpressure().then(() => {
    backpressured = true;
  });
  await flushMicrotasks();
  assert.equal(backpressured, false, "高水位时背压等待尾链");
  pressurizedGate.close();
  await waiting;
  assert.equal(backpressured, true);

  // 未达高水位立即返回（写入仍挂起也不等）。
  const light = createMethodsRuntime();
  const lightQueue = streamQueue.createModelStreamingEventQueue({
    events: [],
    runtime: light.runtime,
    traceContext: trace,
    highWaterMark: 2,
  });
  const lightGate = light.gateNextEmit();
  lightQueue.enqueue({ kind: "text_delta", delta: "x" });
  await lightQueue.maybeApplyBackpressure();
  lightGate.close();
  await lightQueue.drain();

  // 队列级失败：首个失败缓存后 enqueue / drain / maybeApplyBackpressure 三出口都抛。
  const broken = createMethodsRuntime();
  const brokenQueue = streamQueue.createModelStreamingEventQueue({
    events: [],
    runtime: broken.runtime,
    traceContext: trace,
  });
  const boom = new Error("stream write broke");
  broken.failNextEmit(boom);
  brokenQueue.enqueue({ kind: "text_delta", delta: "y" });
  await assert.rejects(brokenQueue.drain(), boom);
  assert.throws(() => brokenQueue.enqueue({ kind: "text_delta", delta: "z" }), boom);
  await assert.rejects(brokenQueue.drain(), boom);
  await assert.rejects(brokenQueue.maybeApplyBackpressure(), boom);
  assert.deepEqual(
    broken.journal,
    ["enter:emit:text_delta", "failed:emit:text_delta"],
    "失败后不再执行后续写入",
  );
});

test("B8 流式事件落盘", async () => {
  const fake = createMethodsRuntime();
  const events: unknown[] = [];
  const gate = fake.gateNextAppend();
  const pending = streamEvent.emitModelStreamingEvent.call(
    fake.runtime,
    { kind: "text_start" },
    trace,
    events,
  );
  assert.equal(events.length, 0, "先持久化后入数组");
  assert.equal(fake.appended.length, 0);
  gate.close();
  await pending;
  assert.equal(events.length, 1);
  assert.equal(events[0], fake.appended[0], "入数组的是持久化后的同一事件");
  assert.equal((fake.appended[0] as { type: string }).type, SessionEventType.ModelStreaming);

  // appendEvent 失败原样冒泡（由队列捕获为队列级失败）。
  fake.failNextAppend(new Error("append broke"));
  await assert.rejects(
    streamEvent.emitModelStreamingEvent.call(fake.runtime, { kind: "finish" }, trace, events),
    /append broke/,
  );
  assert.equal(events.length, 1);
});

test("B9 推理块按需创建", () => {
  const reasoning: unknown[] = [];
  const reasoningById = new Map<string, unknown>();
  const first = reasoningStream.getOrCreateReasoningBlock({
    providerMetadata: { vendor: "alpha" },
    reasoning,
    reasoningById,
  });
  assert.deepEqual(first, {
    type: "reasoning",
    text: "",
    providerOptions: { vendor: "alpha" },
  });
  assert.equal(reasoningById.get("__knorvia_default_reasoning__"), first, "默认 id 常量");
  assert.deepEqual(reasoning, [first], "Map 与数组同登");

  const again = reasoningStream.getOrCreateReasoningBlock({ reasoning, reasoningById });
  assert.equal(again, first, "同 id 复用既有块");

  const named = reasoningStream.getOrCreateReasoningBlock({
    id: "block-2",
    reasoning,
    reasoningById,
  });
  assert.notEqual(named, first);
  assert.deepEqual(
    reasoning.map((block) => block),
    [first, named],
    "块的追加顺序 = 首次出现顺序",
  );
  assert.equal(reasoningById.size, 2);
});

test("B10 工具输入缓冲与冲刷", async () => {
  const eventsOf = (fake: FakeMethodsRuntime) =>
    fake.journal.filter((line) => line.includes("emit:"));

  // 空 delta 忽略；缓冲累积。
  const base = createMethodsRuntime();
  const state = streamState.createModelRequestStreamState(base.runtime, requestOptions());
  await state.bufferToolInput("call-1", "");
  await state.bufferToolInput("call-1", "plain");
  assert.equal(state.toolInputBuffers.get("call-1"), "plain");
  assert.deepEqual(eventsOf(base), []);

  // 四种换行/转义触发冲刷。
  for (const trigger of ["\n", "\r", "\\n", "\\r"]) {
    const fake = createMethodsRuntime();
    const stream = streamState.createModelRequestStreamState(fake.runtime, requestOptions());
    await stream.bufferToolInput("call-1", `before${trigger}after`);
    assert.deepEqual(
      fake.journal,
      ["enter:emit:tool_input_delta", "exit:emit:tool_input_delta"],
      `触发串 ${JSON.stringify(trigger)} 立即冲刷`,
    );
    assert.equal(stream.toolInputBuffers.has("call-1"), false, "flush 后清缓冲");
  }

  // 4,096 阈值冲刷；不足阈值不冲刷。
  const threshold = createMethodsRuntime();
  const thresholdStream = streamState.createModelRequestStreamState(
    threshold.runtime,
    requestOptions(),
  );
  await thresholdStream.bufferToolInput("call-1", "x".repeat(4_095));
  assert.deepEqual(threshold.journal, []);
  await thresholdStream.bufferToolInput("call-1", "y");
  assert.deepEqual(
    threshold.journal,
    ["enter:emit:tool_input_delta", "exit:emit:tool_input_delta"],
    "长度达 4,096 立即冲刷",
  );

  // flush 打 debug（deltaLength）；重复 flush no-op；flushAll 按缓冲键序。
  const ordered = createMethodsRuntime();
  const orderedStream = streamState.createModelRequestStreamState(
    ordered.runtime,
    requestOptions(),
  );
  await orderedStream.bufferToolInput("call-b", "beta");
  await orderedStream.bufferToolInput("call-a", "alpha");
  await orderedStream.flushAllToolInputs();
  assert.deepEqual(orderedStream.toolInputBuffers.size, 0);
  const flushed = ordered.logger.records.filter(
    (record) => record.message === "Model streaming tool input delta flushed",
  );
  assert.equal(flushed.length, 2, "flushAll 逐个 flush");
  assert.deepEqual(
    flushed.map((record) => (record.context[0] as { deltaLength: number }).deltaLength),
    [4, 5],
    "按缓冲键序冲刷（call-b 先）",
  );
  assert.equal(
    (flushed[0].context[0] as { event: string }).event,
    "model.streaming.tool_input_delta.flush",
  );
  await orderedStream.flushToolInput("call-b");
  assert.equal(
    ordered.logger.records.filter(
      (record) => record.message === "Model streaming tool input delta flushed",
    ).length,
    2,
    "重复 flush no-op",
  );

  // enqueue 入队 + 背压；enqueueTerminal 入队 + drain（终止语义）。
  const terminal = createMethodsRuntime();
  const terminalStream = streamState.createModelRequestStreamState(
    terminal.runtime,
    requestOptions(),
  );
  const terminalGate = terminal.gateNextEmit();
  let terminalDone = false;
  const terminalPending = terminalStream
    .enqueueTerminal({ kind: "finish", done: true })
    .then(() => {
      terminalDone = true;
    });
  await flushMicrotasks();
  assert.equal(terminalDone, false, "enqueueTerminal 等 drain 完成");
  terminalGate.close();
  await terminalPending;
  assert.equal(terminalDone, true);
  assert.deepEqual(terminal.journal, ["enter:emit:finish", "exit:emit:finish"]);
});

test("B11 流结果体检", () => {
  const model = { modelId: "model-contract", providerId: "provider-contract" };

  // contextExceeded：无工具调用且非输出截断时命中。
  const overflow = createMethodsRuntime();
  streamState.inspectModelRequestStreamResult(
    overflow.runtime,
    {
      finishReason: "context_length_exceeded",
      providerMetadata: { rawFinishReason: "prompt_too_long" },
      text: "partial",
      toolCalls: [],
      usage: {},
    },
    model,
    requestOptions(),
  );
  const overflowWarn = overflow.logger.records.find(
    (record) => record.message === "Model stream ended with provider context overflow",
  );
  assert.ok(overflowWarn, "命中 contextExceeded 打 warn");
  const overflowContext = overflowWarn?.context[0] as Record<string, unknown>;
  assert.equal(overflowContext.event, "model.runtime.stream.context_exceeded");
  assert.equal(overflowContext.finishReason, "context_length_exceeded");
  assert.equal(overflowContext.rawFinishReason, "prompt_too_long");
  assert.equal(overflowContext.modelProviderId, "provider-contract");
  assert.equal(overflowContext.modelId, "model-contract");
  assert.equal(overflowContext.textLength, 7);
  assert.equal(overflowContext.toolCallCount, 0);

  // 有工具调用不判超限；输出截断也不判。
  for (const scenario of [
    { toolCalls: [{}], finishReason: "context_length_exceeded" },
    { toolCalls: [], finishReason: "length" },
    {
      toolCalls: [],
      finishReason: "context_length_exceeded",
      providerMetadata: { rawFinishReason: "max_tokens" },
    },
  ]) {
    const quiet = createMethodsRuntime();
    streamState.inspectModelRequestStreamResult(
      quiet.runtime,
      {
        finishReason: scenario.finishReason,
        providerMetadata: scenario.providerMetadata ?? {},
        text: "",
        toolCalls: scenario.toolCalls as never,
        usage: {},
      },
      model,
      requestOptions(),
    );
    assert.deepEqual(quiet.logger.records, [], `不判超限：${JSON.stringify(scenario)}`);
  }

  // suspicious_empty：空文本、无工具、零用量且非常规收尾 → warn + finalize 转换。
  const suspicious = createMethodsRuntime();
  assert.throws(
    () =>
      streamState.inspectModelRequestStreamResult(
        suspicious.runtime,
        {
          finishReason: "provider_odd_stop",
          providerMetadata: undefined,
          text: "",
          toolCalls: [],
          usage: {},
        },
        model,
        requestOptions(),
      ),
    (error: { context?: Record<string, unknown>; type?: string }) => {
      assert.equal(error.type, CoreErrorType.ModelError);
      assert.equal(error.context?.suspiciousEmpty, true);
      return true;
    },
  );
  const suspiciousWarn = suspicious.logger.records.find(
    (record) => record.message === "Model stream ended with suspicious empty completion",
  );
  assert.ok(suspiciousWarn, "命中可疑空响应打 warn");
  const suspiciousContext = suspiciousWarn?.context[0] as Record<string, unknown>;
  assert.equal(suspiciousContext.event, "model.runtime.stream.suspicious_empty");
  assert.equal(suspiciousContext.finishReason, "provider_odd_stop");
  assert.equal(suspiciousContext.textLength, 0);
  assert.equal(suspiciousContext.toolCallCount, 0);
});

/** 脚本化模型适配器：按序产出流事件并捕获组装出的请求。 */
function scriptedModel(script: unknown[], generateResult?: Record<string, unknown>) {
  const captured: { generate?: unknown; stream?: unknown } = {};
  return {
    captured,
    model: {
      providerId: "provider-contract",
      modelId: "model-contract",
      properties: {},
      async generateText(request: unknown) {
        captured.generate = request;
        return generateResult ?? { finishReason: "stop", text: "", toolCalls: [], usage: {} };
      },
      async *streamText(request: unknown) {
        captured.stream = request;
        for (const event of script) yield event;
      },
    },
  };
}

const baseMessages = [{ role: "user", content: "contract input" }];

const runOptions = (
  script: unknown[],
  fields: Record<string, unknown> = {},
  generateResult?: Record<string, unknown>,
) => {
  const fake = createMethodsRuntime();
  const harness = scriptedModel(script, generateResult);
  const callbacks = {
    deltas: [] as string[],
    reasoningDeltas: [] as string[],
    snapshots: 0,
    toolCalls: [] as unknown[],
  };
  const options = {
    abortSignal: new AbortController().signal,
    assistantMessageId: "assistant-msg-0001",
    events: [],
    messages: baseMessages,
    model: harness.model,
    onStreamReasoningDelta: (delta: string) => callbacks.reasoningDeltas.push(delta),
    onStreamSnapshot: () => {
      callbacks.snapshots += 1;
    },
    onStreamTextDelta: (delta: string) => callbacks.deltas.push(delta),
    onStreamToolCall: (call: unknown) => callbacks.toolCalls.push(call),
    tools: [{ name: "tool-alpha" }],
    traceContext: trace,
    ...fields,
  } as never;
  return { callbacks, fake, harness, options };
};

test("B2 流式事件映射与终止语义", async () => {
  // 全 kind 映射 + 缓冲冲刷先于 tool_call + 重复 toolCallId 去重。
  const script = [
    { type: "start" },
    { type: "text_start" },
    { type: "text_delta", text: "Hel" },
    { type: "text_delta", text: "lo" },
    { type: "text_end" },
    { type: "reasoning_start", id: "r1", providerMetadata: { vendor: "alpha" } },
    { type: "reasoning_delta", id: "r1", text: "think" },
    { type: "reasoning_end", id: "r1" },
    { type: "tool_input_start", id: "call-1", toolName: "tool-alpha", providerExecuted: false },
    { type: "tool_input_delta", id: "call-1", delta: '{"a"' },
    { type: "tool_input_delta", id: "call-1", delta: ":1}" },
    { type: "tool_call", toolCall: { id: "call-1", name: "tool-alpha", input: { a: 1 } } },
    { type: "tool_call", toolCall: { id: "call-1", name: "tool-alpha", input: { a: 1 } } },
    {
      type: "finish",
      finishReason: "stop",
      usage: { totalTokens: 7 },
      providerMetadata: { raw: 1 },
    },
  ];
  const { callbacks, fake, harness, options } = runOptions(script);
  const result = await modelRequest.runModelTextRequest.call(fake.runtime, options);

  assert.deepEqual(
    fake.journal.filter((line) => line.startsWith("enter:emit:") || line.startsWith("exit:emit:")),
    [
      "enter:emit:start",
      "exit:emit:start",
      "enter:emit:text_start",
      "exit:emit:text_start",
      "enter:emit:text_delta",
      "exit:emit:text_delta",
      "enter:emit:text_delta",
      "exit:emit:text_delta",
      "enter:emit:text_end",
      "exit:emit:text_end",
      "enter:emit:reasoning_start",
      "exit:emit:reasoning_start",
      "enter:emit:reasoning_delta",
      "exit:emit:reasoning_delta",
      "enter:emit:reasoning_end",
      "exit:emit:reasoning_end",
      "enter:emit:tool_input_start",
      "exit:emit:tool_input_start",
      "enter:emit:tool_input_delta",
      "exit:emit:tool_input_delta",
      "enter:emit:tool_call",
      "exit:emit:tool_call",
      "enter:emit:finish",
      "exit:emit:finish",
    ],
    "消费顺序即适配器产生序；同一 tool_call 的缓冲冲刷先于 tool_call 入队；重复 id 不重复入账",
  );
  assert.deepEqual(callbacks.deltas, ["Hel", "lo"]);
  assert.deepEqual(callbacks.reasoningDeltas, ["think"]);
  assert.equal(callbacks.snapshots, 3, "text/reasoning delta 各触发快照回调");
  assert.equal(callbacks.toolCalls.length, 1);
  assert.equal(result.text, "Hello");
  assert.equal(result.finishReason, "stop");
  assert.deepEqual(result.usage, { totalTokens: 7 });
  assert.deepEqual(result.providerMetadata, { raw: 1 });
  assert.deepEqual(
    (result.reasoning as { text: string }[]).map((block) => block.text),
    ["think"],
  );
  assert.deepEqual(
    (result.toolCalls as { id: string }[]).map((call) => call.id),
    ["call-1"],
  );
  assert.equal("contextUsageBreakdown" in result, false, "空用量分解不附加键");

  // error：先冲刷全部缓冲再入终止事件，随后抛归一化错误。
  const failing = runOptions([
    { type: "tool_input_start", id: "call-2", toolName: "tool-alpha", providerExecuted: false },
    { type: "tool_input_delta", id: "call-2", delta: "buffered" },
    { type: "error", error: new Error("stream broke") },
  ]);
  await assert.rejects(
    modelRequest.runModelTextRequest.call(failing.fake.runtime, failing.options),
  );
  assert.deepEqual(
    failing.fake.journal.filter((line) => line.startsWith("enter:emit:")),
    ["enter:emit:tool_input_start", "enter:emit:tool_input_delta", "enter:emit:error"],
    "error 先冲刷缓冲再入终止事件",
  );
  assert.equal(failing.fake.journal.at(-1), "exit:emit:error", "终止事件落盘完成后才抛");

  // finish 同样先冲刷全部缓冲。
  const finishing = runOptions([
    { type: "tool_input_start", id: "call-3", toolName: "tool-alpha", providerExecuted: false },
    { type: "tool_input_delta", id: "call-3", delta: "tail" },
    { type: "finish", finishReason: "stop", usage: {} },
  ]);
  await modelRequest.runModelTextRequest.call(finishing.fake.runtime, finishing.options);
  assert.deepEqual(
    finishing.fake.journal.filter((line) => line.startsWith("enter:emit:")),
    ["enter:emit:tool_input_start", "enter:emit:tool_input_delta", "enter:emit:finish"],
  );

  // 循环内异常（含队列写入失败）：drain 后原样重抛。
  const broken = runOptions([{ type: "start" }, { type: "text_delta", text: "x" }]);
  const boom = new Error("queue write broke");
  broken.fake.failNextEmit(boom);
  await assert.rejects(
    modelRequest.runModelTextRequest.call(broken.fake.runtime, broken.options),
    boom,
  );

  // 流式分支：toolCalls/reasoning 为空时省略该键。
  const empty = runOptions([
    { type: "text_delta", text: "plain" },
    { type: "finish", finishReason: "stop", usage: {} },
  ]);
  const emptyResult = await modelRequest.runModelTextRequest.call(
    empty.fake.runtime,
    empty.options,
  );
  assert.equal(emptyResult.toolCalls, undefined, "流式分支无工具调用时 toolCalls 为 undefined");
  assert.equal(emptyResult.reasoning, undefined, "流式分支无推理块时 reasoning 为 undefined");
});

test("B1 请求组装与投影管线", async () => {
  // 组装出的请求只含 messages/tools/abortSignal；maxOutputTokens 条件附加。
  const stream = runOptions([{ type: "finish", finishReason: "stop", usage: {} }]);
  await modelRequest.runModelTextRequest.call(stream.fake.runtime, stream.options);
  const streamRequest = stream.harness.captured.stream as Record<string, unknown>;
  assert.deepEqual(Object.keys(streamRequest), ["messages", "tools", "abortSignal"]);
  assert.equal(streamRequest.messages, baseMessages, "投影未改动消息时保持原对象");
  assert.deepEqual(streamRequest.tools, [{ name: "tool-alpha" }]);
  assert.equal("options" in streamRequest, false, "maxOutputTokens 缺省不附加");

  const budgeted = runOptions([{ type: "finish", finishReason: "stop", usage: {} }], {
    maxOutputTokens: 4_096,
  });
  await modelRequest.runModelTextRequest.call(budgeted.fake.runtime, budgeted.options);
  assert.deepEqual((budgeted.harness.captured.stream as { options: unknown }).options, {
    maxOutputTokens: 4_096,
  });

  // 非流式二分：走 generateText，toolCalls 归一后返回。
  const generated = runOptions(
    [],
    {},
    {
      finishReason: "stop",
      text: "answer",
      toolCalls: [{ id: "call-g", name: "tool-alpha", input: { q: 2 } }],
      usage: {},
    },
  );
  generated.fake.preferStreaming(false);
  const generatedResult = await modelRequest.runModelTextRequest.call(
    generated.fake.runtime,
    generated.options,
  );
  const generateRequest = generated.harness.captured.generate as Record<string, unknown>;
  assert.deepEqual(Object.keys(generateRequest), ["messages", "tools", "abortSignal"]);
  assert.deepEqual(
    (generatedResult.toolCalls as { id: string }[]).map((call) => call.id),
    ["call-g"],
  );
  assert.equal(generatedResult.text, "answer");
});

test("B5 请求头刷新钩子", async () => {
  const headers = await methods("model-runtime-headers");
  const modelRef = { modelId: "model-contract", providerId: "provider-contract" };

  // 端口缺席不装钩子。
  const bare = createMethodsRuntime();
  assert.equal(
    headers.createRefreshRuntimeHeadersBeforeModelAttempt(bare.runtime, {
      model: modelRef,
      traceContext: trace,
    }),
    undefined,
  );

  // 显式 false 不装钩子。
  const refused = createMethodsRuntime();
  (refused.runtime as unknown as Record<string, unknown>).providerRuntimeHeadersPort = {
    shouldRefreshBeforeModelRequest: () => false,
  };
  assert.equal(
    headers.createRefreshRuntimeHeadersBeforeModelAttempt(refused.runtime, {
      model: modelRef,
      traceContext: trace,
    }),
    undefined,
  );

  const calls: Record<string, unknown>[] = [];
  const fake = createMethodsRuntime();
  (fake.runtime as unknown as Record<string, unknown>).providerRuntimeHeadersPort = {
    async refreshBeforeModelRequest(input: Record<string, unknown>) {
      calls.push(input);
      return { headersApplied: true, requestAuth: { token: "contract-token" } };
    },
    shouldRefreshBeforeModelRequest: undefined,
  };
  const refresh = headers.createRefreshRuntimeHeadersBeforeModelAttempt(fake.runtime, {
    abortSignal: undefined,
    model: modelRef,
    traceContext: trace,
  });
  assert.equal(typeof refresh, "function", "缺省 shouldRefresh 视为 true");
  const attemptSignal = new AbortController().signal;
  const applied = await refresh?.({ attempt: 2, abortSignal: attemptSignal });
  assert.deepEqual(applied, { headersApplied: true, requestAuth: { token: "contract-token" } });
  assert.deepEqual(calls[0], {
    accountAccess: undefined,
    abortSignal: attemptSignal,
    modelId: "model-contract",
    providerId: "provider-contract",
    reason: "model-request",
    sessionId: "session-contract-0001",
    traceContext: trace,
    turnId: "turn-contract-0001",
  });
  const refreshedLog = fake.logger.records.at(-1);
  assert.equal(
    refreshedLog?.message,
    "Provider runtime headers refreshed before model request attempt",
  );
  assert.equal(
    (refreshedLog?.context[0] as { event: string }).event,
    "model.request.runtime_headers_refreshed",
  );
  assert.equal((refreshedLog?.context[0] as { attempt: number }).attempt, 2);
  assert.equal((refreshedLog?.context[0] as { headersApplied: boolean }).headersApplied, true);

  // headersApplied 非真抛固定文案。
  const unapplied = createMethodsRuntime();
  (unapplied.runtime as unknown as Record<string, unknown>).providerRuntimeHeadersPort = {
    async refreshBeforeModelRequest() {
      return { headersApplied: false };
    },
  };
  const failingRefresh = headers.createRefreshRuntimeHeadersBeforeModelAttempt(unapplied.runtime, {
    model: modelRef,
    traceContext: trace,
  });
  await assert.rejects(
    failingRefresh?.({ attempt: 1 }),
    new Error("Provider runtime headers were not applied before model request attempt."),
  );
  assert.deepEqual(unapplied.logger.records, [], "抛错不打日志");
});

test("B6 状态 sink 与七类状态日志", async () => {
  const statusModule = await methods("model-status");
  const wire = (fake: FakeMethodsRuntime) => {
    (fake.runtime as unknown as Record<string, unknown>).logModelNetworkStatus = (
      event: unknown,
      traceContext: unknown,
    ) => statusModule.logModelNetworkStatus.call(fake.runtime, event, traceContext);
  };

  // publish 五步顺序：onStatus → 日志 → 持久化 → events.push。
  const fake = createMethodsRuntime();
  wire(fake);
  const seen: Record<string, unknown>[] = [];
  const sink = statusModule.createModelStatusSink.call(fake.runtime, trace, [] as unknown[], {
    onStatus: (event: Record<string, unknown>) => seen.push(event),
    streamRecovery: { anchorId: "anchor-1", maxRetries: 10, retryNumber: 1 },
  }) as { publish(event: Record<string, unknown>): Promise<void> };
  const gate = fake.gateNextAppend();
  const pending = sink.publish({
    type: "model_request_started",
    attempt: 1,
    baseURL: "https://provider.invalid",
    maxAttempts: 3,
    modelId: "model-contract",
    providerId: "provider-contract",
    providerKind: "openai-compatible",
    requestId: "req-0001",
    transport: "https",
  });
  assert.equal(seen.length, 1, "①② 载荷合并 streamRecovery 后先回调 onStatus");
  assert.equal(
    (seen[0] as { streamRecovery?: { anchorId: string } }).streamRecovery?.anchorId,
    "anchor-1",
  );
  assert.equal(fake.logger.records.length, 1, "③ 日志在持久化之前");
  assert.equal(fake.appended.length, 0, "④ 持久化未完成前 events 不入数组");
  gate.close();
  await pending;
  assert.equal(fake.appended.length, 1);
  const persisted = fake.appended[0] as unknown as {
    payload: Record<string, unknown>;
    type: string;
  };
  assert.equal(persisted.type, String(SessionEventType.ModelNetworkStatus));
  assert.deepEqual(persisted.payload, seen[0], "⑤ 持久化的就是合并后的载荷");

  // 七类 type 的 level/label/event 与字段逐个对。
  const table: [
    string,
    string,
    string,
    Record<string, unknown>,
    (ctx: Record<string, unknown>) => void,
  ][] = [
    [
      "model_request_queued",
      "debug",
      "Model network request queued for admission",
      {},
      (c) => {
        assert.equal(c.event, "model.network.queued");
        assert.equal(c.status, "waiting");
      },
    ],
    [
      "model_request_admitted",
      "debug",
      "Model network request admitted",
      { queuedMs: 120 },
      (c) => {
        assert.equal(c.event, "model.network.admitted");
        assert.equal(c.queuedMs, 120);
        assert.equal(c.status, "started");
      },
    ],
    [
      "model_request_started",
      "debug",
      "Model network request started",
      {},
      (c) => {
        assert.equal(c.event, "model.network.started");
        assert.equal(c.status, "started");
      },
    ],
    [
      "model_request_completed",
      "info",
      "Model network request completed",
      { durationMs: 900, finishReason: "stop" },
      (c) => {
        assert.equal(c.event, "model.network.completed");
        assert.equal(c.durationMs, 900);
        assert.equal(c.finishReason, "stop");
        assert.equal(c.status, "completed");
      },
    ],
    [
      "model_request_failed",
      "warn",
      "Model network request failed",
      {
        durationMs: 50,
        reason: "network_error",
        retryable: true,
        statusCode: 502,
        message: "bad gateway",
      },
      (c) => {
        assert.equal(c.event, "model.network.failed");
        assert.equal(c.status, "failed");
        assert.equal(c.reason, "network_error");
        assert.equal(c.retryable, true);
        assert.equal(c.statusCode, 502);
        assert.equal(c.statusMessage, "bad gateway");
      },
    ],
    [
      "model_request_failed",
      "warn",
      "Model network request failed",
      {
        durationMs: 5,
        reason: "cancelled",
        retryable: false,
        statusCode: 499,
        message: "cancelled by user",
      },
      (c) => {
        assert.equal(c.status, "cancelled", "reason=cancelled 时 status 归 cancelled");
      },
    ],
    [
      "model_retry_scheduled",
      "warn",
      "Model network retry scheduled",
      {
        delayMs: 1_000,
        nextAttempt: 2,
        reason: "rate_limited",
        statusCode: 429,
        message: "slow down",
      },
      (c) => {
        assert.equal(c.event, "model.network.retry_scheduled");
        assert.equal(c.delayMs, 1_000);
        assert.equal(c.nextAttempt, 2);
        assert.equal(c.status, "waiting");
        assert.equal(c.statusMessage, "slow down");
      },
    ],
    [
      "model_stream_stalled",
      "warn",
      "Model network stream stalled",
      { idleMs: 30_000, timeoutMs: 60_000, message: "stream idle" },
      (c) => {
        assert.equal(c.event, "model.network.stream_stalled");
        assert.equal(c.idleMs, 30_000);
        assert.equal(c.timeoutMs, 60_000);
        assert.equal(c.status, "waiting");
        assert.equal(c.statusMessage, "stream idle");
      },
    ],
  ];
  for (const [type, level, label, fields, check] of table) {
    const entry = createMethodsRuntime();
    wire(entry);
    const entrySink = statusModule.createModelStatusSink.call(
      entry.runtime,
      trace,
      [] as unknown[],
    ) as { publish(event: Record<string, unknown>): Promise<void> };
    await entrySink.publish({
      type,
      attempt: 4,
      baseURL: "https://provider.invalid",
      maxAttempts: 6,
      modelId: "model-contract",
      providerId: "provider-contract",
      providerKind: "anthropic-compatible",
      requestId: "req-0002",
      transport: "sse",
      ...fields,
    } as Record<string, unknown>);
    const [record] = entry.logger.records;
    assert.equal(record.level, level, `${type} 日志级别`);
    assert.equal(record.message, label, `${type} 日志文案`);
    const context = record.context[0] as Record<string, unknown>;
    assert.equal(context.module, "core.runtime");
    assert.equal(context.attempt, 4);
    assert.equal(context.baseURL, "https://provider.invalid");
    assert.equal(context.maxAttempts, 6);
    assert.equal(context.modelId, "model-contract");
    assert.equal(context.providerId, "provider-contract");
    assert.equal(context.providerKind, "anthropic-compatible");
    assert.equal(context.requestId, "req-0002");
    assert.equal(context.transport, "sse");
    check(context);
    assert.equal(entry.appended.length, 1);
  }

  // streamRecovery 元数据字段映射。
  const recoveryRun = createMethodsRuntime();
  wire(recoveryRun);
  const recoverySink = statusModule.createModelStatusSink.call(
    recoveryRun.runtime,
    trace,
    [] as unknown[],
    {
      streamRecovery: {
        anchorId: "anchor-9",
        maxRetries: 10,
        recoveredFromRequestId: "req-old",
        retryNumber: 3,
      },
    },
  ) as { publish(event: Record<string, unknown>): Promise<void> };
  await recoverySink.publish({
    type: "model_request_started",
    attempt: 1,
    modelId: "m",
    providerId: "p",
    streamRecovery: {
      anchorId: "anchor-9",
      maxRetries: 10,
      recoveredFromRequestId: "req-old",
      retryNumber: 3,
    },
  } as Record<string, unknown>);
  const recoveryContext = recoveryRun.logger.records[0].context[0] as Record<string, unknown>;
  assert.equal(recoveryContext.streamRecoveryAnchorId, "anchor-9");
  assert.equal(recoveryContext.streamRecoveryFromRequestId, "req-old");
  assert.equal(recoveryContext.streamRecoveryMaxRetries, 10);
  assert.equal(recoveryContext.streamRecoveryRetryNumber, 3);

  // 未知 type 只走公共元数据、不打类型日志；appendEvent 失败原样冒泡（先观测后持久化）。
  const unknownType = createMethodsRuntime();
  wire(unknownType);
  const unknownSink = statusModule.createModelStatusSink.call(
    unknownType.runtime,
    trace,
    [] as unknown[],
  ) as { publish(event: Record<string, unknown>): Promise<void> };
  await unknownSink.publish({
    type: "model_request_mystery",
    attempt: 1,
    modelId: "m",
    providerId: "p",
  });
  assert.deepEqual(unknownType.logger.records, [], "未知 type 不打类型日志");
  assert.equal(unknownType.appended.length, 1, "事件仍持久化");

  const failedPersist = createMethodsRuntime();
  wire(failedPersist);
  const failedSink = statusModule.createModelStatusSink.call(
    failedPersist.runtime,
    trace,
    [] as unknown[],
  ) as { publish(event: Record<string, unknown>): Promise<void> };
  failedPersist.failNextAppend(new Error("persist broke"));
  await assert.rejects(
    failedSink.publish({
      type: "model_request_started",
      attempt: 1,
      modelId: "m",
      providerId: "p",
    }),
    /persist broke/,
  );
  assert.equal(failedPersist.logger.records.length, 1, "onStatus 与日志已完成——先观测后持久化");
});

test("B12 运行时模型句柄与调用上下文合并", async () => {
  const runtimeModel = await methods("runtime-model");
  const deps = await coreDeps();
  const captured: unknown[] = [];
  const inner = {
    providerId: "provider-contract",
    modelId: "model-contract",
    displayName: "Contract Model",
    properties: { contextWindow: 128_000 },
    optionSpecs: [],
    options: {},
    bind(this: Record<string, unknown>, bindOptions: unknown) {
      return { ...this, options: bindOptions };
    },
    async generateText() {
      captured.push(deps.getCurrentModelInvocationContext());
      return { finishReason: "stop", text: "", toolCalls: [], usage: {} };
    },
    async *streamText() {
      captured.push(deps.getCurrentModelInvocationContext());
    },
  };

  // 选择缺失抛 ConfigurationError（recoverable: true）。
  const bare = createMethodsRuntime();
  (bare.runtime as unknown as Record<string, unknown>).modelFactory = () => inner;
  assert.throws(
    () => runtimeModel.createRuntimeModel(bare.runtime, { selection: undefined } as never),
    (error: { message?: string; recoverable?: boolean; type?: string }) => {
      assert.equal(error.type, CoreErrorType.ConfigurationError);
      assert.equal(error.message, "Select a model before continuing");
      assert.equal(error.recoverable, true);
      return true;
    },
  );

  // 句柄工厂绑定一次：workflow child 的 Unbounded 预算 + 准入端口透传。
  (bare.runtime.config as Record<string, unknown>).taskType = "workflow_child";
  (bare.runtime as unknown as Record<string, unknown>).modelRequestAdmission = { gate: "contract" };
  const handle = runtimeModel.createRuntimeModel(bare.runtime, {
    selection: { modelId: "model-contract", providerId: "provider-contract" },
  } as never);
  assert.equal(handle.providerId, "provider-contract");
  assert.equal(handle.modelId, "model-contract");
  assert.equal(handle.displayName, "Contract Model");
  assert.equal(Object.isFrozen(handle), true, "包装对象冻结不可变");
  await handle.generateText({} as never);
  const boundContext = captured.at(-1) as Record<string, unknown>;
  assert.equal(boundContext.modelRetryBudget, ModelRetryBudget.Unbounded);
  assert.deepEqual(boundContext.modelRequestAdmission, { gate: "contract" });

  // 合并语义：包装层 createContext 后写压过调用层。
  const wrapped = runtimeModel.withModelInvocationContext(inner, () => ({
    modelRetryBudget: ModelRetryBudget.Default,
  }));
  await deps.runWithModelInvocationContext({ modelRetryBudget: ModelRetryBudget.Unbounded }, () =>
    wrapped.generateText({} as never),
  );
  assert.equal(
    (captured.at(-1) as { modelRetryBudget: unknown }).modelRetryBudget,
    ModelRetryBudget.Default,
    "包装层 createContext 后写压过调用层",
  );

  // bind 递归再包同一上下文层。
  const bound = wrapped.bind({ temperature: 0.2 } as never);
  assert.equal(Object.isFrozen(bound), true);
  await bound.generateText({} as never);
  assert.equal(
    (captured.at(-1) as { modelRetryBudget: unknown }).modelRetryBudget,
    ModelRetryBudget.Default,
    "bind 结果仍带同一上下文层",
  );
});

test("B1 模型请求/响应投影金样往返", async () => {
  const golden = JSON.parse(
    readFileSync(join(contractDir, "fixtures/model-request-roundtrip.json"), "utf8"),
  ) as {
    emitted: { done: boolean; kind: string }[];
    request: { keys: string[]; messagesIdentityPreserved: boolean; tools: unknown };
    result: Record<string, unknown>;
    script: unknown[];
  };
  const messages = [
    { role: "system", content: "Fictional system prompt." },
    { role: "user", content: "Fictional user question." },
  ];
  const tools = [{ name: "lookup", description: "Fictional lookup tool." }];
  const fake = createMethodsRuntime();
  const events: unknown[] = [];
  let captured: Record<string, unknown> = {};
  const replayModel = {
    providerId: "provider-fixture",
    modelId: "model-fixture",
    properties: { contextWindow: 128_000 },
    async *streamText(request: unknown) {
      captured = request as Record<string, unknown>;
      for (const event of golden.script) yield event;
    },
  };
  const result = (await modelRequest.runModelTextRequest.call(fake.runtime, {
    abortSignal: undefined,
    assistantMessageId: "assistant-msg-0001",
    events,
    messages,
    model: replayModel,
    tools,
    traceContext: trace,
  } as never)) as Record<string, unknown>;
  assert.deepEqual(Object.keys(captured), golden.request.keys);
  assert.equal(captured.messages === messages, golden.request.messagesIdentityPreserved);
  assert.deepEqual(captured.tools, golden.request.tools);
  assert.deepEqual(
    events.map((event) => {
      const payload = (event as { payload: { done?: boolean; kind: string } }).payload;
      return { done: payload.done ?? false, kind: payload.kind };
    }),
    golden.emitted,
    "流事件→队列载荷序列与金样一致",
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify({
        finishReason: result.finishReason,
        providerMetadata: result.providerMetadata,
        reasoning: result.reasoning,
        text: result.text,
        toolCalls: result.toolCalls,
        usage: result.usage,
      }),
    ),
    golden.result,
    "响应投影与金样一致",
  );
});
