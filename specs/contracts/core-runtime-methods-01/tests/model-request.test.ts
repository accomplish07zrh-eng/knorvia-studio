// SPDX-License-Identifier: Apache-2.0
// core-runtime-methods-01 契约测试：请求元数据、限额、流式队列与流状态（B3/B4/B7–B11）。
// B7 的进入顺序与背压用 gate 握手断言，无 sleep、无固定超时。
import assert from "node:assert/strict";
import test from "node:test";
import { contractsBundle, coreDeps, methods } from "./entry.mjs";
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
