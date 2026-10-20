// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02 B4/B5/B6/B7：交付裁决、回退原因、过期 Stop 与 compact 的命令标识。
//
// 断言对象是 `DefaultKernelTurnExecutor` 的可观察行为：它把 v4 意图翻成 DSH 会话
// 操作。用假 Agent（记录 inbox.append 的目标）与假 compaction 服务，
// 不触碰真实 DSH 运行时，也不依赖模型。
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { repoRoot } from "./entry.mjs";

/** 执行器模块源码入口。 */
const EXECUTOR_MODULE = join(
  repoRoot,
  "apps/cli/packages/bootstrap/src/kernel-bridge/turn-executor.ts",
);

/**
 * 载入执行器模块。
 *
 * @returns 该模块的命名空间。
 */
async function loadExecutorModule() {
  return import(pathToFileURL(EXECUTOR_MODULE).href);
}

/** 造一个假 Agent：记录收件箱追加的目标，并记录 cancel 调用。 */
function fakeAgent() {
  const appended = [];
  const cancelled = [];
  const inbox = {
    nextTurn: [],
    nextStep: [],
    append(target, message) {
      appended.push({ target, message });
      // 维护两个队列长度，供 queuePosition 断言。
      if (target === "next-turn") inbox.nextTurn.push(message);
      else inbox.nextStep.push(message);
    },
  };
  return {
    appended,
    cancelled,
    agent: {
      inbox,
      cancel(cause, options) {
        cancelled.push({ cause, options });
      },
    },
  };
}

/**
 * 造一个带假 Agent 的宿主。
 *
 * @param options.running - 该会话是否在跑。
 * @param options.foregroundExecutionId - 当前前台执行标识。
 * @returns 宿主 + 假 Agent 的观察面。
 */
function fakeHost(options = {}) {
  const fake = fakeAgent();
  return {
    ...fake,
    host: {
      agentFor: () => fake.agent,
      foregroundExecutionIdFor: () => options.foregroundExecutionId,
      isRunning: () => options.running ?? false,
      registerSession() {},
    },
  };
}

/** 假的 compaction 服务：记录 compactNow 的三个实参。 */
function fakeCompaction() {
  const calls = [];
  return {
    calls,
    service: {
      async compactNow(agent, signal, sourceCommandId) {
        calls.push({ agent, signal, sourceCommandId });
        return null;
      },
    },
  };
}

/**
 * 造一个只填了所需 capacity 的最小 context。
 *
 * @param services - 要挂的服务（例如 `compaction`）。
 * @returns 类 Context 的对象。
 */
function fakeContext(services) {
  return {
    get(name) {
      return services[name];
    },
  };
}

test("B4 空闲时 sendText(startNow) 裁决为 startNow 且不排队", async () => {
  const { DefaultKernelTurnExecutor } = await loadExecutorModule();
  const { host, appended } = fakeHost({ running: false });
  const executor = new DefaultKernelTurnExecutor(fakeContext({}), host);
  const result = await executor.sendText({
    sessionId: "sess_1",
    text: "hello",
    requestedDelivery: "startNow",
  });
  assert.equal(result.admitted, "startNow", "空闲会话的 startNow 必须裁决为 startNow");
  assert.equal(result.queuePosition, 0, "不排队时 queuePosition 为 0");
  assert.equal(result.fallbackReasonCode, undefined, "未退化时不得给回退原因");
  assert.deepEqual(
    appended.map((entry) => entry.target),
    ["next-turn"],
    "startNow 走 next-turn（DSH 侧「下一回合」即「现在」）",
  );
});

test("B4 忙碌时 sendText(startNow) 退化为 queue 并给出回退原因（协议留好的表达）", async () => {
  const { DefaultKernelTurnExecutor } = await loadExecutorModule();
  const { host } = fakeHost({ running: true });
  const executor = new DefaultKernelTurnExecutor(fakeContext({}), host);
  const result = await executor.sendText({
    sessionId: "sess_1",
    text: "hello",
    requestedDelivery: "startNow",
  });
  assert.equal(result.admitted, "queue", "忙碌时不得谎报 startNow");
  assert.equal(
    result.fallbackReasonCode,
    "input.start_now_busy",
    "退化必须给出原因码（协议 conversationInputDeliverySchema 自带该字段）",
  );
  assert.ok(result.queuePosition > 0, "入队后 queuePosition 必须为正");
});

test("B5 运行中 sendText(guide) 走下一步边界（steer），不新起回合", async () => {
  const { DefaultKernelTurnExecutor } = await loadExecutorModule();
  const { host, appended } = fakeHost({ running: true });
  const executor = new DefaultKernelTurnExecutor(fakeContext({}), host);
  const result = await executor.sendText({
    sessionId: "sess_1",
    text: "steer me",
    requestedDelivery: "guide",
  });
  assert.equal(result.admitted, "guide", "运行中 guide 必须裁决为 guide");
  assert.equal(result.fallbackReasonCode, undefined, "成功 steer 不得给回退原因");
  assert.deepEqual(
    appended.map((entry) => entry.target),
    ["next-step"],
    "guide 走 next-step（DSH steering 通道），不是 next-turn",
  );
});

test("B5 空闲时 sendText(guide) 退化为 queue 并给出回退原因", async () => {
  const { DefaultKernelTurnExecutor } = await loadExecutorModule();
  const { host } = fakeHost({ running: false });
  const executor = new DefaultKernelTurnExecutor(fakeContext({}), host);
  const result = await executor.sendText({
    sessionId: "sess_1",
    text: "steer me",
    requestedDelivery: "guide",
  });
  assert.equal(result.admitted, "queue", "没有运行中回合时 guide 只能是 queue");
  assert.equal(result.fallbackReasonCode, "input.guide_without_active_turn", "退化必须给出原因码");
});

test("B6 过期 Stop：命令仍 accepted，但 stopped 为 false 且不动任何状态", async () => {
  const { DefaultKernelTurnExecutor } = await loadExecutorModule();
  const { host, cancelled } = fakeHost({
    running: true,
    foregroundExecutionId: "exec-current",
  });
  const executor = new DefaultKernelTurnExecutor(fakeContext({}), host);
  const result = await executor.stop({
    sessionId: "sess_1",
    expectedForegroundExecutionId: "exec-stale",
  });
  // 旧引擎语义：过期 Stop 静默成功、不报错——所以这里是「正常返回 + stopped:false」，
  // 不是抛错、也不是忽略请求。
  assert.equal(result.stopped, false, "过期 Stop 不得停止任何东西");
  assert.equal(result.sessionId, "sess_1");
  assert.deepEqual(cancelled, [], "过期 Stop 不得触达 agent.cancel（防误杀后续执行）");
});

test("B6 匹配的 Stop 触达 agent.cancel 且带 keepInbox", async () => {
  const { DefaultKernelTurnExecutor } = await loadExecutorModule();
  const { host, cancelled } = fakeHost({
    running: true,
    foregroundExecutionId: "exec-current",
  });
  const executor = new DefaultKernelTurnExecutor(fakeContext({}), host);
  const result = await executor.stop({
    sessionId: "sess_1",
    expectedForegroundExecutionId: "exec-current",
  });
  assert.equal(result.stopped, true, "匹配的 Stop 必须真的停止");
  assert.equal(cancelled.length, 1, "必须触达 agent.cancel");
  assert.deepEqual(cancelled[0].cause, { kind: "user" }, "取消原因归 'user' 类别");
  assert.equal(cancelled[0].options.keepInbox, true, "v4 协议面不清队列（D3），按保留队列实现");
});

test("B6 无活动回合时 Stop 是空操作而非错误", async () => {
  const { DefaultKernelTurnExecutor } = await loadExecutorModule();
  const { host, cancelled } = fakeHost({ running: false });
  const executor = new DefaultKernelTurnExecutor(fakeContext({}), host);
  const result = await executor.stop({ sessionId: "sess_1" });
  assert.equal(result.stopped, false, "无活动回合时 stopped 为 false");
  assert.deepEqual(cancelled, [], "无活动回合时不得调 cancel");
});

test("B7b v4 compact 把 commandId 作为 sourceCommandId 传给 DSH", async () => {
  const { DefaultKernelTurnExecutor } = await loadExecutorModule();
  const { host } = fakeHost({ running: false });
  const compaction = fakeCompaction();
  const executor = new DefaultKernelTurnExecutor(
    fakeContext({ compaction: compaction.service }),
    host,
  );
  const result = await executor.compact({
    sessionId: "sess_1",
    sourceCommandId: "cmd-42",
  });
  assert.equal(result.compacted, true, "compact 必须报告已执行");
  assert.equal(compaction.calls.length, 1, "必须调一次 DSH 压缩服务");
  assert.equal(
    compaction.calls[0].sourceCommandId,
    "cmd-42",
    "v4 路径必须把 commandId 作为 sourceCommandId 传下去",
  );
  assert.ok(
    compaction.calls[0].signal instanceof AbortSignal,
    "compactNow 的第二个实参必须是 AbortSignal",
  );
});

test("B7b 旧协议 compact 省略 sourceCommandId（D23，不是漏传）", async () => {
  const { DefaultKernelTurnExecutor } = await loadExecutorModule();
  const { host } = fakeHost({ running: false });
  const compaction = fakeCompaction();
  const executor = new DefaultKernelTurnExecutor(
    fakeContext({ compaction: compaction.service }),
    host,
  );
  await executor.compact({ sessionId: "sess_1" });
  assert.equal(
    compaction.calls[0].sourceCommandId,
    undefined,
    "旧协议没有 v4 commandId，因此省略（known-differences D23）",
  );
});

test("B7b 压缩服务缺席时抛能力缺席错误（不伪造成功）", async () => {
  const { DefaultKernelTurnExecutor, TurnCapabilityUnavailableError } = await loadExecutorModule();
  const { host } = fakeHost({ running: false });
  const executor = new DefaultKernelTurnExecutor(fakeContext({}), host);
  await assert.rejects(
    () => executor.compact({ sessionId: "sess_1" }),
    (error) => error instanceof TurnCapabilityUnavailableError,
    "压缩服务缺席必须抛能力缺席，而不是假装压缩成功",
  );
});

test("B2 无活动 Agent 时 sendText 抛会话不可用（不伪造成功）", async () => {
  const { DefaultKernelTurnExecutor, TurnSessionUnavailableError } = await loadExecutorModule();
  const host = {
    agentFor: () => undefined,
    foregroundExecutionIdFor: () => undefined,
    isRunning: () => false,
    registerSession() {},
  };
  const executor = new DefaultKernelTurnExecutor(fakeContext({}), host);
  await assert.rejects(
    () => executor.sendText({ sessionId: "sess_missing", text: "hi" }),
    (error) => error instanceof TurnSessionUnavailableError,
    "会话没有活动 Agent 时必须抛错",
  );
});
