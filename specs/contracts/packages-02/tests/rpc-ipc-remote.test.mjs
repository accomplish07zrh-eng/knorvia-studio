// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { rpc } from "./entry.mjs";

const {
  Emitter,
  Event,
  createQueuePair,
  IPCServer,
  IPCClient,
  StaticRouter,
  RemoteAuthorityResolverService,
  RemoteSocketFactoryService,
  RemoteConnectionType,
  WebSocketRemoteConnection,
  ManagedRemoteConnection,
  createURITransformer,
  RemoteAgentConnection,
} = rpc;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, label = "condition") {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await delay(5);
  }
}

async function flushMicrotasks() {
  for (let index = 0; index < 20; index++) {
    await Promise.resolve();
  }
}

function createHub() {
  const onConnect = new Emitter();
  const server = new IPCServer(onConnect.event);
  return { server, onConnect };
}

function addClient(onConnect, ctx, setup) {
  const [serverProtocol, clientProtocol] = createQueuePair();
  const client = new IPCClient(clientProtocol, ctx);
  setup?.(client);
  const disconnect = new Emitter();
  onConnect.fire({ protocol: serverProtocol, onDidClientDisconnect: disconnect.event });
  return { client, disconnect };
}

test("B13 IPCServer 以首条消息建立连接并双向转发", async () => {
  const { server, onConnect } = createHub();
  server.registerChannel("serverEcho", {
    async call(ctx, command, arg) {
      return `${ctx}:${command}:${arg}`;
    },
    listen() {
      return Event.None;
    },
  });
  let added = null;
  let removed = null;
  server.onDidAddConnection((connection) => {
    added = connection;
  });
  server.onDidRemoveConnection((connection) => {
    removed = connection;
  });

  const { client, disconnect } = addClient(onConnect, "window-1", (target) => {
    target.registerChannel("clientEcho", {
      async call(ctx, command, arg) {
        return `client:${ctx}:${command}:${arg}`;
      },
      listen() {
        return Event.None;
      },
    });
  });

  await waitFor(() => server.connections.length === 1, "connection");
  assert.equal(added.ctx, "window-1");
  assert.equal(server.connections[0].ctx, "window-1");

  assert.equal(await client.getChannel("serverEcho").call("ping", 5), "window-1:ping:5");
  assert.equal(
    await server.getChannel("clientEcho", () => true).call("pong", 6),
    "client:window-1:pong:6",
  );

  disconnect.fire();
  await waitFor(() => server.connections.length === 0, "disconnection");
  assert.equal(removed.ctx, "window-1");

  server.dispose();
  server.dispose();
  assert.equal(server.connections.length, 0);
});

test("B13 getChannel(filter) 等待首个匹配连接", async () => {
  const { server, onConnect } = createHub();
  let settled = false;
  const pending = server
    .getChannel("late", (connection) => connection.ctx === "target")
    .call("go", 1)
    .then((value) => {
      settled = true;
      return value;
    });
  await delay(20);
  assert.equal(settled, false);

  addClient(onConnect, "other", (client) => {
    client.registerChannel("late", {
      async call(ctx, command, arg) {
        return `${ctx}:${command}:${arg}`;
      },
      listen() {
        return Event.None;
      },
    });
  });
  await delay(20);
  assert.equal(settled, false, "不匹配的连接不应结算请求");

  addClient(onConnect, "target", (client) => {
    client.registerChannel("late", {
      async call(ctx, command, arg) {
        return `${ctx}:${command}:${arg}`;
      },
      listen() {
        return Event.None;
      },
    });
  });
  assert.equal(await pending, "target:go:1");
  server.dispose();
});

test("B13 多播 listen 覆盖现有与未来连接，最后一个监听器释放全部订阅", async () => {
  const { server, onConnect } = createHub();
  const emitters = new Map();
  let subscribes = 0;
  let unsubscribes = 0;
  const eventsChannel = {
    async call() {
      return undefined;
    },
    listen(ctx) {
      return (listener) => {
        subscribes++;
        const disposable = emitters.get(ctx).event(listener);
        return {
          dispose() {
            unsubscribes++;
            disposable.dispose();
          },
        };
      };
    },
  };
  const register = (client, ctx) => {
    emitters.set(ctx, new Emitter());
    client.registerChannel("events", eventsChannel);
  };

  addClient(onConnect, "w-1", (client) => register(client, "w-1"));
  const received = [];
  const subscription = server
    .getChannel("events", (connection) => connection.ctx.startsWith("w-"))
    .listen("onTick")((value) => received.push(value));
  await waitFor(() => subscribes === 1, "first subscription");
  emitters.get("w-1").fire(1);
  await delay(20);

  addClient(onConnect, "w-2", (client) => register(client, "w-2"));
  await waitFor(() => subscribes === 2, "second subscription");
  emitters.get("w-1").fire(2);
  emitters.get("w-2").fire(3);
  await delay(20);
  assert.deepEqual(received, [1, 2, 3]);

  subscription.dispose();
  await waitFor(() => unsubscribes === subscribes, "multicast release");
  server.dispose();
});

test("B13 StaticRouter 用于 getChannel 的 call 与 listen", async () => {
  const { server, onConnect } = createHub();
  const router = new StaticRouter((ctx) => ctx === "b");
  addClient(onConnect, "a", (client) => {
    client.registerChannel("route", {
      async call() {
        return "a";
      },
      listen() {
        return Event.None;
      },
    });
  });
  const bEvents = new Emitter();
  addClient(onConnect, "b", (client) => {
    client.registerChannel("route", {
      async call(ctx) {
        return ctx;
      },
      listen() {
        return bEvents.event;
      },
    });
  });
  await waitFor(() => server.connections.length === 2, "two connections");

  assert.equal(await server.getChannel("route", router).call("get"), "b");
  const received = [];
  const subscription = server.getChannel("route", router).listen("onValue")((value) =>
    received.push(value),
  );
  await delay(20);
  bEvents.fire("routed");
  await delay(20);
  assert.deepEqual(received, ["routed"]);
  subscription.dispose();
  server.dispose();
});

test("B14 StaticRouter 依次 await 谓词，无匹配时等待新连接", async () => {
  const onDidAddConnection = new Emitter();
  const hub = {
    connections: [{ ctx: "a" }, { ctx: "b" }],
    onDidAddConnection: onDidAddConnection.event,
    onDidRemoveConnection: Event.None,
  };
  const order = [];
  const router = new StaticRouter(async (ctx) => {
    order.push(ctx);
    return ctx === "b";
  });
  const chosen = await router.routeCall(hub);
  assert.equal(chosen.ctx, "b");
  assert.deepEqual(order, ["a", "b"]);

  const emptyHub = {
    connections: [],
    onDidAddConnection: onDidAddConnection.event,
    onDidRemoveConnection: Event.None,
  };
  order.length = 0;
  let resolved = null;
  const pending = router.routeCall(emptyHub).then((connection) => {
    resolved = connection;
    return connection;
  });
  await delay(10);
  assert.equal(resolved, null);
  emptyHub.connections.push({ ctx: "b" });
  onDidAddConnection.fire(emptyHub.connections[0]);
  assert.equal((await pending).ctx, "b");
  assert.deepEqual(order, ["b"]);

  const rejecting = new StaticRouter(() => {
    throw new Error("route boom");
  });
  await assert.rejects(rejecting.routeEvent(hub), { message: "route boom" });
});

test("B15 RemoteAuthorityResolverService 按 + 前缀分派并只移除本次注册", async () => {
  const service = new RemoteAuthorityResolverService();
  const calls = [];
  const first = {
    async resolve(authority) {
      calls.push(["first", authority]);
      return {
        authority,
        connectTo: new ManagedRemoteConnection(1),
        connectionToken: undefined,
      };
    },
  };
  const second = {
    async resolve(authority) {
      calls.push(["second", authority]);
      return {
        authority,
        connectTo: new ManagedRemoteConnection(2),
        connectionToken: undefined,
      };
    },
  };

  await assert.rejects(service.resolveAuthority("ssh+host"), {
    message: "No resolver registered for remote type: ssh",
  });
  const disposable = service.registerResolver("ssh", first);
  const resolved = await service.resolveAuthority("ssh+host:22");
  assert.equal(resolved.authority, "ssh+host:22", "解析器收到完整 authority");
  assert.deepEqual(calls, [["first", "ssh+host:22"]]);

  service.registerResolver("ssh", second);
  const replacement = await service.resolveAuthority("ssh+x");
  assert.equal(replacement.connectTo.id, 2, "同 type 覆盖");
  disposable.dispose();
  await assert.rejects(service.resolveAuthority("plain"), {
    message: "No resolver registered for remote type: plain",
  });
});

test("B15 RemoteSocketFactoryService 按 type 分桶且取首个 supports 为真的工厂", async () => {
  const service = new RemoteSocketFactoryService();
  const calls = [];
  const createFactory = (label, accepts) => ({
    supports(connection) {
      calls.push(`supports:${label}:${connection.toString()}`);
      return accepts;
    },
    async connect(connection, path, query) {
      calls.push(`connect:${label}:${path}:${query}`);
      return { label };
    },
  });
  const noSupport = createFactory("no", false);
  const first = createFactory("first", true);
  const second = createFactory("second", true);
  const d1 = service.register(RemoteConnectionType.WebSocket, noSupport);
  const d2 = service.register(RemoteConnectionType.WebSocket, first);
  service.register(RemoteConnectionType.WebSocket, second);
  const socket = await service.connect(new WebSocketRemoteConnection("host", 80), "/path", "?q");
  assert.equal(socket.label, "first");
  assert.deepEqual(calls, [
    "supports:no:WebSocket(host:80)",
    "supports:first:WebSocket(host:80)",
    "connect:first:/path:?q",
  ]);

  d2.dispose();
  const afterRemoval = await service.connect(new WebSocketRemoteConnection("host", 80), "/", "");
  assert.equal(afterRemoval.label, "second");
  d1.dispose();
  await assert.rejects(service.connect(new ManagedRemoteConnection(4), "/", ""), {
    message: "No socket factory found for Managed(4)",
  });
});

test("B15 URI 变换与连接描述", () => {
  const transformer = createURITransformer("ssh+box");
  assert.deepEqual(
    transformer.transformIncoming({ scheme: "vscode-remote", authority: "ssh+box", path: "/a" }),
    { scheme: "file", authority: "", path: "/a" },
  );
  assert.deepEqual(transformer.transformIncoming({ scheme: "file", authority: "x", path: "/b" }), {
    scheme: "vscode-local",
    authority: "",
    path: "/b",
  });
  const untouchedIncoming = { scheme: "https", authority: "example", path: "/c" };
  assert.equal(transformer.transformIncoming(untouchedIncoming), untouchedIncoming);
  assert.deepEqual(transformer.transformOutgoing({ scheme: "file", authority: "", path: "/d" }), {
    scheme: "vscode-remote",
    authority: "ssh+box",
    path: "/d",
  });
  assert.deepEqual(
    transformer.transformOutgoing({ scheme: "vscode-local", authority: "", path: "/e" }),
    { scheme: "file", authority: "", path: "/e" },
  );
  const untouchedOutgoing = { scheme: "vscode-remote", authority: "other", path: "/f" };
  assert.equal(transformer.transformOutgoing(untouchedOutgoing), untouchedOutgoing);

  assert.equal(RemoteConnectionType.WebSocket, 0);
  assert.equal(RemoteConnectionType.Managed, 1);
  assert.equal(new WebSocketRemoteConnection("host", 1234).type, 0);
  assert.equal(new WebSocketRemoteConnection("host", 1234).toString(), "WebSocket(host:1234)");
  assert.equal(new ManagedRemoteConnection(9).type, 1);
  assert.equal(new ManagedRemoteConnection(9).toString(), "Managed(9)");
});

function createSocket() {
  const data = new Emitter();
  const close = new Emitter();
  const end = new Emitter();
  const socket = {
    onData: data.event,
    onClose: close.event,
    onEnd: end.event,
    write() {},
    end() {},
    async drain() {},
    dispose() {
      socket.disposed = true;
    },
    disposed: false,
    fireClose() {
      close.fire();
    },
  };
  return socket;
}

function createRemoteHarness(connectFactory) {
  const resolverService = new RemoteAuthorityResolverService();
  const socketFactory = new RemoteSocketFactoryService();
  resolverService.registerResolver("ssh", {
    async resolve(authority) {
      return {
        authority,
        connectTo: new WebSocketRemoteConnection("host", 22),
        connectionToken: "tok",
      };
    },
  });
  const calls = [];
  socketFactory.register(RemoteConnectionType.WebSocket, {
    supports(connection) {
      calls.push(["supports", connection.toString()]);
      return true;
    },
    async connect(connection, path, query) {
      calls.push(["connect", path, query]);
      return connectFactory(calls.length);
    },
  });
  return { resolverService, socketFactory, calls };
}

test("B16 RemoteAgentConnection 连接、状态与 socketClose 重连", async () => {
  const sockets = [];
  const harness = createRemoteHarness(() => {
    const socket = createSocket();
    sockets.push(socket);
    return socket;
  });
  const connection = new RemoteAgentConnection(
    "ssh+myserver",
    harness.resolverService,
    harness.socketFactory,
  );
  const states = [];
  connection.onDidStateChange((state) => states.push(state.type));

  const client = await connection.connect();
  assert.ok(client, "connect 返回 IPCClient");
  assert.deepEqual(states, ["connected"]);
  assert.deepEqual(harness.calls[0], ["supports", "WebSocket(host:22)"]);
  assert.deepEqual(harness.calls[1], ["connect", "/", "token=tok"]);

  sockets[0].fireClose();
  assert.deepEqual(states, ["connected", "reconnecting"]);
  await waitFor(() => states.length === 3, "reconnected");
  assert.deepEqual(states, ["connected", "reconnecting", "connected"]);
  assert.equal(sockets.length, 2);

  connection.dispose();
  connection.dispose();
});

test("B16 无 token 时 query 为空串，重连失败递归到下一次尝试", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let attempts = 0;
  const sockets = [];
  const resolverService = new RemoteAuthorityResolverService();
  const socketFactory = new RemoteSocketFactoryService();
  resolverService.registerResolver("plain", {
    async resolve(authority) {
      return {
        authority,
        connectTo: new ManagedRemoteConnection(1),
        connectionToken: undefined,
      };
    },
  });
  const queries = [];
  socketFactory.register(RemoteConnectionType.Managed, {
    supports: () => true,
    async connect(_connection, _path, query) {
      queries.push(query);
      attempts++;
      if (attempts === 2) {
        throw new Error("temporary failure");
      }
      const socket = createSocket();
      sockets.push(socket);
      return socket;
    },
  });
  const connection = new RemoteAgentConnection("plain", resolverService, socketFactory);
  const states = [];
  connection.onDidStateChange((state) => states.push(state.type));

  await connection.connect();
  assert.deepEqual(queries, [""], "无 token 时 query 为空串");
  assert.deepEqual(states, ["connected"]);

  sockets[0].fireClose();
  await flushMicrotasks();
  assert.deepEqual(states, ["connected", "reconnecting"]);
  t.mock.timers.tick(0);
  await flushMicrotasks();
  assert.equal(attempts, 2, "RECONNECT_DELAYS[0] 为 0 秒，重连立即失败");
  t.mock.timers.tick(5000);
  await flushMicrotasks();
  assert.equal(attempts, 3, "失败后递归到下一次尝试");
  assert.deepEqual(states, ["connected", "reconnecting", "connected"]);
  assert.equal(queries[2], "");

  connection.dispose();
  t.mock.timers.reset();
});
