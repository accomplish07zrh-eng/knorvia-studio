import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// All package imports and timers are synthetic. No native transport is constructed.
const foundation = `
export function toDisposable(fn) { let live=true; return { dispose(){if(live){live=false;fn()}} }; }
export class Emitter {
  listeners=new Set(); disposed=false;
  constructor(options={}){this.options=options}
  get event(){return listener=>{if(this.disposed)return toDisposable(()=>{}); const first=this.listeners.size===0; this.listeners.add(listener); if(first)this.options.onWillAddFirstListener?.(); return toDisposable(()=>{this.listeners.delete(listener);if(!this.listeners.size)this.options.onDidRemoveLastListener?.()})}}
  fire(value){if(!this.disposed)for(const listener of [...this.listeners])listener(value)}
  dispose(){this.disposed=true;this.listeners.clear()}
}
export const Event={None:()=>toDisposable(()=>{}),toPromise:event=>new Promise(resolve=>{let subscription;subscription=event(value=>{subscription.dispose();resolve(value)})})};
export const CancellationToken={None:{isCancellationRequested:false,onCancellationRequested:Event.None}};
export class CancellationTokenSource {
  emitter=new Emitter(); token={isCancellationRequested:false,onCancellationRequested:this.emitter.event}; cancelled=false;
  cancel(){if(!this.cancelled){this.cancelled=true;this.emitter.fire()}}
}
export class DisposableStore { items=new Set();add(item){this.items.add(item);return item}dispose(){for(const item of this.items)item.dispose();this.items.clear()} }
`;
const ports = {
  "./foundation.js": foundation,
  "./channels.shared.js": `export const RequestType={Promise:100,PromiseCancel:101,EventListen:102,EventDispose:103};export const ResponseType={Initialize:200,PromiseSuccess:201,PromiseError:202,PromiseErrorObj:203,EventFire:204};`,
  "./serialization.js": `export class BufferWriter {buffer=[]} export class BufferReader {constructor(buffer){this.buffer=buffer;this.offset=0}} export const serialize=(writer,value)=>writer.buffer.push(value);export const deserialize=reader=>reader.buffer[reader.offset++];`,
  "./buffer.js": `export class VSBuffer {constructor(buffer){this.buffer=buffer}static alloc(size){return new VSBuffer(Buffer.alloc(size))}get byteLength(){return this.buffer.length}readUInt8(offset){return this.buffer.readUInt8(offset)}readUInt32BE(offset){return this.buffer.readUInt32BE(offset)}}`,
  "./protocol.js": `import {VSBuffer} from './buffer.js';
export const HEADER_SIZE=13;export const ProtocolMessageType={Regular:1,Ack:3,Disconnect:5,KeepAlive:9};
export class ProtocolMessage {constructor(type,id,ack,data){Object.assign(this,{type,id,ack,data})}}
export const writeProtocolMessage=message=>message;
export class ChunkStream {
  buffer=Buffer.alloc(0);get byteLength(){return this.buffer.length}
  acceptChunk(chunk){this.buffer=Buffer.concat([this.buffer,chunk.buffer])}
  peek(size){return this.buffer.length<size?null:new VSBuffer(this.buffer.subarray(0,size))}
  skip(size){this.buffer=this.buffer.subarray(size)}
  read(size){const value=this.peek(size);if(value)this.skip(size);return value}
}`,
};

async function owner(name, timers) {
  const root = process.env.KNORVIA_RPC_OWNER_ROOT;
  const entry = root
    ? `${root}/${name}.ts`
    : fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url));
  const key = `knorvia.synthetic.rpc.${name}`;
  globalThis[Symbol.for(key)] = timers;
  const output = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    banner: {
      js: `const timers=globalThis[Symbol.for('${key}')]; const setTimeout=timers.set, clearTimeout=timers.clear, setInterval=timers.set, clearInterval=timers.clear;`,
    },
    plugins: [
      {
        name: "synthetic-rpc-ports",
        setup(plugin) {
          plugin.onResolve({ filter: /^\.\// }, ({ path }) => {
            assert.ok(Object.hasOwn(ports, path), `unexpected dependency: ${path}`);
            return { path, namespace: "synthetic" };
          });
          plugin.onLoad({ filter: /.*/, namespace: "synthetic" }, ({ path }) => ({
            contents: ports[path],
            loader: "js",
          }));
        },
      },
    ],
  });
  try {
    return await import(
      `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
    );
  } finally {
    delete globalThis[Symbol.for(key)];
  }
}

function timers() {
  let id = 0;
  const pending = new Map();
  return {
    pending,
    set: (callback, delay) => {
      pending.set(++id, { callback, delay });
      return id;
    },
    clear: (id) => pending.delete(id),
  };
}
function event() {
  const listeners = new Set();
  return {
    listeners,
    subscribe: (fn) => {
      listeners.add(fn);
      return { dispose: () => listeners.delete(fn) };
    },
    fire: (value) => {
      const snapshot = [...listeners];
      for (const fn of snapshot) fn(value);
    },
  };
}
function transport() {
  const messages = event();
  const writes = [];
  return {
    messages,
    writes,
    onMessage: messages.subscribe,
    send: (message) => writes.push(message),
  };
}
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

test("client close rejects pending calls by identity and blocks late initialization; cancel owns its frame", async () => {
  const { ChannelClient } = await owner("channelClient", timers());
  const port = transport();
  const client = new ChannelClient(port);
  const channel = client.getChannel("synthetic");
  const reason = new Error("synthetic connection closed");
  const first = channel.call("first").catch((error) => error);
  const second = channel.call("second").catch((error) => error);
  client.dispose(reason);
  port.messages.fire([[200], undefined]);
  assert.equal(await first, reason);
  assert.equal(await second, reason);
  assert.deepEqual(port.writes, []);
  assert.equal(port.messages.listeners.size, 0);

  const activePort = transport();
  const active = new ChannelClient(activePort);
  activePort.messages.fire([[200], undefined]);
  const cancelled = event();
  const response = active
    .getChannel("synthetic")
    .call(
      "admitted",
      { value: 1 },
      { isCancellationRequested: false, onCancellationRequested: cancelled.subscribe },
    )
    .catch((error) => error);
  cancelled.fire();
  activePort.messages.fire([[201, 0], "late response"]);
  assert.equal((await response).message, "Cancelled");
  assert.deepEqual(activePort.writes, [
    [[100, 0, "synthetic", "admitted"], { value: 1 }],
    [[101, 0], undefined],
  ]);
  assert.equal(cancelled.listeners.size, 0);
  active.dispose();
});

test("server admits only registered channel and retains caller context/cancellation ownership", async () => {
  const clock = timers();
  const { ChannelServer } = await owner("channelServer", clock);
  const port = transport();
  class Derived extends ChannelServer {
    ready() {
      throw new Error("constructor must not invoke override");
    }
  }
  const context = { synthetic: true };
  const server = new Derived(port, context, 17);
  assert.deepEqual(port.writes, [[[200], undefined]]);
  let calls = 0,
    cancellations = 0,
    resolve;
  server.registerChannel("admitted", {
    call(ctx, command, arg, token) {
      assert.equal(ctx, context);
      assert.equal(command, "owned");
      assert.deepEqual(arg, { value: 2 });
      calls++;
      token.onCancellationRequested(() => cancellations++);
      return new Promise((done) => {
        resolve = done;
      });
    },
  });
  port.messages.fire([[100, 8, "unknown", "owned"], {}]);
  port.messages.fire([[101, 8], undefined]);
  assert.equal(calls, 0);
  const timeout = [...clock.pending.values()].find((item) => item.delay === 17);
  const originalError = console.error;
  const diagnostics = [];
  try {
    console.error = (value) => diagnostics.push(value);
    timeout.callback();
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(diagnostics, ["Unknown channel: unknown"]);
  assert.deepEqual(port.writes.at(-1), [
    [202, 8],
    {
      name: "Unknown channel",
      message: "Channel name 'unknown' timed out after 17ms",
      stack: undefined,
    },
  ]);
  port.messages.fire([[100, 9, "admitted", "owned"], { value: 2 }]);
  port.messages.fire([[101, 9], undefined]);
  assert.equal(calls, 1);
  assert.equal(cancellations, 1);
  resolve("late compatible result");
  await settle();
  assert.deepEqual(port.writes.at(-1), [[201, 9], "late compatible result"]);
  assert.equal(cancellations, 1);
  server.dispose();
  assert.equal(port.messages.listeners.size, 0);
});

function socket() {
  const data = event(),
    close = event();
  return {
    data,
    close,
    writes: [],
    disposed: 0,
    onData: data.subscribe,
    onClose: close.subscribe,
    write(message) {
      this.writes.push(message);
    },
    drain: async () => {},
    dispose() {
      this.disposed++;
    },
  };
}
function bytes(size) {
  const buffer = Buffer.alloc(size);
  return {
    buffer,
    byteLength: size,
    readUInt8: (offset) => buffer.readUInt8(offset),
    readUInt32BE: (offset) => buffer.readUInt32BE(offset),
  };
}
function frame(type, id, ack, payload = Buffer.alloc(0)) {
  const buffer = Buffer.alloc(13 + payload.length);
  buffer.writeUInt8(type, 0);
  buffer.writeUInt32BE(id, 1);
  buffer.writeUInt32BE(ack, 5);
  buffer.writeUInt32BE(payload.length, 9);
  payload.copy(buffer, 13);
  return { buffer, byteLength: buffer.length };
}
test("replay bounds preserve strict edges, full-frame ACK admission and owned socket replacement", async () => {
  const clock = timers();
  const { PersistentProtocol } = await owner("persistent-protocol", clock);
  const first = socket();
  const protocol = new PersistentProtocol(first, {
    saturationHighWaterMarkBytes: 2,
    saturationLowWaterMarkBytes: 1,
    replayBufferMaxBytes: 4,
  });
  let saturated = 0,
    drained = 0,
    closed = 0;
  protocol.onSaturated(() => saturated++);
  protocol.onDrained(() => drained++);
  protocol.onClose(() => closed++);
  const firstPayload = bytes(2),
    secondPayload = bytes(1);
  protocol.send(firstPayload);
  assert.equal(saturated, 0);
  protocol.send(secondPayload);
  assert.equal(saturated, 1);
  const ack = frame(9, 0, 1, Buffer.from("synthetic"));
  first.data.fire({ buffer: ack.buffer.subarray(0, 13), byteLength: 13 });
  assert.equal(protocol.unacknowledgedBytes, 3);
  assert.equal(drained, 0);
  first.data.fire({ buffer: ack.buffer.subarray(13), byteLength: ack.byteLength - 13 });
  assert.equal(protocol.unacknowledgedBytes, 1);
  assert.equal(drained, 1);
  const second = socket();
  protocol.replaceSocket(second);
  assert.equal(first.disposed, 0);
  assert.equal(first.data.listeners.size, 0);
  assert.equal(first.close.listeners.size, 0);
  assert.equal(second.writes[0], first.writes[1]);
  assert.equal(second.writes[0].data, secondPayload);
  protocol.send(bytes(3));
  assert.equal(closed, 0);
  assert.equal(protocol.unacknowledgedBytes, 4);
  protocol.send(bytes(1));
  assert.equal(closed, 1);
  assert.equal(protocol.unacknowledgedBytes, 5);
  const disconnect = second.writes.at(-1);
  assert.deepEqual(
    [disconnect.type, disconnect.id, disconnect.ack, disconnect.data.byteLength],
    [5, 0, 0, 0],
  );
  protocol.send(bytes(1));
  assert.equal(closed, 1);
  assert.equal(second.writes.filter((message) => message.type === 5).length, 1);
  protocol.dispose();
  assert.equal(second.disposed, 1);
  assert.equal(clock.pending.size, 0);
});
