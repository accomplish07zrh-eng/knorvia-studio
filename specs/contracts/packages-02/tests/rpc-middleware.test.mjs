// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { rpc } from "./entry.mjs";

const {
  Event,
  LoggingChannelServer,
  LoggingChannelClient,
  NetworkTelemetryChannelServer,
  NetworkTelemetryChannelClient,
  setNetworkTelemetrySink,
  emitNetworkTelemetryObservation,
} = rpc;

test("B17 服务端日志：注册、调用成功/失败与订阅", async () => {
  let innerServer;
  let registered;
  let readyCalls = 0;
  const failure = new Error("calc failure");
  const inner = {
    registerChannel(name, channel) {
      innerServer = { name, channel };
      registered = channel;
    },
    ready() {
      readyCalls++;
    },
  };
  const messages = [];
  const logger = (message, ...args) => messages.push([message, ...args]);
  const server = new LoggingChannelServer(inner, logger);

  server.registerChannel("calc", {
    async call(_ctx, command) {
      if (command === "add") return 3;
      throw failure;
    },
    listen() {
      return Event.None;
    },
  });
  assert.equal(innerServer.name, "calc");
  assert.equal(messages[0][0], '[rpc:register] channel "calc"');

  messages.length = 0;
  assert.equal(await registered.call("ctx", "add"), 3);
  assert.match(messages[0][0], /^\[rpc:call\] calc\.add OK \(\d+\.\dms\)$/);
  assert.equal(messages[0].length, 1);

  messages.length = 0;
  await assert.rejects(registered.call("ctx", "explode"), (error) => error === failure);
  assert.match(messages[0][0], /^\[rpc:call\] calc\.explode FAIL \(\d+\.\dms\)$/);
  assert.equal(messages[0][1], failure);

  messages.length = 0;
  assert.equal(registered.listen("ctx", "onValue"), Event.None);
  assert.deepEqual(messages, [["[rpc:listen] calc.onValue subscribed"]]);

  messages.length = 0;
  const listenError = new Error("listen boom");
  const broken = {
    call: async () => undefined,
    listen() {
      throw listenError;
    },
  };
  server.registerChannel("broken", broken);
  messages.length = 0;
  assert.throws(
    () => registered.listen("ctx", "onValue"),
    (error) => error === listenError,
  );
  assert.deepEqual(messages, [["[rpc:listen] broken.onValue FAIL", listenError]]);

  server.ready();
  assert.equal(readyCalls, 1);
});

test("B17 客户端日志格式与 logger 抛错阻止内部注册/订阅", async () => {
  const calls = [];
  const failure = new Error("remote failure");
  const innerChannel = {
    async call(command, arg) {
      calls.push(["call", command, arg]);
      if (command === "fail") throw failure;
      return "value";
    },
    listen(event) {
      calls.push(["listen", event]);
      return Event.None;
    },
  };
  const messages = [];
  const client = new LoggingChannelClient({ getChannel: () => innerChannel }, (message, ...args) =>
    messages.push([message, ...args]),
  );
  const channel = client.getChannel("chat");
  assert.equal(await channel.call("send", { text: "hi" }), "value");
  assert.match(messages[0][0], /^\[rpc:call\] chat\.send → OK \(\d+\.\dms\)$/);
  assert.deepEqual(calls[0], ["call", "send", { text: "hi" }]);

  messages.length = 0;
  await assert.rejects(channel.call("fail"), (error) => error === failure);
  assert.match(messages[0][0], /^\[rpc:call\] chat\.fail → FAIL \(\d+\.\dms\)$/);
  assert.equal(messages[0][1], failure);

  messages.length = 0;
  assert.equal(channel.listen("onMessage"), Event.None);
  assert.deepEqual(messages, [["[rpc:listen] chat.onMessage → subscribed"]]);

  let innerRegistered = false;
  let innerListened = false;
  const throwingLogger = () => {
    throw new Error("logger failed");
  };
  const server = new LoggingChannelServer(
    {
      registerChannel() {
        innerRegistered = true;
      },
    },
    throwingLogger,
  );
  assert.throws(
    () =>
      server.registerChannel("x", {
        call: async () => undefined,
        listen: () => Event.None,
      }),
    { message: "logger failed" },
  );
  assert.equal(innerRegistered, false);

  const throwingClient = new LoggingChannelClient(
    {
      getChannel: () => ({
        call: async () => undefined,
        listen() {
          innerListened = true;
          return Event.None;
        },
      }),
    },
    throwingLogger,
  );
  assert.throws(() => throwingClient.getChannel("x").listen("onX"), {
    message: "logger failed",
  });
  assert.equal(innerListened, false);
});

test("B18 成功与失败调用各发出一条观测，listen 不产生观测", async () => {
  const observations = [];
  setNetworkTelemetrySink((observation) => observations.push(observation));
  try {
    let registered;
    const inner = {
      async call(_ctx, command) {
        if (command === "ok") return "value";
        throw new Error("Request TIMEOUT");
      },
      listen() {
        return Event.None;
      },
    };
    const server = new NetworkTelemetryChannelServer({
      registerChannel(_name, channel) {
        registered = channel;
      },
    });
    server.registerChannel("net", inner);

    assert.equal(await registered.call("ctx", "ok", { q: 1 }), "value");
    assert.equal(observations.length, 1);
    const success = observations[0];
    assert.equal(success.transport, "rpc");
    assert.equal(success.interface, "net.ok");
    assert.ok(Number.isInteger(success.durationMs) && success.durationMs >= 0);
    assert.equal(success.ok, true);
    assert.equal(success.errorKind, undefined);
    assert.equal(success.attempt, 1);

    await assert.rejects(registered.call("ctx", "slow"), { message: "Request TIMEOUT" });
    assert.equal(observations.length, 2);
    assert.equal(observations[1].transport, "rpc");
    assert.equal(observations[1].interface, "net.slow");
    assert.ok(Number.isInteger(observations[1].durationMs) && observations[1].durationMs >= 0);
    assert.equal(observations[1].ok, false);
    assert.equal(observations[1].errorKind, "timeout");
    assert.equal(observations[1].attempt, 1);

    registered.listen("ctx", "onTick");
    assert.equal(observations.length, 2, "listen 不产生观测");
  } finally {
    setNetworkTelemetrySink(null);
  }
});

test("B18 errorKind 分类顺序与大小写不敏感", async () => {
  const observations = [];
  setNetworkTelemetrySink((observation) => observations.push(observation));
  try {
    let registered;
    const server = new NetworkTelemetryChannelServer({
      registerChannel(_name, channel) {
        registered = channel;
      },
    });
    server.registerChannel("net", {
      async call(_ctx, command) {
        throw new Error(command);
      },
      listen() {
        return Event.None;
      },
    });

    const cases = [
      ["connection TIMED OUT and enotfound", "timeout"],
      ["getaddrinfo ENOTFOUND dns.example", "dns_failure"],
      ["read ECONNRESET", "connection_reset"],
      ["connection reset by peer", "connection_reset"],
      ["connect ECONNREFUSED", "connection_reset"],
      ["something else", "other"],
    ];
    for (const [message] of cases) {
      await assert.rejects(registered.call("ctx", message));
    }
    assert.deepEqual(
      observations.map((observation) => observation.errorKind),
      cases.map(([, kind]) => kind),
    );
    assert.ok(
      observations.every((observation) => observation.ok === false && observation.attempt === 1),
    );
  } finally {
    setNetworkTelemetrySink(null);
  }
});

test("B18 sink 在发出时读取，客户端中间件同样发观测", async () => {
  const early = [];
  const late = [];
  setNetworkTelemetrySink((observation) => early.push(observation));
  try {
    const client = new NetworkTelemetryChannelClient({
      getChannel: () => ({
        async call(command) {
          if (command === "fail") throw new Error("other failure");
          return command;
        },
        listen: () => Event.None,
      }),
    });
    const channel = client.getChannel("client");
    setNetworkTelemetrySink((observation) => late.push(observation));

    assert.equal(await channel.call("ok"), "ok");
    assert.equal(early.length, 0, "构造时绑定的 sink 不生效");
    assert.equal(late.length, 1);
    assert.equal(late[0].interface, "client.ok");

    await assert.rejects(channel.call("fail"));
    assert.equal(late.length, 2);
    assert.equal(late[1].ok, false);
    assert.equal(late[1].errorKind, "other");

    setNetworkTelemetrySink(null);
    assert.equal(await channel.call("quiet"), "quiet");
    assert.equal(late.length, 2, "null sink 关闭观测");

    const direct = [];
    setNetworkTelemetrySink((observation) => direct.push(observation));
    emitNetworkTelemetryObservation({
      transport: "rpc",
      interface: "manual.probe",
      durationMs: 0,
      ok: true,
    });
    assert.equal(direct.length, 1);
  } finally {
    setNetworkTelemetrySink(null);
  }
});

test("B18 sink 抛错会向外传播，inner 错误原样抛出", async () => {
  let registered;
  const failure = new Error("inner failure");
  const server = new NetworkTelemetryChannelServer({
    registerChannel(_name, channel) {
      registered = channel;
    },
  });
  server.registerChannel("net", {
    async call(_ctx, command) {
      if (command === "inner") throw failure;
      return "ok";
    },
    listen() {
      return Event.None;
    },
  });

  setNetworkTelemetrySink(() => {
    throw new Error("sink boom");
  });
  try {
    await assert.rejects(registered.call("ctx", "success"), { message: "sink boom" });
  } finally {
    setNetworkTelemetrySink(null);
  }

  let observedError;
  setNetworkTelemetrySink((observation) => {
    observedError = observation.errorKind;
  });
  try {
    await assert.rejects(registered.call("ctx", "inner"), (error) => error === failure);
  } finally {
    setNetworkTelemetrySink(null);
  }
  assert.equal(observedError, "other");
});
