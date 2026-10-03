import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const baseline = process.env.KNORVIA_LIFECYCLE_BASELINE;
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function load(name, ports = {}, globals = {}) {
  const path = `packages/server/src/${name}.ts`;
  const source = baseline
    ? execFileSync("git", ["show", `${baseline}:${path}`], { encoding: "utf8" })
    : readFileSync(path, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    require(id) {
      if (Object.hasOwn(ports, id)) return ports[id];
      if (id.startsWith("node:")) return require(id);
      throw new Error(`Unprovided dependency: ${id}`);
    },
    Buffer,
    Error,
    URL,
    process: { env: {}, pid: 1, cwd: () => "/synthetic" },
    console: { log() {} },
    ...globals,
  });
  return exports;
}
function clock() {
  const pending = new Map();
  let next = 0;
  return {
    pending,
    setTimeout(fn, ms) {
      const id = ++next;
      pending.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    fireFirst() {
      const [id, timer] = pending.entries().next().value;
      pending.delete(id);
      timer.fn();
    },
  };
}
function lifecycle(overrides = {}) {
  const time = clock();
  const stdin = new EventEmitter();
  const signals = new EventEmitter();
  const steps = [];
  const logs = [];
  const rpc = deferred();
  const services = deferred();
  load("stdio-lifecycle", {}, time).registerStdioProcessLifecycle({
    stdin,
    signalSource: signals,
    log: (...args) => logs.push(args),
    stopRpc: () => {
      steps.push("rpc");
      return rpc.promise;
    },
    dispose: () => {
      steps.push("services");
      return services.promise;
    },
    exit: (code) => steps.push(`exit:${code}`),
    ...overrides,
  });
  return { time, stdin, signals, steps, logs, rpc, services };
}

test("EOF stops admission immediately; later signals raise severity without duplicate disposal", async () => {
  const h = lifecycle();
  h.stdin.emit("end");
  assert.deepEqual(h.steps, ["rpc"]);
  assert.equal([...h.time.pending.values()][0].ms, 1000);
  h.signals.emit("SIGTERM");
  h.stdin.emit("end");
  h.rpc.resolve();
  await flush();
  assert.deepEqual(h.steps, ["rpc", "services"]);
  assert.equal([...h.time.pending.values()][0].ms, 3500);
  h.services.resolve();
  await flush();
  h.signals.emit("SIGHUP");
  assert.deepEqual(h.steps, ["rpc", "services", "exit:1"]);
  assert.equal(h.time.pending.size, 0);
  assert.equal(h.logs.filter(([message]) => message === "stdio shutdown completed").length, 1);
  assert.equal(
    h.logs.filter(([message]) => message === "termination signal received, shutting down").length,
    2,
  );
});

test("phase failures preserve error identity and still advance through cleanup", async () => {
  const h = lifecycle();
  const inputError = new Error("synthetic-input");
  const rpcError = new Error("synthetic-rpc");
  const cleanupError = new Error("synthetic-cleanup");
  h.stdin.emit("error", inputError);
  h.rpc.reject(rpcError);
  await flush();
  assert.deepEqual(h.steps, ["rpc", "services"]);
  h.services.reject(cleanupError);
  await flush();
  assert.deepEqual(h.steps, ["rpc", "services", "exit:1"]);
  assert.equal(h.logs.find(([m]) => m === "stdin error, shutting down")[1], inputError);
  assert.equal(h.logs.find(([m]) => m === "stdio shutdown RPC stop failed")[1], rpcError);
  assert.equal(h.logs.find(([m]) => m === "stdio shutdown cleanup failed")[1], cleanupError);
  assert.equal(h.time.pending.size, 0);
});

test("independent phase deadlines use explicit budgets and observe late rejections", async () => {
  const h = lifecycle({ shutdownTimeoutMs: 91, rpcStopTimeoutMs: -1, serviceDisposeTimeoutMs: 7 });
  h.stdin.emit("end");
  assert.equal([...h.time.pending.values()][0].ms, 0);
  h.time.fireFirst();
  await flush();
  assert.deepEqual(h.steps, ["rpc", "services"]);
  assert.equal([...h.time.pending.values()][0].ms, 7);
  h.time.fireFirst();
  await flush();
  assert.deepEqual(h.steps, ["rpc", "services", "exit:1"]);
  h.rpc.reject(new Error("synthetic-late-rpc"));
  h.services.reject(new Error("synthetic-late-cleanup"));
  await flush();
  assert.equal(h.logs.filter(([m]) => m === "stdio shutdown timed out").length, 2);
  assert.equal(h.logs.filter(([m]) => m === "stdio shutdown completed").length, 1);
  assert.equal(
    h.logs.some(([m]) => m.endsWith("failed")),
    false,
  );
});

function transportPorts() {
  const order = [];
  const instances = [];
  const configs = [];
  const disposal = deferred();
  const agentKey = { channelName: "synthetic-agent" };
  const scopedService = {};
  class Emitter {
    listeners = [];
    event = (listener) => {
      this.listeners.push(listener);
      return { dispose() {} };
    };
    fire(value) {
      for (const listener of this.listeners) listener(value);
    }
  }
  class SocketProtocol {
    constructor(socket) {
      this.socket = socket;
      instances.push(this);
    }
  }
  class ChannelServer {
    constructor(protocol, name) {
      this.protocol = protocol;
      this.name = name;
    }
    dispose() {
      order.push("channels");
    }
  }
  class LoggingChannelServer {
    constructor(raw) {
      this.raw = raw;
    }
  }
  const rpc = {
    Emitter,
    SocketProtocol,
    ChannelServer,
    LoggingChannelServer,
    VSBuffer: { wrap: (buffer) => ({ buffer }) },
  };
  const servicesPort = {
    IKnorviaAgentService: agentKey,
    createKnorviaAgentConnectionScope(_agent, config) {
      configs.push(config);
      return {
        service: scopedService,
        dispose: () => {
          order.push("scope");
          return disposal.promise;
        },
      };
    },
  };
  let exposed;
  const services = {
    getOptional: (key) => {
      assert.equal(key, agentKey);
      return {};
    },
    exposeOnChannelServer(server, overrides) {
      exposed = { server, overrides };
    },
  };
  return {
    rpc,
    servicesPort,
    services,
    order,
    instances,
    configs,
    disposal,
    scopedService,
    get exposed() {
      return exposed;
    },
  };
}
function stdioPorts() {
  const p = transportPorts();
  const stdin = new EventEmitter();
  stdin.destroy = () => p.order.push("socket");
  const stdout = new EventEmitter();
  stdout.writableNeedDrain = false;
  stdout.writes = [];
  stdout.write = (bytes) => stdout.writes.push(bytes);
  stdout.end = () => p.order.push("stdout-end");
  const owner = load(
    "stdio",
    { "@knorvia/rpc": p.rpc, "@knorvia/services": p.servicesPort },
    { process: { stdin, stdout } },
  );
  return { p, stdin, stdout, owner };
}

test("stdio copies input bytes, honors drain and preserves repeated close/end ordering", async () => {
  const { owner, stdin, stdout, p } = stdioPorts();
  const socket = owner.wrapStdio();
  let delivered;
  const events = [];
  socket.onData((value) => {
    delivered = value.buffer;
  });
  socket.onClose(() => events.push("close"));
  socket.onEnd(() => events.push("end"));
  const input = Buffer.from([0, 255, 3]);
  stdin.emit("data", input);
  input[1] = 0;
  assert.deepEqual(Array.from(delivered), [0, 255, 3]);
  socket.write({ buffer: Uint8Array.from([4, 5]) });
  assert.deepEqual(stdout.writes[0], Buffer.from([4, 5]));
  await socket.drain();
  stdout.writableNeedDrain = true;
  let drained = false;
  const wait = socket.drain().then(() => {
    drained = true;
  });
  await flush();
  assert.equal(drained, false);
  stdout.emit("drain");
  await wait;
  assert.equal(stdout.listenerCount("drain"), 0);
  stdin.emit("end");
  stdin.emit("error", new Error("synthetic-stream"));
  assert.deepEqual(events, ["close", "end", "close", "end"]);
  socket.end();
  socket.dispose();
  assert.deepEqual(p.order, ["stdout-end", "socket"]);
});

test("stdio stop memoizes its promise, removes admission first and disposes socket after scope failure", async () => {
  const { owner, p } = stdioPorts();
  const server = owner.createStdioServer(p.services);
  assert.equal(p.exposed.overrides.get("synthetic-agent"), p.scopedService);
  assert.equal(p.configs[0].clientMode, "desktop-continuous");
  assert.equal(p.configs[0].role, "trusted-host-relay");
  assert.match(p.configs[0].connectionId, /^server-stdio-/);
  const first = server.stop();
  assert.equal(first, server.stop());
  assert.deepEqual(p.order, ["channels", "scope"]);
  const error = new Error("synthetic-disposal");
  const rejected = assert.rejects(first, (actual) => actual === error);
  p.disposal.reject(error);
  await rejected;
  assert.equal(first, server.stop());
  assert.deepEqual(p.order, ["channels", "scope", "socket"]);
});

test("HTTP WebSockets retain mode/role, copied bytes and scope-before-channel cleanup", async () => {
  for (const [path, mode, role] of [
    ["/ws", "web-remote-replayable", "terminal-client"],
    ["/ws/host", "desktop-continuous", "trusted-host-relay"],
  ]) {
    const p = transportPorts();
    const routes = new Map();
    let injected;
    const server = {};
    class Hono {
      fetch = () => {};
      get(path, handler) {
        routes.set(path, handler);
      }
      post() {}
      use() {}
    }
    const owner = load("http", {
      "@knorvia/rpc": p.rpc,
      "@knorvia/services": p.servicesPort,
      "@knorvia/shared": { formatLogPrefix: () => "synthetic" },
      hono: { Hono },
      "@hono/node-server": { serve: () => server },
      "@hono/node-ws": {
        createNodeWebSocket: () => ({
          upgradeWebSocket: (factory) => factory,
          injectWebSocket: (actual) => {
            injected = actual;
          },
        }),
      },
      "./hostCapability.js": { createHostCapabilityStore: () => ({}) },
      "./remote/index.js": {},
    });
    assert.equal(owner.createHttpServer(p.services), server);
    assert.equal(injected, server);
    const ws = new EventEmitter();
    ws.OPEN = 1;
    ws.readyState = 1;
    const writes = [];
    ws.send = (bytes) => writes.push(bytes);
    ws.close = () => p.order.push("ws-close");
    routes.get(path)({}).onOpen({}, { raw: ws });
    assert.equal(p.configs[0].clientMode, mode);
    assert.equal(p.configs[0].role, role);
    const socket = p.instances[0].socket;
    const bytes = Buffer.from([1, 255]);
    let delivered;
    socket.onData((value) => {
      delivered = value.buffer;
    });
    ws.emit("message", bytes);
    bytes[1] = 0;
    assert.deepEqual(Array.from(delivered), [1, 255]);
    socket.write({ buffer: delivered });
    ws.readyState = 0;
    socket.write({ buffer: delivered });
    assert.equal(writes.length, 1);
    assert.equal(writes[0], delivered);
    await socket.drain();
    ws.emit("close");
    assert.deepEqual(p.order, ["scope", "channels"]);
    p.disposal.resolve();
    await flush();
    assert.deepEqual(p.order, ["scope", "channels"]);
  }
});
