// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { readFixture, rpc } from "./entry.mjs";

const {
  BufferReader,
  BufferWriter,
  CancellationTokenSource,
  DisposableStore,
  Emitter,
  Event,
  EventMultiplexer,
  Relay,
  VSBuffer,
  deserialize,
  serialize,
  toDisposable,
} = rpc;

test("B1 toDisposable 只执行一次且释放幂等", () => {
  let calls = 0;
  const disposable = toDisposable(() => calls++);
  disposable.dispose();
  disposable.dispose();
  assert.equal(calls, 1);
});

test("B1 DisposableStore 返回原对象、按加入顺序释放并拒绝释放后加入", () => {
  const order = [];
  const store = new DisposableStore();
  const first = store.add(toDisposable(() => order.push("first")));
  const second = store.add(toDisposable(() => order.push("second")));
  assert.equal(first.dispose instanceof Function, true);
  assert.equal(store.add(second), second);
  store.dispose();
  assert.deepEqual(order, ["first", "second"]);

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    let disposed = 0;
    const late = toDisposable(() => disposed++);
    assert.equal(store.add(late), late);
    assert.equal(disposed, 1);
    assert.deepEqual(warnings, ["Adding to a disposed DisposableStore"]);
  } finally {
    console.warn = originalWarn;
  }
  store.dispose();
  assert.deepEqual(order, ["first", "second"]);
});

test("B1 Event 组合器、Emitter 快照与 first/last 钩子", async () => {
  const emitter = new Emitter();
  let first = 0;
  let last = 0;
  const hooked = new Emitter({
    onWillAddFirstListener: () => first++,
    onDidRemoveLastListener: () => last++,
  });
  const hookedFirst = hooked.event(() => {});
  assert.equal(first, 1);
  const hookedSecond = hooked.event(() => {});
  assert.equal(first, 1);
  hookedFirst.dispose();
  assert.equal(last, 0);
  hookedSecond.dispose();
  assert.equal(last, 1);
  hookedSecond.dispose();
  assert.equal(last, 1);

  const seen = [];
  let aCalls = 0;
  let bCalls = 0;
  const subB = emitter.event(() => bCalls++);
  emitter.event((value) => {
    aCalls++;
    seen.push(value);
    if (value === 1) {
      emitter.fire(2);
      subB.dispose();
    }
  });
  emitter.fire(1);
  assert.deepEqual(seen, [1, 2]);
  assert.equal(aCalls, 2);
  assert.equal(bCalls, 2);
  emitter.fire(3);
  assert.equal(bCalls, 2);
  assert.equal(aCalls, 3);

  const onceValues = [];
  const once = Event.once(emitter.event);
  once((value) => onceValues.push(value));
  emitter.fire(4);
  emitter.fire(5);
  assert.deepEqual(onceValues, [4]);

  const filtered = [];
  const mapped = [];
  Event.filter(emitter.event, (value) => value % 2 === 0)((value) => filtered.push(value));
  Event.map(emitter.event, (value) => value * 10)((value) => mapped.push(value));
  emitter.fire(6);
  assert.deepEqual(filtered, [6]);
  assert.deepEqual(mapped, [60]);

  const none = Event.None(() => assert.fail("Event.None 不应触发"));
  none.dispose();
  const pending = Event.toPromise(Event.once(emitter.event));
  emitter.fire(7);
  assert.equal(await pending, 7);

  const disposedEmitter = new Emitter();
  const subscription = disposedEmitter.event(() => assert.fail("dispose 后不应触发"));
  disposedEmitter.dispose();
  disposedEmitter.fire("ignored");
  subscription.dispose();
});

test("B1 Relay、EventMultiplexer 释放旧输入", () => {
  const first = new Emitter();
  const second = new Emitter();
  const relay = new Relay();
  const values = [];
  const subscription = relay.event((value) => values.push(value));
  relay.input = first.event;
  first.fire(1);
  relay.input = second.event;
  first.fire(2);
  second.fire(3);
  assert.deepEqual(values, [1, 3]);
  relay.dispose();
  second.fire(4);
  subscription.dispose();
  assert.deepEqual(values, [1, 3]);

  const left = new Emitter();
  const right = new Emitter();
  const multiplexer = new EventMultiplexer();
  const merged = [];
  multiplexer.add(left.event);
  multiplexer.add(right.event);
  multiplexer.event((value) => merged.push(value));
  left.fire("l");
  right.fire("r");
  multiplexer.dispose();
  left.fire("l2");
  right.fire("r2");
  assert.deepEqual(merged, ["l", "r"]);
});

test("B2 CancellationTokenSource 的旧行为与幂等", () => {
  const source = new CancellationTokenSource();
  const token = source.token;
  assert.equal(source.token, token);
  const calls = [];
  token.onCancellationRequested(() => calls.push("a"));
  token.onCancellationRequested(() => calls.push("b"));
  assert.equal(token.isCancellationRequested, false);
  source.cancel();
  source.cancel();
  assert.deepEqual(calls, ["a", "b"]);
  assert.equal(token.isCancellationRequested, false);

  source.dispose();
  source.cancel();
  assert.deepEqual(calls, ["a", "b"]);
});

test("B3 VSBuffer 的复制、同一性与边界语义", () => {
  const allocated = VSBuffer.alloc(4);
  assert.deepEqual([...allocated.buffer], [0, 0, 0, 0]);

  const raw = new Uint8Array([1, 2, 3]);
  assert.equal(VSBuffer.wrap(raw).buffer, raw);

  const utf8 = VSBuffer.fromString("你好");
  assert.equal(utf8.byteLength, 6);
  assert.equal(utf8.toString(), "你好");

  const joined = VSBuffer.concat([VSBuffer.fromString("ab"), VSBuffer.fromString("cd")]);
  assert.equal(joined.toString(), "abcd");
  const padded = VSBuffer.concat([VSBuffer.fromString("ab")], 4);
  assert.equal(padded.byteLength, 4);
  assert.deepEqual([...padded.buffer], [97, 98, 0, 0]);
  assert.throws(
    () => VSBuffer.concat([VSBuffer.fromString("ab"), VSBuffer.fromString("cd")], 3),
    RangeError,
  );

  const original = VSBuffer.fromString("abc");
  const slice = original.slice(0, 2);
  original.writeUInt8(65, 0);
  assert.equal(slice.toString(), "ab");
  slice.writeUInt8(66, 0);
  assert.equal(original.toString(), "Abc");

  const word = VSBuffer.alloc(4);
  word.writeUInt32BE(0xffffffff, 0);
  assert.equal(word.readUInt32BE(0), 4294967295);
  word.writeUInt32BE(0x01020304, 0);
  assert.equal(word.readUInt32BE(0), 0x01020304);
  assert.equal(word.readUInt8(99), undefined);
  word.writeUInt8(9, 99);
  assert.equal(word.byteLength, 4);

  const target = VSBuffer.alloc(4);
  target.set(VSBuffer.fromString("xy"));
  target.set(new Uint8Array([122]), 2);
  assert.equal(target.toString(), "xyz\0");
});

test("B4 VQL 序列化与旧实现录制的字节一致", () => {
  const fixture = readFixture("wire", "serialization.json").cases;
  const factories = {
    undefined: () => undefined,
    "string-ascii": () => "hi",
    "string-utf8": () => "你好",
    "string-empty": () => "",
    uint8array: () => new Uint8Array([1, 2, 255]),
    vsbuffer: () => VSBuffer.fromString("ab"),
    "array-mixed": () => [1, "a", undefined],
    "array-empty": () => [],
    "object-simple": () => ({ a: 1 }),
    "object-empty": () => ({}),
    "object-nested-bytes": () => ({ bytes: new Uint8Array([1, 2]) }),
    "object-null": () => null,
    "object-bool": () => true,
    "int-zero": () => 0,
    "int-127": () => 127,
    "int-128": () => 128,
    "int-300": () => 300,
    "int-max": () => 2147483647,
    "int-negative-one": () => -1,
    "int-negative-min": () => -2147483648,
    float: () => 1.5,
  };
  for (const [name, expectedHex] of Object.entries(fixture)) {
    const writer = new BufferWriter();
    serialize(writer, factories[name]());
    assert.equal(
      Buffer.from(writer.buffer.buffer).toString("hex"),
      expectedHex,
      `序列化字节不符: ${name}`,
    );
  }

  const roundtrip = (value) =>
    deserialize(
      new BufferReader(
        (() => {
          const writer = new BufferWriter();
          serialize(writer, value);
          return writer.buffer;
        })(),
      ),
    );
  assert.equal(roundtrip(undefined), undefined);
  assert.equal(roundtrip("hi"), "hi");
  assert.deepEqual([...roundtrip(new Uint8Array([1, 2, 255]))], [1, 2, 255]);
  assert.equal(roundtrip(VSBuffer.fromString("ab")).toString(), "ab");
  assert.deepEqual(roundtrip([1, "a", undefined]), [1, "a", undefined]);
  assert.deepEqual(roundtrip({ a: 1 }), { a: 1 });
  assert.equal(roundtrip(-1), -1);
  assert.equal(roundtrip(-2147483648), -2147483648);
  assert.equal(roundtrip(1.5), 1.5);
  assert.equal(roundtrip(true), true);
  assert.equal(roundtrip(null), null);
  assert.deepEqual([...roundtrip({ bytes: new Uint8Array([1, 2]) }).bytes], [1, 2]);

  const legacy = roundtrip({
    __zcode_rpc_nested_uint8array_v1: true,
    base64: "AQI=",
  });
  assert.ok(legacy instanceof Uint8Array);
  assert.deepEqual([...legacy], [1, 2]);

  const threeKeys = roundtrip({
    __knorvia_rpc_nested_uint8array_v1: true,
    base64: "AQI=",
    extra: 1,
  });
  assert.equal(threeKeys instanceof Uint8Array, false);
  assert.equal(threeKeys.extra, 1);

  const invalidTag = new BufferReader(VSBuffer.fromString("\u0007"));
  assert.equal(deserialize(invalidTag), undefined);
});

test("B4 BufferReader/BufferWriter 的读取推进与重复拼接", () => {
  const reader = new BufferReader(VSBuffer.fromString("abc"));
  const short = reader.read(5);
  assert.equal(short.toString(), "abc");
  assert.equal(reader.read(1).byteLength, 0);

  const writer = new BufferWriter();
  writer.write(VSBuffer.fromString("a"));
  const first = writer.buffer;
  writer.write(VSBuffer.fromString("b"));
  const second = writer.buffer;
  assert.equal(first.toString(), "a");
  assert.equal(second.toString(), "ab");
});
