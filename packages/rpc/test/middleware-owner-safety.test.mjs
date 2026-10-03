import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

async function owner(name, state) {
  const key = "knorvia.synthetic.middleware." + name;
  globalThis[Symbol.for(key)] = state;
  const root =
    process.env.KNORVIA_RPC_ROUTING_ROOT ?? fileURLToPath(new URL("../src", import.meta.url));
  const output = await build({
    entryPoints: [root + "/" + name + ".ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    banner: {
      js:
        "const synthetic=globalThis[Symbol.for('" +
        key +
        "')];const performance={now:()=>synthetic.now++};",
    },
    plugins: [
      {
        name: "type-only-middleware-ports",
        setup(plugin) {
          plugin.onResolve({ filter: /^\.\// }, ({ path }) => {
            assert.ok(
              path === "./channels.js" || path === "./foundation.js",
              "unexpected dependency " + path,
            );
            return { path, namespace: "synthetic" };
          });
          plugin.onLoad({ filter: /.*/, namespace: "synthetic" }, () => ({
            contents: "export const Event={};",
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
const emptyEvent = () => ({ dispose() {} });

test("logging preserves forwarded receiver/token/error and denial at registration/client-listen logger boundary", async () => {
  const state = { now: 0 };
  const { LoggingChannelServer, LoggingChannelClient } = await owner("logging-middleware", state);
  const context = {},
    arg = {},
    token = {},
    reason = new Error("synthetic cancellation");
  const logs = [];
  let wrapped,
    ready = 0,
    calls = 0,
    listens = 0;
  const innerChannel = {
    call(ctx, command, data, cancellation) {
      assert.equal(this, innerChannel);
      assert.equal(ctx, context);
      assert.equal(command, "owned");
      assert.equal(data, arg);
      assert.equal(cancellation, token);
      calls++;
      return Promise.reject(reason);
    },
    listen(ctx, event, data) {
      assert.equal(this, innerChannel);
      assert.equal(ctx, context);
      assert.equal(event, "onOwned");
      assert.equal(data, arg);
      listens++;
      return emptyEvent;
    },
  };
  const server = {
    registerChannel(name, channel) {
      assert.equal(this, server);
      assert.equal(name, "synthetic");
      wrapped = channel;
    },
    ready() {
      assert.equal(this, server);
      ready++;
    },
  };
  const logged = new LoggingChannelServer(server, function (...args) {
    assert.notEqual(this, undefined);
    logs.push(args);
  });
  logged.registerChannel("synthetic", innerChannel);
  logged.ready();
  assert.equal(await wrapped.call(context, "owned", arg, token).catch((error) => error), reason);
  assert.equal(wrapped.listen(context, "onOwned", arg), emptyEvent);
  assert.equal(calls, 1);
  assert.equal(listens, 1);
  assert.equal(ready, 1);
  assert.deepEqual(logs, [
    ['[rpc:register] channel "synthetic"'],
    ["[rpc:call] synthetic.owned FAIL (1.0ms)", reason],
    ["[rpc:listen] synthetic.onOwned subscribed"],
  ]);
  const denied = new Error("synthetic interception denied");
  const rejected = new LoggingChannelServer(server, () => {
    throw denied;
  });
  const before = wrapped;
  assert.throws(
    () => rejected.registerChannel("synthetic", innerChannel),
    (error) => error === denied,
  );
  assert.equal(wrapped, before);
  let remoteListens = 0;
  const clientInner = {
    getChannel(name) {
      assert.equal(this, clientInner);
      assert.equal(name, "synthetic");
      return {
        listen() {
          remoteListens++;
          return emptyEvent;
        },
      };
    },
  };
  const client = new LoggingChannelClient(clientInner, () => {
    throw denied;
  }).getChannel("synthetic");
  assert.throws(
    () => client.listen("onOwned"),
    (error) => error === denied,
  );
  assert.equal(remoteListens, 0);
});

test("telemetry keeps receiver/token/error identity, observes live sink and forwards event without sink", async () => {
  const state = { now: 0 };
  const {
    NetworkTelemetryChannelClient,
    NetworkTelemetryChannelServer,
    setNetworkTelemetrySink,
    emitNetworkTelemetryObservation,
  } = await owner("network-telemetry-middleware", state);
  const arg = {},
    token = {},
    first = [],
    second = [],
    reason = new Error("synthetic ENOTFOUND");
  let resolve,
    callCount = 0;
  const channel = {
    call(command, data, cancellation) {
      assert.equal(this, channel);
      assert.equal(command, "owned");
      assert.equal(data, arg);
      assert.equal(cancellation, token);
      callCount++;
      return callCount === 1
        ? new Promise((done) => {
            resolve = done;
          })
        : Promise.reject(reason);
    },
    listen() {
      assert.equal(this, channel);
      return emptyEvent;
    },
  };
  const clientPort = {
    getChannel() {
      assert.equal(this, clientPort);
      return channel;
    },
  };
  const client = new NetworkTelemetryChannelClient(clientPort).getChannel("synthetic");
  setNetworkTelemetrySink((value) => first.push(value));
  const pending = client.call("owned", arg, token);
  setNetworkTelemetrySink((value) => second.push(value));
  resolve(arg);
  assert.equal(await pending, arg);
  assert.deepEqual(first, []);
  assert.deepEqual(second, [
    {
      transport: "rpc",
      interface: "synthetic.owned",
      durationMs: 1,
      ok: true,
      errorKind: undefined,
      attempt: 1,
    },
  ]);
  assert.equal(await client.call("owned", arg, token).catch((error) => error), reason);
  assert.equal(second[1].errorKind, "dns_failure");
  assert.equal(second[1].ok, false);
  const denied = new Error("synthetic sink failure");
  setNetworkTelemetrySink(() => {
    throw denied;
  });
  assert.equal(client.listen("onOwned"), emptyEvent);
  assert.equal(await client.call("owned", arg, token).catch((error) => error), denied);
  let wrapped,
    ready = 0;
  const context = {};
  const serverChannel = {
    call(ctx, command, data, cancellation) {
      assert.equal(this, serverChannel);
      assert.equal(ctx, context);
      assert.equal(data, arg);
      assert.equal(cancellation, token);
      return Promise.resolve(arg);
    },
    listen() {
      return emptyEvent;
    },
  };
  const serverPort = {
    registerChannel(name, value) {
      assert.equal(this, serverPort);
      wrapped = value;
    },
    ready() {
      assert.equal(this, serverPort);
      ready++;
    },
  };
  const server = new NetworkTelemetryChannelServer(serverPort);
  server.registerChannel("synthetic", serverChannel);
  server.ready();
  setNetworkTelemetrySink(null);
  assert.equal(await wrapped.call(context, "owned", arg, token), arg);
  assert.equal(ready, 1);
  const observation = { transport: "rpc", interface: "synthetic.raw", durationMs: 0, ok: true };
  setNetworkTelemetrySink((value) => assert.equal(value, observation));
  emitNetworkTelemetryObservation(observation);
  setNetworkTelemetrySink(null);
});
