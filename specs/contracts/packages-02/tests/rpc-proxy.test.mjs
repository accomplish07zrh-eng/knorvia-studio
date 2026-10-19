// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { rpc } from "./entry.mjs";

const { Event, Emitter, ProxyChannel } = rpc;

test("B11 fromService 把 on+大写 成员包装为可缓存事件", () => {
  const emitter = new Emitter();
  let upstreamSubscriptions = 0;
  const source = (listener) => {
    upstreamSubscriptions++;
    const disposable = emitter.event(listener);
    return {
      dispose() {
        upstreamSubscriptions--;
        disposable.dispose();
      },
    };
  };
  const service = {
    onValue: source,
    getValue() {
      return 7;
    },
  };
  const channel = ProxyChannel.fromService(service);
  assert.deepEqual(
    Object.keys(channel).sort(),
    ["call", "listen"],
    "fromService 只暴露 IChannel 的两个成员",
  );

  const received = [];
  const first = channel.listen("ctx", "onValue")((value) => received.push(value));
  assert.equal(upstreamSubscriptions, 1);
  emitter.fire(1);
  emitter.fire(2);
  assert.deepEqual(received, [1, 2]);

  first.dispose();
  assert.equal(upstreamSubscriptions, 0, "最后一个监听器移除时释放上游");
  emitter.fire(3);
  const second = channel.listen("ctx", "onValue")((value) => received.push(value));
  assert.equal(upstreamSubscriptions, 1, "再次订阅重新接上游");
  emitter.fire(4);
  assert.deepEqual(received, [1, 2, 4], "重新订阅不补发旧值");
  second.dispose();

  assert.equal(channel.listen("ctx", "onValue"), channel.listen("ctx", "onValue"));
});

test("B11 fromService 在首个监听器加入时同步补发订阅瞬间的值", () => {
  const replay = ["a", "b"];
  const service = {
    onReady(listener) {
      for (const value of replay) {
        listener(value);
      }
      return { dispose() {} };
    },
  };
  const channel = ProxyChannel.fromService(service);
  const received = [];
  const subscription = channel.listen("ctx", "onReady")((value) => received.push(value));
  assert.deepEqual(received, ["a", "b"], "补发发生在 listen 返回订阅之前");
  subscription.dispose();
});

test("B11 fromService 的 onDynamic 前缀与事件名边界", () => {
  const calls = [];
  const service = {
    onDynamicSearch(arg) {
      assert.equal(this, service);
      calls.push(arg);
      return Event.None;
    },
    onlower() {
      return Event.None;
    },
    "on]"() {
      return Event.None;
    },
  };
  const channel = ProxyChannel.fromService(service);
  const event = channel.listen("ctx", "onDynamicSearch", { query: "q" });
  assert.equal(event, Event.None);
  assert.deepEqual(calls, [{ query: "q" }]);

  assert.throws(() => channel.listen("ctx", "onlower"), {
    message: "Event not found: onlower",
  });
  assert.throws(() => channel.listen("ctx", "onDynamic"), {
    message: "Event not found: onDynamic",
  });
  assert.throws(() => channel.listen("ctx", "missing"), {
    message: "Event not found: missing",
  });
});

test("B11 fromService 的 call 同步抛错不外包装", async () => {
  const service = {
    add(a, b) {
      return a + b;
    },
    noArgs(...args) {
      return args;
    },
    fail() {
      throw new Error("sync boom");
    },
    async asyncValue() {
      return "async";
    },
  };
  const channel = ProxyChannel.fromService(service);

  const sum = channel.call("ctx", "add", [2, 3]);
  assert.ok(sum instanceof Promise, "非 Promise 返回值被包成 Promise");
  assert.equal(await sum, 5);
  assert.deepEqual(await channel.call("ctx", "noArgs"), []);
  assert.equal(await channel.call("ctx", "asyncValue"), "async");

  assert.throws(() => channel.call("ctx", "fail"), { message: "sync boom" });
  assert.throws(() => channel.call("ctx", "missing"), {
    message: "Method not found: missing",
  });
});

test("B12 toService 区分 then、事件与动态事件", async () => {
  const listenCalls = [];
  const channel = {
    call: async () => undefined,
    listen(name, arg) {
      listenCalls.push([name, arg]);
      return Event.None;
    },
  };
  const service = ProxyChannel.toService(channel);
  assert.equal(service.then, undefined, "then 必须为 undefined 以免被 await");
  assert.equal(service[Symbol.toStringTag], undefined);

  assert.equal(service.onReady, Event.None);
  assert.deepEqual(listenCalls, [["onReady", undefined]]);

  const dynamic = service.onDynamicSearch({ query: "q" });
  assert.equal(dynamic, Event.None);
  assert.deepEqual(listenCalls[1], ["onDynamicSearch", { query: "q" }]);
});

test("B12 toService 方法按调用时读取 context 并透传拒绝", async () => {
  const calls = [];
  const channel = {
    async call(name, args) {
      calls.push([name, args]);
      if (name === "fail") {
        throw new Error("remote failure");
      }
      return "ok";
    },
    listen() {
      return Event.None;
    },
  };
  const options = {};
  const service = ProxyChannel.toService(channel, options);
  options.context = "late-context";
  assert.equal(await service.run(1, 2), "ok");
  assert.deepEqual(calls[0], ["run", ["late-context", 1, 2]]);
  await assert.rejects(service.fail(), { message: "remote failure" });
  assert.deepEqual(calls[1], ["fail", ["late-context"]]);

  const plain = ProxyChannel.toService(channel);
  assert.equal(await plain.run(3), "ok");
  assert.deepEqual(calls[2], ["run", [3]]);

  assert.notEqual(plain.run, plain.run, "每次属性访问返回新的函数");
});
