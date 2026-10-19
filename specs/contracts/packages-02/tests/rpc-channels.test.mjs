// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { rpc } from "./entry.mjs";

const {
  BufferWriter,
  CancellationTokenSource,
  ChannelClient,
  ChannelServer,
  Event,
  Emitter,
  createQueuePair,
  getDelayedChannel,
  serialize,
} = rpc;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createPair(timeoutDelay, deferInit) {
  const [serverSide, clientSide] = createQueuePair();
  const server = new ChannelServer(serverSide, { user: "ctx" }, timeoutDelay, deferInit);
  const client = new ChannelClient(clientSide);
  return { server, client };
}

test("B8 ChannelClient 在 Initialize 前排队并按请求 id 结算", async () => {
  const [serverSide, clientSide] = createQueuePair();
  const server = new ChannelServer(serverSide, "ctx");
  server.registerChannel("math", {
    async call(_ctx, command, arg) {
      if (command === "add") return arg[0] + arg[1];
      if (command === "fail") {
        const error = new Error("boom");
        error.name = "BoomError";
        error.code = "E_BOOM";
        error.kind = "kind";
        error.status = 503;
        error.retryAfterMs = 1200;
        error.data = { nested: true };
        error.detail = "detail";
        error.details = ["a"];
        error.taskId = "task-1";
        error.traceId = "trace-1";
        throw error;
      }
      if (command === "sync-throw") throw new Error("sync boom");
      if (command === "plain-reject") return Promise.reject("plain failure");
      return undefined;
    },
    listen() {
      return Event.None;
    },
  });
  const client = new ChannelClient(clientSide);
  let initialized = 0;
  client.onDidInitialize(() => initialized++);
  const channel = client.getChannel("math");
  assert.equal(await channel.call("add", [10, 20]), 30);
  await tick();
  assert.equal(initialized, 1);

  await assert.rejects(channel.call("fail"), (error) => {
    assert.equal(error.message, "boom");
    assert.equal(error.name, "BoomError");
    assert.equal(error.code, "E_BOOM");
    assert.equal(error.kind, "kind");
    assert.equal(error.status, 503);
    assert.equal(error.retryAfterMs, 1200);
    assert.deepEqual(error.data, { nested: true });
    assert.equal(error.detail, "detail");
    assert.deepEqual(error.details, ["a"]);
    assert.equal(error.taskId, "task-1");
    assert.equal(error.traceId, "trace-1");
    return true;
  });
  await assert.rejects(channel.call("sync-throw"), { message: "sync boom" });
  await assert.rejects(channel.call("plain-reject"), (error) => error === "plain failure");

  server.dispose();
  client.dispose();
});

test("B8 listen 在首/末监听器时发送订阅与退订", async () => {
  const { server, client } = createPair(1000);
  const emitter = new Emitter();
  let subscriptions = 0;
  let unsubscriptions = 0;
  let subscriptionWaiter = null;
  let unsubscriptionWaiter = null;
  const armSubscription = () =>
    new Promise((resolve) => {
      subscriptionWaiter = resolve;
    });
  const armUnsubscription = () =>
    new Promise((resolve) => {
      unsubscriptionWaiter = resolve;
    });
  const tracked = (listener) => {
    subscriptions++;
    const notify = subscriptionWaiter;
    subscriptionWaiter = null;
    notify?.();
    const disposable = emitter.event(listener);
    return {
      dispose() {
        unsubscriptions++;
        const notifyUnsub = unsubscriptionWaiter;
        unsubscriptionWaiter = null;
        notifyUnsub?.();
        disposable.dispose();
      },
    };
  };
  server.registerChannel("events", {
    async call() {
      return undefined;
    },
    listen(_ctx, name) {
      assert.equal(name, "onData");
      return tracked;
    },
  });
  const channel = client.getChannel("events");
  const received = [];
  const waitSub1 = armSubscription();
  let resolveA;
  const gotA = new Promise((resolve) => {
    resolveA = resolve;
  });
  const first = channel.listen("onData")((value) => {
    received.push(value);
    resolveA(value);
  });
  await waitSub1;
  assert.equal(subscriptions, 1);
  emitter.fire("a");
  await gotA;
  assert.deepEqual(received, ["a"]);

  const waitUnsub1 = armUnsubscription();
  first.dispose();
  await waitUnsub1;
  assert.equal(unsubscriptions, 1);

  const waitSub2 = armSubscription();
  let resolveB;
  const gotB = new Promise((resolve) => {
    resolveB = resolve;
  });
  const second = channel.listen("onData")((value) => {
    received.push(value);
    resolveB(value);
  });
  await waitSub2;
  assert.equal(subscriptions, 2);
  emitter.fire("b");
  await gotB;
  assert.deepEqual(received, ["a", "b"]);
  second.dispose();
  server.dispose();
  client.dispose();
});

test("B8 已取消 token 与运行中取消都不结算服务端结果", async () => {
  const { server, client } = createPair(1000);
  let serverCancelled = 0;
  server.registerChannel("slow", {
    call(_ctx, _command, _arg, token) {
      return new Promise((_resolve, reject) => {
        token.onCancellationRequested(() => {
          serverCancelled++;
          reject(new Error("server cancelled"));
        });
      });
    },
    listen() {
      return Event.None;
    },
  });
  const channel = client.getChannel("slow");

  const early = {
    isCancellationRequested: true,
    onCancellationRequested: () => ({ dispose() {} }),
  };
  await assert.rejects(channel.call("wait", undefined, early), { message: "Cancelled" });

  const source = new CancellationTokenSource();
  const pending = channel.call("wait", undefined, source.token);
  await tick();
  source.cancel();
  await assert.rejects(pending, { message: "Cancelled" });
  await tick();
  assert.equal(serverCancelled, 1);

  server.dispose();
  client.dispose();
});

test("B8 dispose 拒绝未决请求并冻结后续入口", async () => {
  const { server, client } = createPair(1000);
  server.registerChannel("hang", {
    call() {
      return new Promise(() => {});
    },
    listen() {
      return Event.None;
    },
  });
  const channel = client.getChannel("hang");
  const pending = channel.call("never");
  await tick();
  client.dispose();
  await assert.rejects(pending, (error) => {
    assert.equal(error.message, "ChannelClient disposed");
    assert.equal(error.name, "ConnectionClosed");
    return true;
  });
  await assert.rejects(channel.call("after"), { message: "ChannelClient is disposed" });
  const none = channel.listen("onAfter")(() => assert.fail("Event.None 不应触发"));
  none.dispose();
  server.dispose();
});

test("B8 带 reason 的 dispose 原样使用该错误", async () => {
  const { server, client } = createPair(1000);
  server.registerChannel("hang", {
    call() {
      return new Promise(() => {});
    },
    listen() {
      return Event.None;
    },
  });
  const reason = new Error("custom reason");
  const pending = client.getChannel("hang").call("never");
  await tick();
  client.dispose(reason);
  await assert.rejects(pending, (error) => error === reason);
  server.dispose();
});

test("B8 transport.send 抛错被吞掉，本地结算照旧", async () => {
  const inbound = new Emitter();
  const sent = [];
  let throwOnSend = false;
  const protocol = {
    onMessage: inbound.event,
    send(buffer) {
      if (throwOnSend) throw new Error("transport down");
      sent.push(buffer);
    },
  };
  const deliver = (header, body) => {
    const writer = new BufferWriter();
    serialize(writer, header);
    serialize(writer, body);
    inbound.fire(writer.buffer);
  };
  const client = new ChannelClient(protocol);
  deliver([200], undefined);
  await tick();
  throwOnSend = true;
  const pending = client.getChannel("chan").call("cmd", [1]);
  await tick();
  assert.equal(sent.length, 0);
  deliver([201, 0], "settled");
  assert.equal(await pending, "settled");
  client.dispose();
});

test("B9 同步抛错、Error 元数据与 stack 数组往返", async () => {
  const { server, client } = createPair(1000);
  const error = new Error("with stack");
  error.stack = "line-1\nline-2";
  server.registerChannel("failure", {
    async call(_ctx, command) {
      if (command === "error") throw error;
      throw new Error("sync only");
    },
    listen() {
      return Event.None;
    },
  });
  const channel = client.getChannel("failure");
  await assert.rejects(channel.call("error"), (received) => {
    assert.equal(received.message, "with stack");
    assert.equal(received.stack, "line-1\nline-2");
    return true;
  });
  await assert.rejects(channel.call("sync"), { message: "sync only" });
  server.dispose();
  client.dispose();
});

test("B9 deferInit 与 ready、命名 channel 覆盖", async () => {
  const { server, client } = createPair(1000, true);
  server.registerChannel("value", {
    async call() {
      return "first";
    },
    listen() {
      return Event.None;
    },
  });
  const channel = client.getChannel("value");
  let settled = false;
  const pending = channel.call("get").then((value) => {
    settled = true;
    return value;
  });
  await delay(20);
  assert.equal(settled, false);
  server.ready();
  assert.equal(await pending, "first");

  server.registerChannel("value", {
    async call() {
      return "second";
    },
    listen() {
      return Event.None;
    },
  });
  assert.equal(await client.getChannel("value").call("get"), "second");
  server.dispose();
  client.dispose();
});

test("B9 未知 channel 超时由 console.error 与 PromiseError 报告", async () => {
  const { server, client } = createPair(20);
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(" "));
  try {
    await assert.rejects(client.getChannel("missing").call("go"), (error) => {
      assert.equal(error.name, "Unknown channel");
      assert.equal(error.message, "Channel name 'missing' timed out after 20ms");
      return true;
    });
    assert.deepEqual(logged, ["Unknown channel: missing"]);
  } finally {
    console.error = original;
    server.dispose();
    client.dispose();
  }
});

test("B9 后注册 channel 会 flush pending 请求", async () => {
  const { server, client } = createPair(5000);
  const pending = client.getChannel("late").call("hello");
  await delay(20);
  server.registerChannel("late", {
    async call() {
      return "registered";
    },
    listen() {
      return Event.None;
    },
  });
  assert.equal(await pending, "registered");
  server.dispose();
  client.dispose();
});

test("B9 dispose 不清理未到点的 pending 定时器（旧行为）", async () => {
  const { server, client } = createPair(150);
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(" "));
  try {
    const pending = client
      .getChannel("ghost")
      .call("go")
      .catch((error) => error);
    // 队列对每一跳都走 0ms 宏任务；留出余量确保服务端已收集请求后再 dispose。
    await delay(30);
    server.dispose();
    const error = await pending;
    assert.equal(error.name, "Unknown channel");
    assert.deepEqual(logged, ["Unknown channel: ghost"]);
  } finally {
    console.error = original;
    client.dispose();
  }
});

test("B10 getDelayedChannel 转发 call 与延迟订阅 listen", async () => {
  const source = new Emitter();
  const calls = [];
  let resolveChannel;
  const promise = new Promise((resolve) => {
    resolveChannel = resolve;
  });
  const delayed = getDelayedChannel(promise);
  const pending = delayed.call("echo", { value: 1 });
  const received = [];
  const subscription = delayed.listen("onValue")((value) => received.push(value));
  resolveChannel({
    async call(command, arg, token) {
      calls.push([command, arg, token]);
      return "answer";
    },
    listen(name, arg) {
      calls.push([name, arg]);
      return source.event;
    },
  });
  assert.equal(await pending, "answer");
  assert.equal(calls[0][0], "echo");
  assert.deepEqual(calls[0][1], { value: 1 });
  await tick();
  source.fire("later");
  assert.deepEqual(received, ["later"]);
  subscription.dispose();
});

test("B10 getDelayedChannel 的 call 原样传播拒绝", async () => {
  const failure = new Error("no channel");
  const delayed = getDelayedChannel(Promise.reject(failure));
  await assert.rejects(delayed.call("anything"), (error) => error === failure);
});
