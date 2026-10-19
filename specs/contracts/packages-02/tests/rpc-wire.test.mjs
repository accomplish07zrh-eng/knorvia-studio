// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { readFixture, rpc } from "./entry.mjs";

const {
  ChunkStream,
  Emitter,
  MessagePortProtocol,
  PersistentProtocol,
  ProtocolMessage,
  ProtocolMessageType,
  SocketProtocol,
  VSBuffer,
  createQueuePair,
} = rpc;

const frames = readFixture("wire", "frames.json");
const bufferFromHex = (hex) => VSBuffer.wrap(new Uint8Array(Buffer.from(hex, "hex")));
const hexOf = (buffer) => Buffer.from(buffer.buffer).toString("hex");

function createFakeSocket() {
  const data = new Emitter();
  const close = new Emitter();
  const end = new Emitter();
  const state = { writes: [], ended: 0, disposed: 0 };
  const socket = {
    onData: data.event,
    onClose: close.event,
    onEnd: end.event,
    write(buffer) {
      state.writes.push(hexOf(buffer));
    },
    end() {
      state.ended++;
    },
    async drain() {},
    dispose() {
      state.disposed++;
    },
  };
  return { socket, data, close, end, state };
}

test("B5 ChunkStream 拼接、消费与越界错误", () => {
  const stream = new ChunkStream();
  stream.acceptChunk(VSBuffer.fromString("ab"));
  stream.acceptChunk(VSBuffer.fromString("cd"));
  assert.equal(stream.byteLength, 4);
  assert.equal(stream.peek(3).toString(), "abc");
  assert.equal(stream.byteLength, 4);
  assert.equal(stream.peek(5), null);
  assert.equal(stream.read(3).toString(), "abc");
  assert.equal(stream.byteLength, 1);
  assert.equal(stream.read(2), null);
  assert.throws(() => stream.skip(2), {
    message: "ChunkStream.skip(2) 超出可读范围",
  });
  stream.skip(1);
  assert.equal(stream.byteLength, 0);
});

test("B5 ProtocolMessageType 数值与 13 字节帧头", () => {
  assert.deepEqual(
    {
      None: ProtocolMessageType.None,
      Regular: ProtocolMessageType.Regular,
      Control: ProtocolMessageType.Control,
      Ack: ProtocolMessageType.Ack,
      Disconnect: ProtocolMessageType.Disconnect,
      ReplayRequest: ProtocolMessageType.ReplayRequest,
      Pause: ProtocolMessageType.Pause,
      Resume: ProtocolMessageType.Resume,
      KeepAlive: ProtocolMessageType.KeepAlive,
    },
    {
      None: 0,
      Regular: 1,
      Control: 2,
      Ack: 3,
      Disconnect: 5,
      ReplayRequest: 6,
      Pause: 7,
      Resume: 8,
      KeepAlive: 9,
    },
  );
  const message = new ProtocolMessage(
    ProtocolMessageType.Regular,
    0x01020304,
    0x05060708,
    VSBuffer.fromString("ab"),
  );
  assert.equal(message.byteLength, 15);
  assert.equal(message.id, 0x01020304);
  assert.equal(message.ack, 0x05060708);
  assert.equal(message.data.toString(), "ab");
});

test("B6 SocketProtocol 发送包帧与录制字节一致", () => {
  const harness = createFakeSocket();
  const protocol = new SocketProtocol(harness.socket);
  protocol.send(VSBuffer.fromString("ping"));
  assert.deepEqual(harness.state.writes, [frames.socketSendPing]);
  protocol.dispose();
});

test("B6 SocketProtocol 跨 chunk、多帧、零长度与非 Regular 帧", () => {
  const harness = createFakeSocket();
  const protocol = new SocketProtocol(harness.socket);
  const messages = [];
  protocol.onMessage((buffer) => messages.push(buffer));

  const fragmented = Buffer.from(frames.fragmentedFrame, "hex");
  harness.data.fire(bufferFromHex(fragmented.subarray(0, 5).toString("hex")));
  assert.deepEqual(messages, []);
  harness.data.fire(bufferFromHex(fragmented.subarray(5, 12).toString("hex")));
  assert.deepEqual(messages, []);
  harness.data.fire(bufferFromHex(fragmented.subarray(12).toString("hex")));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].toString(), "hello world");

  messages.length = 0;
  harness.data.fire(bufferFromHex(frames.incomingMulti));
  assert.equal(messages.length, 2);
  assert.equal(messages[0].toString(), "ab");
  assert.equal(messages[1].byteLength, 0);

  messages.length = 0;
  harness.data.fire(bufferFromHex(frames.zeroLengthRegular));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].byteLength, 0);

  messages.length = 0;
  harness.data.fire(bufferFromHex(frames.nonRegularOnly));
  assert.deepEqual(messages, []);
  protocol.dispose();
});

test("B6 SocketProtocol dispose 只退订，不释放 socket", () => {
  const harness = createFakeSocket();
  const protocol = new SocketProtocol(harness.socket);
  let received = 0;
  protocol.onMessage(() => received++);
  protocol.dispose();
  harness.data.fire(bufferFromHex(frames.zeroLengthRegular));
  assert.equal(received, 0);
  assert.equal(harness.state.disposed, 0);
  assert.equal(harness.state.ended, 0);
  protocol.dispose();
});

test("B6 createQueuePair 宏任务投递", async () => {
  const [left, right] = createQueuePair();
  const received = [];
  right.onMessage((buffer) => received.push(buffer.toString()));
  left.send(VSBuffer.fromString("queued"));
  assert.deepEqual(received, []);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(received, ["queued"]);
});

test("B7 MessagePortProtocol 控制消息、二进制同一性与释放", () => {
  const listeners = new Set();
  const posted = [];
  let started = 0;
  let closed = 0;
  const port = {
    addEventListener(type, listener) {
      assert.equal(type, "message");
      listeners.add(listener);
    },
    removeEventListener(type, listener) {
      assert.equal(type, "message");
      listeners.delete(listener);
    },
    postMessage(message) {
      posted.push(message);
    },
    start() {
      started++;
    },
    close() {
      closed++;
    },
  };
  const deliver = (data) => {
    for (const listener of listeners) listener({ data });
  };

  const protocol = new MessagePortProtocol(port);
  assert.equal(started, 1);
  const messages = [];
  const flows = [];
  protocol.onMessage((buffer) => messages.push(buffer));
  protocol.onFlowState((state) => flows.push(state));

  const bytes = new Uint8Array([1, 2, 3]);
  deliver(bytes);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].buffer, bytes);
  assert.deepEqual(flows, []);

  deliver({ __knorviaRpcControl: "connection-flow-v1", state: "saturated" });
  deliver({ __knorviaRpcControl: "connection-flow-v1", state: "drained" });
  assert.deepEqual(flows, ["saturated", "drained"]);
  assert.equal(messages.length, 1);

  deliver({ __knorviaRpcControl: "connection-flow-v1", state: "saturated", extra: true });
  deliver({ __knorviaRpcControl: "other", state: "saturated" });
  assert.deepEqual(flows, ["saturated", "drained"]);

  const outgoing = VSBuffer.fromString("out");
  protocol.send(outgoing);
  assert.equal(posted.at(-1), outgoing.buffer);
  protocol.sendFlowState("drained");
  assert.deepEqual(posted.at(-1), {
    __knorviaRpcControl: "connection-flow-v1",
    state: "drained",
  });

  protocol.disconnect();
  assert.equal(closed, 1);
  assert.equal(listeners.size, 0);
  deliver(bytes);
  assert.equal(messages.length, 1);
});

test("B6 PersistentProtocol 首帧 id=1、ack=0", () => {
  const harness = createFakeSocket();
  const protocol = new PersistentProtocol(harness.socket);
  protocol.send(VSBuffer.fromString("pong"));
  assert.deepEqual(harness.state.writes, [frames.persistentSendPongFirst]);
  protocol.dispose();
});
