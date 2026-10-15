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
