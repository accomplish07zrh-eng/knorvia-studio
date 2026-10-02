import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Only these five pure owners may load. Every transport is a fake object below.
const names = ["protocol", "proxy-channel", "buffer", "foundation", "serialization"];
async function owners() {
  const root =
    process.env.KNORVIA_RPC_PRIMITIVES_ROOT ?? fileURLToPath(new URL("../src", import.meta.url));
  const output = await build({
    stdin: {
      contents: names.map((name) => `export * from '${name}.owner';`).join("\n"),
      loader: "js",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    plugins: [
      {
        name: "bounded-pure-owner-load",
        setup(plugin) {
          plugin.onResolve({ filter: /\.owner$/ }, ({ path }) => ({
            path: `${root}/${path.slice(0, -6)}.ts`,
          }));
          plugin.onResolve({ filter: /^\.\// }, ({ path }) => {
            const name = path.slice(2, -3);
            assert.ok(names.includes(name), `unexpected dependency: ${path}`);
            return { path: `${root}/${name}.ts` };
          });
        },
      },
    ],
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
  );
}
const loaded = owners();

function event() {
  const listeners = new Set();
  return {
    listeners,
    subscribe(callback) {
      listeners.add(callback);
      return {
        dispose() {
          listeners.delete(callback);
        },
      };
    },
    fire(value) {
      const snapshot = [...listeners];
      for (const callback of snapshot) callback(value);
    },
  };
}

test("MessagePort rejects forged controls and objects while preserving admitted binary identity and cleanup", async () => {
  const { MessagePortProtocol, VSBuffer } = await loaded;
  let handler,
    starts = 0,
    closes = 0;
  const sent = [];
  const port = {
    addEventListener(type, callback) {
      assert.equal(type, "message");
      handler = callback;
    },
    removeEventListener(type, callback) {
      assert.equal(type, "message");
      assert.equal(callback, handler);
      handler = undefined;
    },
    start() {
      starts++;
    },
    close() {
      closes++;
    },
    postMessage(value) {
      assert.equal(this, port);
      sent.push(value);
    },
  };
  const protocol = new MessagePortProtocol(port);
  const binary = [],
    states = [];
  protocol.onMessage((value) => binary.push(value));
  protocol.onFlowState((value) => states.push(value));
  for (const data of [
    null,
    {},
    [],
    { __knorviaRpcControl: "connection-flow-v1", state: "saturated", extra: true },
    { __knorviaRpcControl: "connection-flow-v1", state: "forged" },
    { __knorviaRpcControl: "other", state: "drained" },
  ])
    handler({ data });
  assert.deepEqual(binary, []);
  assert.deepEqual(states, []);
  handler({ data: { __knorviaRpcControl: "connection-flow-v1", state: "saturated" } });
  handler({ data: { __knorviaRpcControl: "connection-flow-v1", state: "drained" } });
  const bytes = new Uint8Array([0, 255, 3]);
  handler({ data: bytes });
  assert.deepEqual(states, ["saturated", "drained"]);
  assert.equal(binary[0].buffer, bytes);
  protocol.send(VSBuffer.wrap(bytes));
  protocol.sendFlowState("drained");
  assert.equal(sent[0], bytes);
  assert.deepEqual(sent[1], { __knorviaRpcControl: "connection-flow-v1", state: "drained" });
  protocol.disconnect();
  assert.equal(handler, undefined);
  assert.equal(closes, 1);
  assert.equal(starts, 1);
});

test("socket consumes only complete frames, retains wire bytes and delegates drain without disposing shared socket", async () => {
  const { SocketProtocol, ProtocolMessage, ProtocolMessageType, writeProtocolMessage, VSBuffer } =
    await loaded;
  const data = event(),
    writes = [];
  let drained = 0,
    disposed = 0;
  const socket = {
    onData: data.subscribe,
    write(value) {
      assert.equal(this, socket);
      writes.push(value);
    },
    async drain() {
      assert.equal(this, socket);
      drained++;
    },
    dispose() {
      disposed++;
    },
  };
  const protocol = new SocketProtocol(socket);
  const received = [];
  protocol.onMessage((value) => received.push(value));
  const payload = VSBuffer.wrap(new Uint8Array([0, 255]));
  const frame = writeProtocolMessage(
    new ProtocolMessage(ProtocolMessageType.Regular, 0x1020304, 0x5060708, payload),
  );
  assert.deepEqual([...frame.buffer], [1, 1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 2, 0, 255]);
  data.fire(frame.slice(0, 13));
  assert.deepEqual(received, []);
  data.fire(frame.slice(13, 14));
  assert.deepEqual(received, []);
  data.fire(frame.slice(14));
  assert.deepEqual([...received[0].buffer], [0, 255]);
  protocol.send(payload);
  assert.deepEqual([...writes[0].buffer], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 255]);
  await protocol.drain();
  assert.equal(drained, 1);
  protocol.dispose();
  assert.equal(data.listeners.size, 0);
  assert.equal(disposed, 0);
});

test("foundation cleanup latches before failure and broadcast uses one listener snapshot", async () => {
  const { toDisposable, DisposableStore, Emitter, CancellationTokenSource } = await loaded;
  const reason = new Error("synthetic dispose failure");
  let attempts = 0;
  const resource = toDisposable(() => {
    attempts++;
    throw reason;
  });
  assert.throws(
    () => resource.dispose(),
    (error) => error === reason,
  );
  resource.dispose();
  assert.equal(attempts, 1);
  const store = new DisposableStore();
  let childDisposed = 0;
  const child = {
    dispose() {
      childDisposed++;
    },
  };
  assert.equal(store.add(child), child);
  store.add(child);
  store.dispose();
  store.dispose();
  assert.equal(childDisposed, 1);
  const order = [];
  let last = 0;
  const emitter = new Emitter({ onDidRemoveLastListener: () => last++ });
  let second;
  emitter.event(() => {
    order.push("first");
    second.dispose();
    emitter.dispose();
  });
  second = emitter.event(() => order.push("second"));
  emitter.fire("synthetic");
  emitter.fire("dropped");
  assert.deepEqual(order, ["first", "second"]);
  assert.equal(last, 0);
  const cts = new CancellationTokenSource();
  const token = cts.token;
  let cancellations = 0;
  token.onCancellationRequested(() => cancellations++);
  cts.cancel();
  cts.cancel();
  assert.equal(cancellations, 1);
  assert.equal(cts.token, token);
  assert.equal(token.isCancellationRequested, false);
  cts.dispose();
});

test("proxy keeps receiver/context ownership, blocks then/symbol RPC probes and releases lazy event source", async () => {
  const { ProxyChannel } = await loaded;
  const source = event();
  let subscriptions = 0,
    removals = 0;
  const service = {
    marker: { synthetic: true },
    owned(value) {
      assert.equal(this, service);
      return { receiver: this.marker, value };
    },
    onOwned(listener) {
      subscriptions++;
      listener("during subscription");
      const d = source.subscribe(listener);
      return {
        dispose() {
          removals++;
          d.dispose();
        },
      };
    },
    onDynamicOwned(arg) {
      assert.equal(this, service);
      assert.equal(arg, "argument");
      return source.subscribe;
    },
  };
  const channel = ProxyChannel.fromService(service);
  assert.equal(subscriptions, 0);
  assert.deepEqual(await channel.call(undefined, "owned", [2]), {
    receiver: service.marker,
    value: 2,
  });
  const values = [],
    subscription = channel.listen(undefined, "onOwned")((value) => values.push(value));
  source.fire("live");
  assert.deepEqual(values, ["during subscription", "live"]);
  subscription.dispose();
  assert.equal(removals, 1);
  assert.equal(source.listeners.size, 0);
  channel.listen(undefined, "onDynamicOwned", "argument");
  const calls = [],
    remote = {
      async call(name, args) {
        assert.equal(this, remote);
        calls.push([name, args]);
        return "result";
      },
      listen(name, arg) {
        assert.equal(this, remote);
        calls.push([name, arg]);
        return source.subscribe;
      },
    };
  const context = { context: "first" },
    proxy = ProxyChannel.toService(remote, context);
  assert.equal(proxy.then, undefined);
  assert.equal(proxy[Symbol.toStringTag], undefined);
  assert.deepEqual(calls, []);
  const method = proxy.owned;
  context.context = "second";
  assert.equal(await method(3), "result");
  proxy.onDynamicOwned("arg");
  assert.deepEqual(calls, [
    ["owned", ["second", 3]],
    ["onDynamicOwned", "arg"],
  ]);
});

test("serialization admits exact legacy/current nested binary markers and preserves byte copy/alias boundaries", async () => {
  const { VSBuffer, BufferWriter, BufferReader, serialize, deserialize } = await loaded;
  const input = new Uint8Array([0, 128, 255]),
    wrapped = VSBuffer.wrap(input),
    copied = wrapped.slice(0);
  input[0] = 4;
  assert.equal(wrapped.buffer, input);
  assert.equal(copied.buffer[0], 0);
  const writer = new BufferWriter();
  serialize(writer, { bytes: input, name: "synthetic" });
  const encoded = writer.buffer;
  const json = encoded.toString();
  assert.ok(json.includes("__knorvia_rpc_nested_uint8array_v1"));
  const decoded = deserialize(new BufferReader(encoded));
  assert.ok(decoded.bytes instanceof Uint8Array);
  assert.deepEqual([...decoded.bytes], [4, 128, 255]);
  assert.notEqual(decoded.bytes, input);
  function objectFrame(value) {
    const body = VSBuffer.fromString(JSON.stringify(value));
    assert.ok(body.byteLength < 128);
    return VSBuffer.concat([VSBuffer.wrap(new Uint8Array([5, body.byteLength])), body]);
  }
  const legacy = deserialize(
    new BufferReader(objectFrame({ __zcode_rpc_nested_uint8array_v1: true, base64: "AP8=" })),
  );
  assert.deepEqual([...legacy], [0, 255]);
  const extra = {
    __knorvia_rpc_nested_uint8array_v1: true,
    base64: "AP8=",
    extra: "deny conversion",
  };
  assert.deepEqual(deserialize(new BufferReader(objectFrame(extra))), extra);
  const headerBody = new BufferWriter();
  serialize(headerBody, [100, 0, "c", "m"]);
  serialize(headerBody, undefined);
  assert.deepEqual([...headerBody.buffer.buffer], [4, 4, 6, 100, 6, 0, 1, 1, 99, 1, 1, 109, 0]);
});
