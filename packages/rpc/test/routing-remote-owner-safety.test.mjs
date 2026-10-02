import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

async function owner(name, state) {
  const key = "knorvia.synthetic.rpc.routing";
  globalThis[Symbol.for(key)] = state;
  const common = "const state=globalThis[Symbol.for('knorvia.synthetic.rpc.routing')];";
  const sources = {
    "./serialization.js":
      "export class BufferReader{constructor(value){this.value=value}}export class BufferWriter{buffer=[]}export const serialize=(writer,value)=>writer.buffer.push(value);export const deserialize=reader=>reader.value[0];",
    "./channels.js":
      common +
      "import {Relay} from './foundation.js';export class ChannelServer{constructor(protocol,ctx){this.protocol=protocol;this.ctx=ctx;state.trace.push(['server:new',protocol.id,ctx])}registerChannel(name,channel){state.trace.push(['register',this.protocol.id,name,channel])}dispose(){state.trace.push(['server:dispose',this.protocol.id])}}export class ChannelClient{constructor(protocol){this.protocol=protocol;state.trace.push(['client:new',protocol.id])}getChannel(name){state.trace.push(['get',this.protocol.id,name]);return this.protocol.channel}dispose(){state.trace.push(['client:dispose',this.protocol.id])}}export function getDelayedChannel(promise){return {call(...args){return promise.then(channel=>channel.call(...args))},listen(name,arg){const relay=new Relay();promise.then(channel=>relay.input=channel.listen(name,arg));return relay.event}}}",
    "./persistent-protocol.js":
      common +
      "import {Emitter} from './foundation.js';export class PersistentProtocol{closed=new Emitter();onSocketClose=this.closed.event;constructor(socket){this.socket=socket;state.protocol=this;state.trace.push(['protocol:new',socket])}replaceSocket(socket){this.socket=socket;state.trace.push(['protocol:replace',socket])}dispose(){state.trace.push(['protocol:dispose']);this.closed.dispose()}}",
    "./ipc.js":
      common +
      "export class IPCClient{constructor(protocol,ctx){this.protocol=protocol;this.ctx=ctx;state.client=this;state.trace.push(['ipc:new',protocol,ctx])}dispose(){state.trace.push(['ipc:dispose'])}}",
  };
  const root =
    process.env.KNORVIA_RPC_ROUTING_ROOT ?? fileURLToPath(new URL("../src", import.meta.url));
  const foundation = fileURLToPath(new URL("../src/foundation.ts", import.meta.url));
  const output = await build({
    entryPoints: [root + "/" + name + ".ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    banner: {
      js: "const syntheticTimerPort=globalThis[Symbol.for('knorvia.synthetic.rpc.routing')];const setTimeout=(callback,delay)=>{syntheticTimerPort.timers.push({callback,delay});return syntheticTimerPort.timers.length};",
    },
    plugins: [
      {
        name: "fake-routing-composition-ports",
        setup(plugin) {
          plugin.onResolve({ filter: /^\.\// }, ({ path }) => {
            if (path === "./foundation.js") return { path: foundation };
            assert.ok(Object.hasOwn(sources, path), "unexpected dependency " + path);
            return { path, namespace: "synthetic" };
          });
          plugin.onLoad({ filter: /.*/, namespace: "synthetic" }, ({ path }) => ({
            contents: sources[path],
            loader: "js",
          }));
        },
      },
    ],
  });
  try {
    return await import(
      "data:text/javascript;base64," + Buffer.from(output.outputFiles[0].text).toString("base64")
    );
  } finally {
    delete globalThis[Symbol.for(key)];
  }
}
function event() {
  const listeners = new Set();
  return {
    listeners,
    subscribe(fn) {
      listeners.add(fn);
      return {
        dispose() {
          listeners.delete(fn);
        },
      };
    },
    fire(value) {
      const snapshot = [...listeners];
      for (const fn of snapshot) fn(value);
    },
  };
}
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

test("IPC filter/router admits selected clients with original token, handshakes first and retires owned listeners", async () => {
  const state = { trace: [], timers: [] };
  const { IPCServer, IPCClient } = await owner("ipc", state);
  const connects = event(),
    arg = {},
    token = {},
    localContext = {};
  const hub = new IPCServer(connects.subscribe);
  const exposed = {};
  hub.registerChannel("synthetic", exposed);
  const ports = [];
  function attach(id, ctx) {
    const messages = event(),
      disconnects = event(),
      stream = event();
    const port = {
      id,
      channel: {
        call(command, data, cancellation) {
          assert.equal(this, port.channel);
          assert.equal(command, "owned");
          assert.equal(data, arg);
          assert.equal(cancellation, token);
          state.trace.push(["call", id]);
          return Promise.resolve(id);
        },
        listen(name, data) {
          assert.equal(this, port.channel);
          assert.equal(name, "onOwned");
          assert.equal(data, arg);
          state.trace.push(["listen", id]);
          return stream.subscribe;
        },
      },
      onMessage: messages.subscribe,
      send(value) {
        assert.equal(this, port);
        state.trace.push(["send", id, value]);
      },
    };
    connects.fire({ protocol: port, onDidClientDisconnect: disconnects.subscribe });
    messages.fire([ctx]);
    ports.push({ port, messages, disconnects, stream });
    return ports.at(-1);
  }
  const denied = attach("denied", { admitted: false }),
    admitted = attach("admitted", { admitted: true });
  const routed = hub.getChannel("synthetic", (client) => client.ctx.admitted);
  assert.equal(await routed.call("owned", arg, token), "admitted");
  assert.equal(state.trace.filter((row) => row[0] === "call" && row[1] === "denied").length, 0);
  const values = [],
    subscription = routed.listen("onOwned", arg)((value) => values.push(value));
  denied.stream.fire("deny");
  admitted.stream.fire("allow");
  assert.deepEqual(values, ["allow"]);
  const laterDenied = attach("later-denied", { admitted: false }),
    laterAdmitted = attach("later-admitted", { admitted: true });
  laterDenied.stream.fire("deny");
  laterAdmitted.stream.fire("future");
  assert.deepEqual(values, ["allow", "future"]);
  subscription.dispose();
  assert.equal(admitted.stream.listeners.size, 0);
  assert.equal(laterAdmitted.stream.listeners.size, 0);
  const router = {
    routeCall(connectionHub, command, data, cancellation) {
      assert.equal(this, router);
      assert.equal(connectionHub, hub);
      assert.equal(data, arg);
      assert.equal(cancellation, token);
      return Promise.resolve(hub.connections[0]);
    },
    routeEvent() {
      assert.equal(this, router);
      return Promise.resolve(hub.connections[1]);
    },
  };
  assert.equal(await hub.getChannel("synthetic", router).call("owned", arg, token), "denied");
  admitted.disconnects.fire();
  assert.deepEqual(state.trace.slice(-2), [
    ["server:dispose", "admitted"],
    ["client:dispose", "admitted"],
  ]);
  assert.equal(
    hub.connections.some(
      (connection) =>
        connection.ctx.admitted && connection.channelClient.protocol.id === "admitted",
    ),
    false,
  );
  state.trace.length = 0;
  const client = new IPCClient(denied.port, localContext);
  assert.deepEqual(state.trace, [
    ["send", "denied", [localContext]],
    ["client:new", "denied"],
    ["server:new", "denied", localContext],
  ]);
  client.dispose();
  assert.deepEqual(state.trace.slice(-2), [
    ["client:dispose", "denied"],
    ["server:dispose", "denied"],
  ]);
  hub.dispose();
  assert.equal(connects.listeners.size, 0);
  for (const entry of ports) {
    assert.equal(entry.messages.listeners.size, 0);
    assert.equal(entry.disconnects.listeners.size, 0);
  }
});

test("remote resolver/factory and URI admit only matching routes; composition and reconnect retain owned protocol", async () => {
  const state = { trace: [], timers: [] };
  const {
    RemoteConnectionType,
    ManagedRemoteConnection,
    RemoteAuthorityResolverService,
    RemoteSocketFactoryService,
    RemoteAgentConnection,
    createURITransformer,
  } = await owner("remote", state);
  const resolvers = new RemoteAuthorityResolverService(),
    factories = new RemoteSocketFactoryService();
  const connection = new ManagedRemoteConnection(7),
    firstSocket = {},
    secondSocket = {};
  connection.valueOf = () => 99;
  let connectCalls = 0,
    resolveCalls = 0;
  const rejectedFactory = {
    supports(value) {
      assert.equal(this, rejectedFactory);
      assert.equal(value, connection);
      return false;
    },
    connect() {
      throw new Error("must not admit unsupported factory");
    },
  };
  factories.register(RemoteConnectionType.Managed, rejectedFactory);
  await assert.rejects(
    factories.connect(connection, "/", ""),
    /No socket factory found for Managed\(7\)/,
  );
  await assert.rejects(
    new RemoteAgentConnection("unknown+synthetic", resolvers, factories).connect(),
    /No resolver registered for remote type: unknown/,
  );
  assert.equal(connectCalls, 0);
  const resolved = {
    authority: "different-resolved-context",
    connectTo: connection,
    connectionToken: "synthetic-token",
  };
  const resolver = {
    resolve(authority) {
      assert.equal(this, resolver);
      assert.equal(authority, "synthetic+owner");
      resolveCalls++;
      return Promise.resolve(resolved);
    },
  };
  resolvers.registerResolver("synthetic", resolver);
  const factory = {
    supports(value) {
      assert.equal(this, factory);
      return value === connection;
    },
    connect(value, path, query) {
      assert.equal(this, factory);
      assert.equal(value, connection);
      assert.equal(path, "/");
      assert.equal(query, "token=synthetic-token");
      return Promise.resolve(++connectCalls === 1 ? firstSocket : secondSocket);
    },
  };
  const registration = factories.register(RemoteConnectionType.Managed, factory);
  const uri = { scheme: "vscode-remote", authority: "wrong", path: "/synthetic" },
    transformer = createURITransformer("synthetic+owner");
  assert.equal(transformer.transformIncoming(uri), uri);
  assert.deepEqual(transformer.transformIncoming({ ...uri, authority: "synthetic+owner" }), {
    scheme: "file",
    authority: "",
    path: "/synthetic",
  });
  const agent = new RemoteAgentConnection("synthetic+owner", resolvers, factories),
    states = [];
  agent.onDidStateChange((value) => states.push(value.type));
  const client = await agent.connect();
  assert.equal(client, state.client);
  assert.equal(client.ctx, "synthetic+owner");
  assert.equal(client.protocol, state.protocol);
  assert.equal(state.protocol.socket, firstSocket);
  const owned = state.protocol;
  owned.closed.fire();
  assert.deepEqual(states, ["connected", "reconnecting"]);
  assert.equal(state.timers[0].delay, 0);
  state.timers[0].callback();
  await settle();
  assert.equal(state.protocol, owned);
  assert.equal(owned.socket, secondSocket);
  assert.equal(state.client, client);
  assert.equal(resolveCalls, 1);
  assert.equal(connectCalls, 2);
  assert.deepEqual(states, ["connected", "reconnecting", "connected"]);
  agent.dispose();
  assert.deepEqual(state.trace.slice(-2), [["ipc:dispose"], ["protocol:dispose"]]);
  registration.dispose();
  await assert.rejects(factories.connect(connection, "/", ""), /No socket factory found/);
});
