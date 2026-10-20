// SPDX-License-Identifier: Apache-2.0
// A69–A70：后台会话事件合并器的 key 规则、delta 拼接、flush 边界与 dispose 幂等。
// 时序断言用「显式 flush + flushDelayMs<=0 立即 flush」两条确定性路径，不用 sleep。
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { importDeep } from "./entry.mjs";

const { createBackgroundSessionEventCoalescer } = await importDeep(
  "agent/sessionEventCoalescer.ts",
);

/** 造一条 `session.event` 包装。 */
const sessionEvent = (event) => ({ type: "session.event", event });

const streaming = (delta, extra = {}) =>
  sessionEvent({
    type: "model.streaming",
    sessionId: "s-1",
    turnId: "t-1",
    payload: { kind: "text_delta", delta, inputId: "i-1", assistantMessageId: "a-1", ...extra },
  });

/**
 * 收集 emit 到数组。默认给一个远大于测试时长的 flushDelayMs，
 * 让合并行为只由显式 flush() 驱动（不用 sleep 凑时序）。
 */
function collector(options = {}) {
  const seen = [];
  const coalescer = createBackgroundSessionEventCoalescer({
    emit: (event) => seen.push(event),
    flushDelayMs: 60_000,
    ...options,
  });
  return { coalescer, seen };
}

describe("A69 合并键与 delta 拼接", () => {
  it("同 key 的 text_delta 按到达序拼接，不同 kind 各自成 key", () => {
    const { coalescer, seen } = collector();
    coalescer.accept(streaming("he"));
    coalescer.accept(streaming("llo"));
    assert.deepEqual(seen, [], "定时器未到不 emit");
    coalescer.flush();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].event.payload.delta, "hello", "同 key 的 delta 按到达序拼接");

    const second = collector();
    second.coalescer.accept(streaming("a"));
    second.coalescer.accept(streaming("b", { kind: "reasoning_delta" }));
    second.coalescer.accept(streaming("c", { kind: "tool_input_delta" }));
    second.coalescer.flush();
    assert.deepEqual(
      second.seen.map((event) => [event.event.payload.kind, event.event.payload.delta]),
      [
        ["text_delta", "a"],
        ["reasoning_delta", "b"],
        ["tool_input_delta", "c"],
      ],
      "三种 delta kind 各自成 key，不互相拼接",
    );
  });

  it("不同 sessionId/turnId/toolCallId 不合并；tool.updated progress 与 streamRecovery.updated 也进表", () => {
    const { coalescer, seen } = collector();
    coalescer.accept(streaming("a"));
    coalescer.accept(streaming("b", { assistantMessageId: "a-2" }));
    coalescer.accept(
      sessionEvent({
        type: "tool.updated",
        sessionId: "s-1",
        turnId: "t-1",
        payload: { kind: "progress", inputId: "i-1", toolCallId: "c-1", progress: 1 },
      }),
    );
    coalescer.accept(
      sessionEvent({
        type: "tool.updated",
        sessionId: "s-1",
        turnId: "t-1",
        payload: { kind: "progress", inputId: "i-1", toolCallId: "c-1", progress: 2 },
      }),
    );
    coalescer.accept(
      sessionEvent({
        type: "streamRecovery.updated",
        sessionId: "s-1",
        turnId: "t-1",
        traceId: "tr-1",
        payload: { inputId: "i-1" },
      }),
    );
    coalescer.flush();
    assert.deepEqual(
      seen.map((event) => event.event.type),
      ["model.streaming", "model.streaming", "tool.updated", "streamRecovery.updated"],
      "不同 key 各一条；同 key 的 progress 覆盖成最新一条",
    );
    assert.equal(seen[2].event.payload.progress, 2);
    assert.equal(seen[0].event.payload.delta, "a");
    assert.equal(seen[1].event.payload.delta, "b");
  });

  it("不可合并的事件先 flush 已挂起批次再立即 emit，保持顺序", () => {
    const { coalescer, seen } = collector({ flushDelayMs: 60_000 });
    coalescer.accept(streaming("pend"));
    // 非 session.event 直接打断批次。
    coalescer.accept({ type: "session.updated", sessionId: "s-1" });
    assert.deepEqual(
      seen.map((event) => event.type),
      ["session.event", "session.updated"],
      "挂起批次先落地，再发不可合并事件",
    );
    assert.equal(seen[0].event.payload.delta, "pend");

    // key 为 undefined 的 session.event（缺 delta）同样先 flush 再直发。
    const second = collector({ flushDelayMs: 60_000 });
    second.coalescer.accept(streaming("pend"));
    second.coalescer.accept(sessionEvent({ type: "session.updated", sessionId: "s-1" }));
    assert.deepEqual(
      second.seen.map((event) => event.type),
      ["session.event", "session.event"],
      "第一条是挂起批次的包装，第二条是直发的不可合并事件（外层仍是 session.event）",
    );
    assert.equal(second.seen[0].event.payload.delta, "pend");
    assert.equal(second.seen[1].event.type, "session.updated");

    // kind 不在白名单里的 model.streaming 也不合并。
    const third = collector({ flushDelayMs: 60_000 });
    third.coalescer.accept(streaming("a"));
    third.coalescer.accept(streaming("b", { kind: "message_stop" }));
    assert.equal(third.seen.length, 2);
    assert.equal(third.seen[1].event.payload.delta, "b");
  });

  it("flushDelayMs 为正时到点整批 emit；不可合并事件打断批次并自己立即 emit", async () => {
    const seen = [];
    const coalescer = createBackgroundSessionEventCoalescer({
      emit: (event) => seen.push(event),
      flushDelayMs: 20,
    });
    coalescer.accept(streaming("a"));
    coalescer.accept(streaming("b"));
    assert.deepEqual(seen, [], "定时器未到不 emit");
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(seen.length, 1);
    assert.equal(seen[0].event.payload.delta, "ab", "定时器到点把整批合并后 emit");

    // 不可合并事件把已挂起批次先落地，再自己立即 emit。
    coalescer.accept(streaming("c"));
    coalescer.accept(sessionEvent({ type: "session.updated", sessionId: "s-1" }));
    assert.equal(seen.length, 3);
    assert.equal(seen[1].event.payload.delta, "c", "挂起批次先落地");
    assert.equal(seen[2].type, "session.event", "不可合并事件连外层包装一起原样 emit");
    assert.equal(seen[2].event.type, "session.updated");
  });
});

describe("A70 flush 边界与 dispose 幂等", () => {
  it("达到 maxItems 立即 flush 并清表；空表 flush 无副作用", () => {
    const { coalescer, seen } = collector({ maxItems: 3 });
    for (const id of ["a", "b", "c"]) {
      coalescer.accept(streaming(id, { assistantMessageId: id }));
    }
    assert.equal(seen.length, 3, "到 maxItems 立即整批 emit");
    coalescer.flush();
    assert.equal(seen.length, 3, "空表 flush 不再 emit");
  });

  it("dispose 先 flush 再置 disposed；之后 accept 是 no-op，重复 dispose 无副作用", () => {
    const { coalescer, seen } = collector();
    coalescer.accept(streaming("last"));
    coalescer.dispose();
    assert.equal(seen.length, 1, "dispose 把挂起批次 flush 出去");
    assert.equal(seen[0].event.payload.delta, "last");

    coalescer.accept(streaming("after"));
    coalescer.flush();
    assert.equal(seen.length, 1, "disposed 之后 accept 不再入表");

    coalescer.dispose();
    assert.equal(seen.length, 1, "重复 dispose 不重复 emit");
  });

  it("定时器未到时 dispose 取消定时器，不会在之后补发", async () => {
    const seen = [];
    const coalescer = createBackgroundSessionEventCoalescer({
      emit: (event) => seen.push(event),
      flushDelayMs: 20,
    });
    coalescer.accept(streaming("once"));
    coalescer.dispose();
    assert.equal(seen.length, 1);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(seen.length, 1, "dispose 后定时器不再触发第二次 flush");
  });

  it("maxItems 默认为 96、flushDelayMs 默认为 1500：96 条不同 key 触发即时 flush", () => {
    const { coalescer, seen } = collector();
    for (let index = 0; index < 95; index++) {
      coalescer.accept(streaming(`d${index}`, { assistantMessageId: `a-${index}` }));
    }
    assert.equal(seen.length, 0, "95 条未到上限");
    coalescer.accept(streaming("d95", { assistantMessageId: "a-95" }));
    assert.equal(seen.length, 96, "第 96 条触发整批 emit");
  });
});
