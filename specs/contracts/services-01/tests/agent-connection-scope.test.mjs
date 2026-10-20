// SPDX-License-Identifier: Apache-2.0
// A6x：agentConnectionScope 的 V4 attachment facade —— hello/握手门、可信连接注入、
// 订阅 ownership 与早帧暂存、流控 SAT/DRN/closed 顺序、runtime 换代失效与 dispose 回收。
// 全部断言走假 base service 的调用序列，不使用 sleep。
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Emitter } from "../../../../packages/rpc/src/foundation.ts";
import { importDeep } from "./entry.mjs";

const scopeModule = await importDeep("agent/agentConnectionScope.ts");

const { createKnorviaAgentConnectionScope, readTrustedKnorviaAgentV4Connection } = scopeModule;

const CLIENT_HELLO = {
  kind: "clientHello",
  protocolVersion: 3,
  clientId: "client-1",
  appVersion: "0.0.0-test",
};

const target = (extra = {}) => ({
  workspacePath: "/ws/path",
  workspaceIdentity: "ws-id",
  ...extra,
});

/**
 * 假 base service：记录每一次调用的 method/params，订阅回固定 subId，
 * 并暴露一个可手动 fire 的 topic 事件源。
 */
function makeBase(options = {}) {
  const calls = [];
  const conversationFrames = new Emitter();
  const record = (method) => async (params) => {
    calls.push({ method, params });
    if (options.fail?.[method]) throw options.fail[method];
    return options.results?.[method]?.(params) ?? { ack: { subscriptionId: "sub-1" } };
  };
  return {
    calls,
    conversationFrames,
    helloConversationV4: record("helloConversationV4"),
    initializeConversationV4: record("initializeConversationV4"),
    setConnectionFlowStateV4: record("setConnectionFlowStateV4"),
    sendConversationCommandV4: record("sendConversationCommandV4"),
    queryConversationCommandsV4: record("queryConversationCommandsV4"),
    subscribeConversationV4: record("subscribeConversationV4"),
    unsubscribeConversationV4: record("unsubscribeConversationV4"),
    resyncConversationV4: record("resyncConversationV4"),
    onDynamicConversationFrame: () => conversationFrames.event,
    unrelated: () => "base-value",
  };
}

const methods = (base) => base.calls.map((call) => call.method);

async function handshake(scope) {
  await scope.service.helloConversationV4();
  await scope.service.initializeConversationV4(CLIENT_HELLO);
}

describe("A61 V4 attachment facade 握手门与可信连接注入", () => {
  it("hello 之前一切订阅被拒；握手后 clientId 被钉死，伪造连接上下文不生效", async () => {
    const base = makeBase();
    const scope = createKnorviaAgentConnectionScope(base, {
      connectionId: "conn-1",
      clientMode: "desktop-continuous",
    });

    // hello 之前：订阅与查询都在 assertReady 处失败，不会打到 base。
    await assert.rejects(
      () => scope.service.subscribeConversationV4({ ...target(), sessionId: "s-1" }),
      /^Error: fault\.connection\.handshakeRequired$/u,
    );
    await assert.rejects(
      () => scope.service.queryConversationCommandsV4({ ...target(), clock: true }),
      /^Error: fault\.connection\.handshakeRequired$/u,
    );
    assert.deepEqual(methods(base), []);

    // hello 只是发出 host 侧 hello，不完成握手。
    const hello = await scope.service.helloConversationV4();
    assert.equal(hello.kind, "hello");
    assert.equal(hello.connectionId, "conn-1");
    assert.equal(hello.clientMode, "desktop-continuous");
    assert.equal(hello.deliveryProfile, "continuous");
    assert.equal(hello.capabilities.nativeDialogs, true);
    assert.equal(hello.capabilities.localTerminal, true);
    assert.equal(hello.capabilities.binaryFrames, false);
    assert.equal(hello.capabilities.workspaceHookReview, true);
    assert.equal(hello.capabilities.independentPlanState, true);
    assert.equal(typeof hello.serverTime, "number");
    assert.deepEqual(hello.auth, {});
    await assert.rejects(
      () => scope.service.subscribeConversationV4({ ...target(), sessionId: "s-1" }),
      /^Error: fault\.connection\.handshakeRequired$/u,
    );

    // initialize 之后握手完成；clientId 被钉死，换 clientId 立即拒绝。
    await scope.service.initializeConversationV4(CLIENT_HELLO);
    await assert.rejects(
      () => scope.service.initializeConversationV4({ ...CLIENT_HELLO, clientId: "client-2" }),
      /^Error: fault\.connection\.clientChanged$/u,
    );
    // 同一 clientId 重复 initialize 幂等。
    await scope.service.initializeConversationV4(CLIENT_HELLO);
    // hello/initialize 由 facade 本地实现，不透传到 base（握手是 attachment 自己的事实）。
    assert.deepEqual(methods(base), []);

    // 伪造可信连接字段：facade 先清空再写 host 真值，base 只看到 conn-1。
    await scope.service.subscribeConversationV4({
      ...target(),
      sessionId: "s-1",
      __knorviaTrustedV4Connection: { connectionId: "forged", clientMode: "web-remote-replayable" },
      connectionId: "forged-2",
      clientMode: "web-remote-replayable",
    });
    const subscribeCall = base.calls.find((call) => call.method === "subscribeConversationV4");
    assert.deepEqual(subscribeCall.params.__knorviaTrustedV4Connection, {
      connectionId: "conn-1",
      clientMode: "desktop-continuous",
    });
    assert.equal(subscribeCall.params.connectionId, undefined, "顶层伪造字段被删除");
    assert.equal(subscribeCall.params.clientMode, undefined);
    assert.equal(subscribeCall.params.sessionId, "s-1");
    assert.equal(subscribeCall.params.workspaceIdentity, "ws-id");
  });

  it("terminal-client 的 command 入口要求 clientId 与握手一致，relay 角色跳过握手但仍注入可信连接", async () => {
    const base = makeBase();
    const scope = createKnorviaAgentConnectionScope(base, {
      connectionId: "conn-1",
      clientMode: "desktop-continuous",
    });
    await handshake(scope);

    await assert.rejects(
      () =>
        scope.service.sendConversationCommandV4({
          ...target(),
          envelope: { clientId: "other" },
        }),
      /^Error: fault\.command\.clientMismatch$/u,
    );
    assert.deepEqual(methods(base), []);
    await scope.service.sendConversationCommandV4({
      ...target(),
      envelope: { clientId: "client-1" },
    });
    const send = base.calls.find((call) => call.method === "sendConversationCommandV4");
    assert.deepEqual(send.params.envelope, { clientId: "client-1" }, "envelope 原样透传");
    assert.deepEqual(send.params.__knorviaTrustedV4Connection, {
      connectionId: "conn-1",
      clientMode: "desktop-continuous",
    });

    // relay 角色：不需要 hello/initialize，订阅直接可用。
    const relayBase = makeBase();
    const relay = createKnorviaAgentConnectionScope(relayBase, {
      connectionId: "relay-1",
      clientMode: "web-remote-replayable",
      role: "trusted-host-relay",
    });
    await relay.service.subscribeConversationV4({ ...target(), sessionId: "s-1" });
    assert.deepEqual(methods(relayBase), ["subscribeConversationV4"]);
    // 没有下游可信载体时 relay 用自身 attachment 身份。
    assert.deepEqual(relayBase.calls[0].params.__knorviaTrustedV4Connection, {
      connectionId: "relay-1",
      clientMode: "web-remote-replayable",
    });
    // 下游可信载体被长度前缀命名空间化，避免 `a/b + c` 与 `a + b/c` 的分隔符碰撞。
    const forwarded = readTrustedKnorviaAgentV4Connection({
      __knorviaTrustedV4Connection: { connectionId: "down-1", clientMode: "web-remote-replayable" },
    });
    assert.deepEqual(forwarded, { connectionId: "down-1", clientMode: "web-remote-replayable" });
    relayBase.calls.length = 0;
    await relay.service.subscribeConversationV4({
      ...target(),
      sessionId: "s-1",
      __knorviaTrustedV4Connection: {
        connectionId: "down-1",
        clientMode: "web-remote-replayable",
      },
    });
    assert.equal(
      relayBase.calls[0].params.__knorviaTrustedV4Connection.connectionId,
      "relay:7:relay-16:down-1",
      "relay 把自身与下游 connectionId 长度前缀拼接成 opaque route key",
    );
    assert.equal(
      relayBase.calls[0].params.__knorviaTrustedV4Connection.clientMode,
      "web-remote-replayable",
    );
  });

  it("connectionId 为空或超长时构造即抛错，非法可信连接上下文读回 null", async () => {
    for (const connectionId of ["", "   ", "x".repeat(257)]) {
      assert.throws(
        () =>
          createKnorviaAgentConnectionScope(makeBase(), {
            connectionId,
            clientMode: "desktop-continuous",
          }),
        /^Error: fault\.connection\.invalidConnectionId$/u,
      );
    }
    assert.ok(
      createKnorviaAgentConnectionScope(makeBase(), {
        connectionId: "x".repeat(256),
        clientMode: "desktop-continuous",
      }),
    );
    for (const value of [null, undefined, 1, "str", {}, { __knorviaTrustedV4Connection: {} }]) {
      assert.equal(readTrustedKnorviaAgentV4Connection(value), null);
    }
    assert.equal(
      readTrustedKnorviaAgentV4Connection({
        __knorviaTrustedV4Connection: { connectionId: "c", clientMode: "bogus" },
      }),
      null,
      "未知 clientMode 不被信任",
    );
    assert.deepEqual(
      readTrustedKnorviaAgentV4Connection({
        __knorviaTrustedV4Connection: { connectionId: "c", clientMode: "web-remote-replayable" },
      }),
      { connectionId: "c", clientMode: "web-remote-replayable" },
      "只回 connectionId/clientMode 两键，其余字段不泄漏",
    );
  });
});

describe("A62 订阅 ownership、早帧暂存与反订阅归属", () => {
  it("ACK 前到达的帧被暂存并在 ACK 后按序释放；未登记 topic 的帧直接丢弃", async () => {
    const base = makeBase();
    const scope = createKnorviaAgentConnectionScope(base, {
      connectionId: "conn-1",
      clientMode: "desktop-continuous",
    });
    await handshake(scope);

    const seen = [];
    const subscription = scope.service.onDynamicConversationFrame({
      ...target(),
      sessionId: "s-1",
    })((frame) => seen.push(frame));

    // 未订阅时同 topic 的帧没有 pending 组，直接丢弃。
    base.conversationFrames.fire({ subscriptionId: "sub-1", topic: "conversation/s-1", seq: 1 });
    assert.deepEqual(seen, []);

    // 订阅在飞：ACK 之前到达的帧被 stage，不 fire。
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const originalSubscribe = base.subscribeConversationV4;
    base.subscribeConversationV4 = async (params) => {
      await gate;
      return originalSubscribe(params);
    };
    const pending = scope.service.subscribeConversationV4({ ...target(), sessionId: "s-1" });
    // 让 subscribe 的同步部分先跑到 await base。
    await Promise.resolve();
    base.conversationFrames.fire({ subscriptionId: "sub-1", topic: "conversation/s-1", seq: 2 });
    base.conversationFrames.fire({ subscriptionId: "sub-1", topic: "conversation/s-1", seq: 3 });
    assert.deepEqual(seen, [], "ACK 前不投递");
    release();
    await pending;
    assert.deepEqual(
      seen.map((frame) => frame.seq),
      [2, 3],
      "ACK 后按原到达顺序补投，不丢早帧",
    );

    // ACK 之后同 subId 的帧直接 fire。
    base.conversationFrames.fire({ subscriptionId: "sub-1", topic: "conversation/s-1", seq: 4 });
    assert.deepEqual(
      seen.map((frame) => frame.seq),
      [2, 3, 4],
    );
    // 别的 subId 的帧不投递（不猜 owner）。
    base.conversationFrames.fire({ subscriptionId: "sub-9", topic: "conversation/s-1", seq: 5 });
    assert.deepEqual(
      seen.map((frame) => frame.seq),
      [2, 3, 4],
    );
    subscription.dispose();
  });

  it("unsubscribe 只认自己登记的 subId/workspace；重复 unsubscribe 幂等且不重复打 base", async () => {
    const base = makeBase();
    const scope = createKnorviaAgentConnectionScope(base, {
      connectionId: "conn-1",
      clientMode: "desktop-continuous",
    });
    await handshake(scope);
    await scope.service.subscribeConversationV4({ ...target(), sessionId: "s-1" });

    // 未登记的 subId 静默返回，不向 base 发 unsubscribe。
    await scope.service.unsubscribeConversationV4({
      ...target(),
      sessionId: "s-1",
      subscriptionId: "ghost",
    });
    assert.equal(methods(base).includes("unsubscribeConversationV4"), false);

    await scope.service.unsubscribeConversationV4({
      ...target(),
      sessionId: "s-1",
      subscriptionId: "sub-1",
    });
    const first = base.calls.filter((call) => call.method === "unsubscribeConversationV4");
    assert.equal(first.length, 1);
    assert.equal(first[0].params.subscriptionId, "sub-1");
    assert.equal(first[0].params.workspaceIdentity, "ws-id");

    // 已 forget：第二次是 no-op。
    await scope.service.unsubscribeConversationV4({
      ...target(),
      sessionId: "s-1",
      subscriptionId: "sub-1",
    });
    assert.equal(
      base.calls.filter((call) => call.method === "unsubscribeConversationV4").length,
      1,
    );

    // resync 在 owner 已释放后拒绝。
    await assert.rejects(
      () =>
        scope.service.resyncConversationV4({
          ...target(),
          sessionId: "s-1",
          subscriptionId: "sub-1",
        }),
      /^Error: fault\.subscription\.notOwned$/u,
    );
  });

  it("同一 ownership 重复订阅顶掉旧 owner，旧 subId 的帧与 unsubscribe 都不再命中", async () => {
    let counter = 0;
    const base = makeBase({
      results: {
        subscribeConversationV4: () => ({ ack: { subscriptionId: `sub-${++counter}` } }),
      },
    });
    const scope = createKnorviaAgentConnectionScope(base, {
      connectionId: "conn-1",
      clientMode: "desktop-continuous",
    });
    await handshake(scope);
    const seen = [];
    scope.service.onDynamicConversationFrame({ ...target(), sessionId: "s-1" })((frame) =>
      seen.push(frame.subscriptionId),
    );
    await scope.service.subscribeConversationV4({ ...target(), sessionId: "s-1" });
    await scope.service.subscribeConversationV4({ ...target(), sessionId: "s-1" });

    base.conversationFrames.fire({ subscriptionId: "sub-1", topic: "conversation/s-1" });
    base.conversationFrames.fire({ subscriptionId: "sub-2", topic: "conversation/s-1" });
    assert.deepEqual(seen, ["sub-2"], "旧 owner 已被顶掉，只剩新 subId 投递");

    // 旧 subId 的 unsubscribe 是 no-op；新 subId 生效。
    await scope.service.unsubscribeConversationV4({
      ...target(),
      sessionId: "s-1",
      subscriptionId: "sub-1",
    });
    assert.equal(methods(base).includes("unsubscribeConversationV4"), false);
    await scope.service.unsubscribeConversationV4({
      ...target(),
      sessionId: "s-1",
      subscriptionId: "sub-2",
    });
    assert.equal(methods(base).filter((name) => name === "unsubscribeConversationV4").length, 1);
  });
});

describe("A63 流控 SAT/DRN/closed 顺序与 dispose 回收", () => {
  it("SAT 只对已有 route 下发一次，重复 SAT 去重；订阅 ACK 补发当前 saturated", async () => {
    const base = makeBase();
    const scope = createKnorviaAgentConnectionScope(base, {
      connectionId: "conn-1",
      clientMode: "desktop-continuous",
    });
    await handshake(scope);

    // 没有 route 时 SAT 不产生 base 调用。
    await scope.setTransportFlowState("saturated");
    assert.equal(methods(base).includes("setConnectionFlowStateV4"), false);

    await scope.service.subscribeConversationV4({ ...target(), sessionId: "s-1" });
    // 订阅 ACK 时 transport 已 saturated：补发一次 SAT。
    const flows = base.calls.filter((call) => call.method === "setConnectionFlowStateV4");
    assert.equal(flows.length, 1);
    assert.equal(flows[0].params.state, "saturated");
    assert.deepEqual(flows[0].params.__knorviaTrustedV4Connection, {
      connectionId: "conn-1",
      clientMode: "desktop-continuous",
    });

    // 重复 SAT：同一 route 已记录 saturated，不再下发。
    await scope.setTransportFlowState("saturated");
    assert.equal(
      base.calls.filter((call) => call.method === "setConnectionFlowStateV4").length,
      1,
      "同 route 同 state 幂等去重",
    );

    await scope.setTransportFlowState("drained");
    assert.equal(base.calls.filter((call) => call.method === "setConnectionFlowStateV4").length, 2);
    // closed 之后再 DRN 被忽略；closed 本身只下发一次。
    await scope.setTransportFlowState("closed");
    const afterClose = base.calls.filter((call) => call.method === "setConnectionFlowStateV4");
    assert.equal(afterClose.at(-1).params.state, "closed");
    await scope.setTransportFlowState("drained");
    assert.equal(
      base.calls.filter((call) => call.method === "setConnectionFlowStateV4").length,
      afterClose.length,
      "closed 是终态，后续 DRN 不再下发",
    );
  });

  it("最后一个订阅释放时先 closed 再 unsubscribe，顺序不能反", async () => {
    const order = [];
    const base = makeBase();
    const wrap = (method) => {
      const original = base[method];
      base[method] = async (params) => {
        order.push(method);
        return original(params);
      };
    };
    wrap("setConnectionFlowStateV4");
    wrap("unsubscribeConversationV4");
    const scope = createKnorviaAgentConnectionScope(base, {
      connectionId: "conn-1",
      clientMode: "desktop-continuous",
    });
    await handshake(scope);
    await scope.service.subscribeConversationV4({ ...target(), sessionId: "s-1" });
    order.length = 0;
    await scope.setTransportFlowState("saturated");
    order.length = 0;

    await scope.service.unsubscribeConversationV4({
      ...target(),
      sessionId: "s-1",
      subscriptionId: "sub-1",
    });
    assert.deepEqual(
      order,
      ["setConnectionFlowStateV4", "unsubscribeConversationV4"],
      "trusted relay 用 owned route 校验流控：closed 必须先于 unsubscribe 到达 base",
    );
    assert.equal(base.calls.at(-2).params.state, "closed");
  });

  it("dispose 幂等：先入队 closed，再清空 owner 并逐个反向 unsubscribe；之后的调用全部拒绝", async () => {
    let counter = 0;
    const base = makeBase({
      results: {
        subscribeConversationV4: () => ({ ack: { subscriptionId: `sub-${++counter}` } }),
      },
    });
    const scope = createKnorviaAgentConnectionScope(base, {
      connectionId: "conn-1",
      clientMode: "desktop-continuous",
    });
    await handshake(scope);
    await scope.service.subscribeConversationV4({ ...target(), sessionId: "s-1" });
    await scope.service.subscribeConversationV4({ ...target(), sessionId: "s-2" });
    base.calls.length = 0;

    await scope.dispose();
    assert.equal(base.calls[0].method, "setConnectionFlowStateV4");
    assert.equal(base.calls[0].params.state, "closed");
    assert.deepEqual(
      base.calls
        .filter((call) => call.method === "unsubscribeConversationV4")
        .map((call) => call.params.subscriptionId)
        .sort(),
      ["sub-1", "sub-2"],
      "owned 订阅在 dispose 时全部反向清理",
    );

    // 幂等：第二次 dispose 不产生新调用。
    const settled = base.calls.length;
    await scope.dispose();
    assert.equal(base.calls.length, settled);
    // dispose 之后一切入口都拒绝（hello/订阅/查询），且 setTransportFlowState 变 no-op。
    await assert.rejects(
      () => scope.service.helloConversationV4(),
      /^Error: fault\.connection\.closed$/u,
    );
    await assert.rejects(
      () => scope.service.subscribeConversationV4({ ...target(), sessionId: "s-3" }),
      /^Error: fault\.connection\.closed$/u,
    );
    await assert.rejects(
      () => scope.service.queryConversationCommandsV4({ ...target(), clock: true }),
      /^Error: fault\.connection\.closed$/u,
    );
    await scope.setTransportFlowState("saturated");
    assert.equal(base.calls.length, settled);
  });

  it("未覆盖的方法与属性直接转发 base，函数按 base 绑定 this", async () => {
    const base = makeBase();
    base.selfCheck = function selfCheck() {
      return this === base;
    };
    const scope = createKnorviaAgentConnectionScope(base, {
      connectionId: "conn-1",
      clientMode: "desktop-continuous",
    });
    assert.equal(scope.service.unrelated(), "base-value");
    assert.equal(scope.service.selfCheck(), true, "未覆盖方法按 base 绑定 this");
  });
});

describe("A64 runtime 换代失效与 query 的 workspace 绑定", () => {
  it("runtime unavailable 使本地 owner 失效，迟到 ACK 以 runtimeRestarted 拒绝且不反向 unsubscribe", async () => {
    const base = makeBase();
    const lifecycle = new Emitter();
    base.onAgentRuntimeLifecycle = (listener) => lifecycle.event(listener);
    const scope = createKnorviaAgentConnectionScope(base, {
      connectionId: "conn-1",
      clientMode: "desktop-continuous",
    });
    await handshake(scope);
    await scope.service.subscribeConversationV4({ ...target(), sessionId: "s-1" });

    // available 不是失效边界：不得推进 generation。
    lifecycle.fire({
      state: "available",
      workspaceKey: "ws-id",
      runtimeIdentity: { generation: 1 },
    });
    assert.equal(methods(base).includes("unsubscribeConversationV4"), false);
    base.calls.length = 0;

    // unavailable 直接失效本地 owner，不向（可能已消失的）runtime 反向清理。
    lifecycle.fire({
      state: "unavailable",
      workspaceKey: "ws-id",
      runtimeIdentity: { generation: 2 },
    });
    assert.deepEqual(base.calls, [], "换代失效只清本地 owner，不反向 unsubscribe");
    // 旧 owner 已释放：unsubscribe 是 no-op。
    await scope.service.unsubscribeConversationV4({
      ...target(),
      sessionId: "s-1",
      subscriptionId: "sub-1",
    });
    assert.deepEqual(base.calls, []);
    // 新订阅仍可用。
    await scope.service.subscribeConversationV4({ ...target(), sessionId: "s-1" });
    assert.deepEqual(methods(base), ["subscribeConversationV4"]);
  });

  it("ACK 期间发生换代时迟到 ACK 被拒，避免用新 runtime 的 subId 反向清理", async () => {
    const base = makeBase();
    const lifecycle = new Emitter();
    base.onAgentRuntimeLifecycle = (listener) => lifecycle.event(listener);
    const scope = createKnorviaAgentConnectionScope(base, {
      connectionId: "conn-1",
      clientMode: "desktop-continuous",
    });
    await handshake(scope);

    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const original = base.subscribeConversationV4;
    base.subscribeConversationV4 = async (params) => {
      await gate;
      return original(params);
    };
    const pending = scope.service.subscribeConversationV4({ ...target(), sessionId: "s-1" });
    await Promise.resolve();
    lifecycle.fire({
      state: "unavailable",
      workspaceKey: "ws-id",
      runtimeIdentity: { generation: 2 },
    });
    release();
    await assert.rejects(pending, /^Error: fault\.subscription\.runtimeRestarted$/u);
    assert.equal(
      methods(base).includes("unsubscribeConversationV4"),
      false,
      "迟到 ACK 只丢本地 owner，绝不向新 runtime 反向下发",
    );
  });

  it("query 先到先得绑定 workspace，跨 workspace 查询被拒；clock 探测不抢占绑定", async () => {
    const base = makeBase();
    const scope = createKnorviaAgentConnectionScope(base, {
      connectionId: "conn-1",
      clientMode: "desktop-continuous",
    });
    await handshake(scope);

    await scope.service.queryConversationCommandsV4({ ...target(), clock: true });
    await scope.service.queryConversationCommandsV4({
      workspacePath: "/ws/other",
      workspaceIdentity: "other",
      clock: true,
    });
    assert.equal(
      methods(base).filter((name) => name === "queryConversationCommandsV4").length,
      2,
      "clock 探测不绑定 workspace",
    );

    await scope.service.queryConversationCommandsV4({ ...target() });
    await scope.service.queryConversationCommandsV4({ ...target() });
    assert.equal(
      methods(base).filter((name) => name === "queryConversationCommandsV4").length,
      4,
      "同 workspace 重复查询放行",
    );
    await assert.rejects(
      () =>
        scope.service.queryConversationCommandsV4({
          workspacePath: "/ws/other",
          workspaceIdentity: "other",
        }),
      /^Error: fault\.command\.queryForeignWorkspace$/u,
    );
  });
});
