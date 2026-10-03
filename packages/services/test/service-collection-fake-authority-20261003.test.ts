import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { IChannelServer } from "@knorvia/rpc";
import type { ServiceDescriptor } from "../src/descriptors.js";

const proxyInputs: unknown[] = [];
const proxyOutputs: object[] = [];
let proxyFailure: Error | undefined;
let beforeProxy: (() => void) | undefined;
const ProxyChannel = {
  fromService(service: unknown) {
    assert.equal(this, ProxyChannel);
    assert.equal(arguments.length, 1);
    beforeProxy?.();
    proxyInputs.push(service);
    if (proxyFailure) throw proxyFailure;
    const channel = { syntheticService: service };
    proxyOutputs.push(channel);
    return channel;
  },
};
mock.module("@knorvia/rpc", { namedExports: { ProxyChannel } });
const { ServiceCollection } = await import("../src/collection.js");
function descriptor<T>(channelName: string): ServiceDescriptor<T> {
  return { channelName };
}
function server() {
  const exposed: Array<{ name: string; channel: object }> = [];
  let beforeRegistration: ((name: string) => void) | undefined;
  const instance = {
    registerChannel(name: string, channel: object) {
      assert.equal(this, instance);
      beforeRegistration?.(name);
      exposed.push({ name, channel });
    },
  };
  return {
    instance: instance as unknown as IChannelServer,
    exposed,
    setBeforeRegistration(callback: (name: string) => void) {
      beforeRegistration = callback;
    },
  };
}

test("synthetic service registry preserves data references, live exposure and failure authority without IPC or server runtime", () => {
  const collection = new ServiceCollection();
  assert.equal(proxyInputs.length, 0);
  const first = { synthetic: "first" };
  const replacement = { synthetic: "replacement" };
  const second = { synthetic: "second" };
  const a = descriptor<object>("synthetic-a");
  const b = descriptor<object>("synthetic-b");
  assert.equal(collection.register(a, first), collection);
  collection.register(b, second).register(a, replacement);
  assert.equal(collection.get(a), replacement);
  assert.equal(collection.getOptional(a), replacement);
  const initial = server();
  assert.equal(collection.exposeOnChannelServer(initial.instance), undefined);
  assert.deepEqual(
    initial.exposed.map((value) => value.name),
    ["synthetic-a", "synthetic-b"],
  );
  assert.deepEqual(proxyInputs, [replacement, second]);
  assert.equal(initial.exposed[0]?.channel, proxyOutputs[0]);
  assert.equal(initial.exposed[1]?.channel, proxyOutputs[1]);
  collection.exposeOnChannelServer(initial.instance, undefined);
  assert.equal(initial.exposed.length, 4);

  const empty = new ServiceCollection();
  assert.equal(empty.getOptional(a), undefined);
  assert.throws(() => empty.get(a), { message: "Service not registered: synthetic-a" });
  for (const value of [0, -0, false, "", null, undefined, NaN]) {
    const key = descriptor<unknown>("synthetic-falsy");
    empty.register(key, value);
    assert.ok(Object.is(empty.getOptional(key), value));
    assert.throws(() => empty.get(key), { message: "Service not registered: synthetic-falsy" });
  }
  for (const name of ["", " ", "synthetic\0key", "synthetickey"]) {
    const value = Object.freeze({ name });
    empty.register(descriptor(name), value);
    assert.equal(empty.get(descriptor(name)), value);
  }
  let reads = 0;
  const dynamic: ServiceDescriptor<unknown> = {
    get channelName() {
      return ["synthetic-unregistered", "synthetic-error-key"][reads++]!;
    },
    get _brand() {
      throw new Error("phantom metadata must remain unread");
    },
  };
  assert.throws(() => empty.get(dynamic), {
    message: "Service not registered: synthetic-error-key",
  });
  assert.equal(reads, 2);
  const nativeFailure = new Error("synthetic getter failure");
  const throwingDescriptor: ServiceDescriptor<unknown> = {
    get channelName(): string {
      throw nativeFailure;
    },
  };
  assert.throws(
    () => empty.register(throwingDescriptor, first),
    (error: unknown) => error === nativeFailure,
  );
  assert.throws(
    () => empty.get(throwingDescriptor),
    (error: unknown) => error === nativeFailure,
  );
  assert.throws(
    () => empty.getOptional(throwingDescriptor),
    (error: unknown) => error === nativeFailure,
  );

  for (const override of [null, undefined, false, 0, "", NaN, first]) {
    const target = server();
    const overrides = new Map<string, unknown>([["synthetic-a", override]]);
    const before: number = proxyInputs.length;
    collection.exposeOnChannelServer(target.instance, overrides);
    assert.ok(Object.is(proxyInputs[before], override ?? replacement));
    assert.equal(proxyInputs[before + 1], second);
    assert.equal(collection.get(a), replacement);
  }

  const overrideFailure = new Map<string, unknown>();
  Object.defineProperty(overrideFailure, "get", {
    value: function (this: Map<string, unknown>) {
      assert.equal(this, overrideFailure);
      throw nativeFailure;
    },
  });
  const beforeOverrideFailure = proxyInputs.length;
  const overrideTarget = server();
  assert.throws(
    () => collection.exposeOnChannelServer(overrideTarget.instance, overrideFailure),
    (error: unknown) => error === nativeFailure,
  );
  assert.equal(proxyInputs.length, beforeOverrideFailure);
  assert.equal(overrideTarget.exposed.length, 0);
  proxyFailure = nativeFailure;
  const proxyTarget = server();
  assert.throws(
    () => collection.exposeOnChannelServer(proxyTarget.instance),
    (error: unknown) => error === nativeFailure,
  );
  assert.equal(proxyTarget.exposed.length, 0);
  proxyFailure = undefined;
  const serverTarget = server();
  serverTarget.setBeforeRegistration((name) => {
    if (name === "synthetic-b") throw nativeFailure;
  });
  assert.throws(
    () => collection.exposeOnChannelServer(serverTarget.instance),
    (error: unknown) => error === nativeFailure,
  );
  assert.deepEqual(
    serverTarget.exposed.map((value) => value.name),
    ["synthetic-a"],
  );
  assert.equal(collection.get(a), replacement);
  assert.equal(collection.get(b), second);

  const live = new ServiceCollection();
  const oldA = Object.freeze({ synthetic: "old-a" });
  const newA = Object.freeze({ synthetic: "new-a" });
  const oldB = Object.freeze({ synthetic: "old-b" });
  const newB = Object.freeze({ synthetic: "new-b" });
  const added = Object.freeze({ synthetic: "added" });
  live.register(a, oldA).register(b, oldB);
  const liveOverrides = new Map<string, unknown>();
  let mutated = false;
  Object.defineProperty(liveOverrides, "get", {
    value: function (this: Map<string, unknown>, name: string) {
      assert.equal(this, liveOverrides);
      if (!mutated && name === "synthetic-a") {
        mutated = true;
        live.register(a, newA).register(b, newB).register(descriptor("synthetic-c"), added);
      }
      return undefined;
    },
  });
  const liveTarget = server();
  const beforeLive = proxyInputs.length;
  live.exposeOnChannelServer(liveTarget.instance, liveOverrides);
  assert.deepEqual(
    liveTarget.exposed.map((value) => value.name),
    ["synthetic-a", "synthetic-b", "synthetic-c"],
  );
  assert.deepEqual(proxyInputs.slice(beforeLive), [oldA, newB, added]);
  assert.equal(live.get(a), newA);
  assert.equal(live.get(b), newB);
  assert.equal(live.get(descriptor("synthetic-c")), added);

  const propertyOrder = new ServiceCollection().register(a, first);
  const trace: string[] = [];
  const observedOverrides = new Map<string, unknown>();
  Object.defineProperty(observedOverrides, "get", {
    value: function (this: Map<string, unknown>) {
      assert.equal(this, observedOverrides);
      trace.push("override-get");
      return undefined;
    },
  });
  const getterFailureServer = Object.defineProperty({}, "registerChannel", {
    get: () => {
      trace.push("server-getter");
      throw nativeFailure;
    },
  }) as unknown as IChannelServer;
  const beforeGetterFailure = proxyInputs.length;
  assert.throws(
    () => propertyOrder.exposeOnChannelServer(getterFailureServer, observedOverrides),
    (error: unknown) => error === nativeFailure,
  );
  assert.equal(proxyInputs.length, beforeGetterFailure);
  assert.deepEqual(trace, ["override-get", "server-getter"]);
  trace.length = 0;
  const observedServer = Object.defineProperty({}, "registerChannel", {
    get: () => {
      trace.push("server-getter");
      const method = function (this: object, name: string, channel: object) {
        assert.equal(this, observedServer);
        assert.equal(name, "synthetic-a");
        assert.equal(channel, proxyOutputs.at(-1));
        trace.push("server-call");
      };
      Object.defineProperty(method, "call", {
        get: () => {
          throw new Error("no added method.call lookup");
        },
      });
      return method;
    },
  }) as unknown as IChannelServer;
  beforeProxy = () => {
    trace.push("proxy-call");
  };
  propertyOrder.exposeOnChannelServer(observedServer, observedOverrides);
  assert.deepEqual(trace, ["override-get", "server-getter", "proxy-call", "server-call"]);
  trace.length = 0;
  proxyFailure = nativeFailure;
  assert.throws(
    () => propertyOrder.exposeOnChannelServer(observedServer, observedOverrides),
    (error: unknown) => error === nativeFailure,
  );
  assert.deepEqual(trace, ["override-get", "server-getter", "proxy-call"]);
  proxyFailure = undefined;
  beforeProxy = undefined;
});
