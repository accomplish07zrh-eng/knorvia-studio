// SPDX-License-Identifier: Apache-2.0
// S49–S55：Windows Computer Use Helper 主机的控制协议纯判定、子进程终止阶梯、
// 两阶段 transport/health 握手与 stop/restart 边界，以及 Windows 运行时解析。
// Linux 上只跑「平台判定 + 注入式假子进程/假文件系统」，不真起 Helper、不碰真实文件系统。
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join, resolve as resolveHostPath } from "node:path";
import { describe, it } from "node:test";

import { cuaBroker, importDeep } from "./entry.mjs";
import { withEnv } from "./helpers.mjs";

const deepSupport = await importDeep("cua-permission-broker/windowsCuaHelperHostSupport.ts");
const deepHost = await importDeep("cua-permission-broker/windowsCuaDevHelperHost.ts");
const deepRuntime = await importDeep("cua-permission-broker/windowsCuaDevRuntime.ts");

const {
  ADDON_ENV,
  WindowsCuaChildLifecycle,
  asError,
  defaultChildProcess,
  defaultHealthProbe,
  defaultSocketPathFactory,
  isExactHealthPid,
  parseReadyMessage,
} = deepSupport;
const { WindowsCuaHelperHost } = deepHost;
const { WindowsCuaDevRuntimeResolutionError, resolveWindowsCuaRuntime } = deepRuntime;

/** 控制协议常量单源于 producer，测试也只用它，避免把字面量抄成第二处真值。 */
const CONTROL = cuaBroker.WINDOWS_DEV_CONTROL_PROTOCOL;

function makeLogRecorder() {
  const entries = [];
  const record =
    (level) =>
    (...args) => {
      entries.push({ level, args });
    };
  return {
    entries,
    logger: {
      debug: record("debug"),
      info: record("info"),
      warn: record("warn"),
      error: record("error"),
    },
  };
}

async function drain(rounds = 24) {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve();
  }
}

class FakeChild {
  constructor(pid) {
    this.pid = pid;
    this.messages = [];
    this.kills = 0;
    this.listeners = { message: [], error: [], exit: [] };
    this.offEvents = [];
    this.sendFailure = undefined;
    this.killFailure = undefined;
    this.onFailure = undefined;
  }

  send(message) {
    if (this.sendFailure !== undefined) throw this.sendFailure;
    this.messages.push(message);
    return true;
  }

  kill() {
    if (this.killFailure !== undefined) throw this.killFailure;
    this.kills += 1;
    return true;
  }

  on(event, listener) {
    if (this.onFailure === event) throw new Error(`synthetic on(${event}) failure`);
    this.listeners[event].push(listener);
    return this;
  }

  off(event, listener) {
    this.offEvents.push(event);
    const index = this.listeners[event].indexOf(listener);
    if (index >= 0) this.listeners[event].splice(index, 1);
    return this;
  }

  dispatch(event, ...args) {
    // 先快照再迭代：listener 自己可能调用 off() 改这个数组，
    // 直接迭代会把「迭代中修改」暴露成跳过或重复投递。
    // 用 slice() 而不是 [...arr]（后者会触发 oxlint 的 no-useless-spread）。
    for (const listener of this.listeners[event].slice()) listener(...args);
  }
}

function makeGeneration(child, overrides = {}) {
  const calls = [];
  return {
    id: 7,
    child,
    socketPath: "/synthetic/pipe-generation",
    stopped: false,
    exitObserved: false,
    calls,
    removeMainListeners: () => calls.push("remove-main"),
    ...overrides,
  };
}

const readyFor = (socketPath, pid, type = "ready") => ({
  protocol: CONTROL,
  type,
  socketPath,
  pid,
});

describe("S49 Windows Helper 主机支持层纯判定", () => {
  it("S49 parseReadyMessage 把非本协议与未来新增类型判为 ignore，非对象判为 null", () => {
    for (const value of [null, undefined, "ready", 7]) {
      assert.equal(parseReadyMessage(value), null, String(value));
    }
    assert.equal(parseReadyMessage([]), "ignore");
    assert.equal(parseReadyMessage({ protocol: "some-other/v9", type: "ready" }), "ignore");
    assert.equal(parseReadyMessage({ protocol: CONTROL, type: "heartbeat", seq: 1 }), "ignore");
    assert.equal(parseReadyMessage({ protocol: CONTROL }), "ignore");
  });

  it("S49 ready/transport_ready 必须带非空 socketPath 与正整数 pid，输出只保留四个字段", () => {
    assert.deepEqual(parseReadyMessage(readyFor("/synthetic/pipe", 42)), {
      protocol: CONTROL,
      type: "ready",
      socketPath: "/synthetic/pipe",
      pid: 42,
    });
    assert.deepEqual(parseReadyMessage(readyFor("/synthetic/pipe", 42, "transport_ready")), {
      protocol: CONTROL,
      type: "transport_ready",
      socketPath: "/synthetic/pipe",
      pid: 42,
    });
    assert.deepEqual(Object.keys(parseReadyMessage({ ...readyFor("/p", 3), extra: "x" })), [
      "protocol",
      "type",
      "socketPath",
      "pid",
    ]);
    for (const bad of [
      { ...readyFor("", 3), type: "ready" },
      { ...readyFor("/p", 0) },
      { ...readyFor("/p", -1) },
      { ...readyFor("/p", 2.5) },
      { ...readyFor("/p", "3") },
      { protocol: CONTROL, type: "ready", pid: 3 },
    ]) {
      assert.equal(parseReadyMessage(bad), null, JSON.stringify(bad));
    }
  });

  it("S49 helper 自报的 error 消息带诊断文本被解析出来，空或非字符串 message 判为 null", () => {
    assert.deepEqual(
      parseReadyMessage({ protocol: CONTROL, type: "error", message: "addon boom" }),
      {
        protocol: CONTROL,
        type: "error",
        message: "addon boom",
      },
    );
    assert.equal(parseReadyMessage({ protocol: CONTROL, type: "error", message: "" }), null);
    assert.equal(parseReadyMessage({ protocol: CONTROL, type: "error", message: 42 }), null);
    assert.equal(parseReadyMessage({ protocol: CONTROL, type: "error" }), null);
  });

  it("S49 isExactHealthPid 只接受与子进程 PID 相同的正整数，asError 保留 Error 引用", () => {
    assert.equal(isExactHealthPid({ bundleId: null, pid: 42 }, 42), true);
    assert.equal(isExactHealthPid({ bundleId: null, pid: 42 }, 43), false);
    assert.equal(isExactHealthPid({ bundleId: null, pid: 42 }, undefined), false);
    assert.equal(isExactHealthPid({ bundleId: null, pid: 0 }, 0), false);
    assert.equal(isExactHealthPid({ bundleId: null, pid: null }, null), false);
    assert.equal(isExactHealthPid({ bundleId: null, pid: 3.5 }, 3.5), false);

    const original = new Error("already an error");
    assert.equal(asError(original), original);
    assert.equal(asError("boom").message, "boom");
    assert.ok(asError(undefined) instanceof Error);
  });

  it("S49 常量与默认依赖单源于 producer：ADDON_ENV、socket 铸造与健康探测都是委托", async () => {
    assert.equal(ADDON_ENV, cuaBroker.HELPER_ADDON_ENV);
    assert.equal(defaultSocketPathFactory, cuaBroker.mintBrokerSocketPath);
    assert.deepEqual(await defaultHealthProbe("/synthetic/pipe", 7), { bundleId: null, pid: null });
    assert.equal(deepSupport.defaultHealthProbe.length, 2);
  });

  it("S49 defaultChildProcess 空 argv 直接 fail closed，不落到真实 fork", () => {
    assert.throws(
      () => defaultChildProcess.fork("/synthetic/runtime-node", [], { cwd: "/synthetic" }),
      (error) => error.message === "Windows Computer Use Helper entry path is required",
    );
  });
});

describe("S50 WindowsCuaChildLifecycle 终止阶梯", () => {
  it("S50 已观测退出的代际只摘主监听，不再发 shutdown 也不 kill", async () => {
    const { logger } = makeLogRecorder();
    const lifecycle = new WindowsCuaChildLifecycle(logger);
    const child = new FakeChild(900);
    const generation = makeGeneration(child, { exitObserved: true });
    await lifecycle.terminate(generation, "stop", 1_000);
    assert.deepEqual(child.messages, []);
    assert.equal(child.kills, 0);
    assert.deepEqual(generation.calls, ["remove-main"]);
    assert.deepEqual(child.offEvents, []);
  });

  it("S50 shutdown 后被观察到退出即收口，不发 kill", async () => {
    const { logger } = makeLogRecorder();
    const lifecycle = new WindowsCuaChildLifecycle(logger);
    const child = new FakeChild(901);
    const generation = makeGeneration(child);
    const terminating = lifecycle.terminate(generation, "restart", 1_000);
    await drain(2);
    assert.deepEqual(child.messages, [{ protocol: CONTROL, type: "shutdown" }]);
    child.dispatch("exit", 0);
    await terminating;
    assert.equal(generation.exitObserved, true);
    assert.equal(child.kills, 0);
    assert.deepEqual(generation.calls, ["remove-main"]);
    assert.deepEqual(child.offEvents, ["exit"]);
  });

  it("S50 shutdown 超时后才 kill，kill 后观察到退出仍算成功终止", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"], now: 10_000 });
    const { logger } = makeLogRecorder();
    const lifecycle = new WindowsCuaChildLifecycle(logger);
    const child = new FakeChild(902);
    const generation = makeGeneration(child);
    const terminating = lifecycle.terminate(generation, "stop", 500);
    await drain(2);
    assert.equal(child.kills, 0);
    t.mock.timers.tick(500);
    await drain(6);
    assert.equal(child.kills, 1);
    child.dispatch("exit", null);
    await terminating;
    assert.deepEqual(generation.calls, ["remove-main"]);
    assert.deepEqual(child.offEvents, ["exit", "exit"]);
  });

  it("S50 kill 之后仍未退出：抛终止阻塞并记 termination-blocker 告警", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"], now: 20_000 });
    const { entries, logger } = makeLogRecorder();
    const lifecycle = new WindowsCuaChildLifecycle(logger);
    const child = new FakeChild(903);
    const generation = makeGeneration(child);
    const terminating = lifecycle.terminate(generation, "restart", 500);
    await drain(2);
    t.mock.timers.tick(500);
    await drain(6);
    t.mock.timers.tick(500);
    await drain(6);
    await assert.rejects(
      terminating,
      (error) =>
        error.message ===
        "Windows Computer Use Helper termination blocker: child did not exit after kill",
    );
    assert.equal(child.kills, 1);
    assert.deepEqual(generation.calls, []);
    const blockerLog = entries.at(-1);
    assert.equal(blockerLog.level, "warn");
    assert.equal(blockerLog.args[1], "Windows Computer Use Helper lifecycle failure");
    assert.deepEqual(blockerLog.args[2], {
      generation: 7,
      pid: 903,
      errorClass: "restart-termination-blocker",
      error: "Error",
    });
  });

  it("S50 send/kill 抛错只记 failure 日志，仍继续走完终止阶梯", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"], now: 30_000 });
    const { entries, logger } = makeLogRecorder();
    const lifecycle = new WindowsCuaChildLifecycle(logger);
    const child = new FakeChild(904);
    child.sendFailure = new Error("synthetic send boom");
    child.killFailure = new Error("synthetic kill boom");
    const generation = makeGeneration(child);
    const terminating = lifecycle.terminate(generation, "stop", 500);
    await drain(2);
    t.mock.timers.tick(500);
    await drain(6);
    t.mock.timers.tick(500);
    await drain(6);
    await assert.rejects(terminating, (error) => error.message.includes("termination blocker"));
    assert.deepEqual(child.messages, []);
    assert.equal(child.kills, 0);
    assert.deepEqual(
      entries.map((entry) => entry.args[2].errorClass),
      ["stop-send", "stop-kill", "stop-termination-blocker"],
    );
  });
});

const RUNTIME = {
  root: "/synthetic/windows-runtime",
  entryPath: "/synthetic/windows-runtime/dist/windowsDevHelperMain.js",
  addonPath: "/synthetic/windows-runtime/dist/cua_windows.node",
  command: "/synthetic/electron-runtime",
  commandEnv: {
    [ADDON_ENV]: "must-be-overridden-by-host",
    KNORVIA_SVC04_RUNTIME_ENV: "runtime-set",
  },
};

function createHostHarness(overrides = {}) {
  const { entries, logger } = makeLogRecorder();
  const unexpected = [];
  const forks = [];
  const healthCalls = [];
  const sockets = [];
  const state = {
    forkFailure: undefined,
    healthResult: undefined,
    nextPid: 4200,
    ...overrides,
  };
  const host = new WindowsCuaHelperHost({
    runtime: RUNTIME,
    childProcess: {
      fork(command, argv, options) {
        if (state.forkFailure) throw state.forkFailure;
        const child = new FakeChild(state.nextPid);
        const record = { command, argv, options, child, socketPath: sockets[sockets.length - 1] };
        forks.push(record);
        return child;
      },
    },
    mintSocketPath: () => {
      const socketPath = `/synthetic/pipe-${sockets.length + 1}`;
      sockets.push(socketPath);
      return socketPath;
    },
    mintPluginAuthority: () => "synthetic-authority",
    healthProbe: async (socketPath, timeoutMs) => {
      healthCalls.push({ socketPath, timeoutMs });
      return state.healthResult ?? { bundleId: "synthetic.bundle", pid: state.nextPid };
    },
    startupTimeoutMs: 60_000,
    shutdownTimeoutMs: 50_000,
    logger,
    onUnexpectedExit: (info) => unexpected.push(info),
  });
  return { host, entries, logger, unexpected, forks, healthCalls, sockets, state };
}

/** 走完 fork → ready → health 握手，返回该代 fork 记录。 */
async function startReady(harness) {
  const starting = harness.host.start();
  await drain(4);
  const fork = harness.forks.at(-1);
  fork.child.dispatch("message", readyFor(fork.socketPath, fork.child.pid));
  const handle = await starting;
  return { fork, handle };
}

describe("S51 WindowsCuaHelperHost 启动握手", () => {
  it("S51 fork 参数与 env 合并顺序固定：runtime commandEnv 让位于主机铸的 addon/Electron 标记", async (t) => {
    withEnv(t, "KNORVIA_SVC04_SPAWN_PROBE", "spawn-visible");
    const harness = createHostHarness();
    const { fork, handle } = await startReady(harness);
    assert.equal(fork.command, RUNTIME.command);
    assert.deepEqual(fork.argv, [
      RUNTIME.entryPath,
      "--socket",
      harness.sockets[0],
      "--parent-pid",
      String(process.pid),
    ]);
    assert.equal(fork.options.cwd, RUNTIME.root);
    assert.equal(fork.options.env[ADDON_ENV], RUNTIME.addonPath);
    assert.equal(fork.options.env.ELECTRON_RUN_AS_NODE, "1");
    assert.equal(fork.options.env.KNORVIA_SVC04_RUNTIME_ENV, "runtime-set");
    assert.equal(fork.options.env.KNORVIA_SVC04_SPAWN_PROBE, "spawn-visible");
    assert.equal(handle.socketPath, harness.sockets[0]);
    assert.equal(handle.launchSocketPath, harness.sockets[0]);
    assert.equal(handle.helperAppPath, RUNTIME.entryPath);
    assert.equal(handle.pluginAuthority, "synthetic-authority");
    assert.equal(handle.bundleId, "synthetic.bundle");
    assert.equal(handle.pid, fork.child.pid);
    assert.deepEqual(harness.healthCalls, [{ socketPath: harness.sockets[0], timeoutMs: 60_000 }]);
    assert.equal(harness.host.running, true);
    assert.equal(harness.host.socketPath, harness.sockets[0]);
    assert.equal(harness.host.pluginAuthority, "synthetic-authority");
    const readyLog = harness.entries.at(-1);
    assert.equal(readyLog.level, "info");
    assert.equal(readyLog.args[1], "Windows Computer Use Helper ready");
    const stopping = harness.host.stop();
    harness.forks.at(-1).child.dispatch("exit", 0);
    await stopping;
    await drain(4);
  });

  it("S51 transport_ready 只对外承诺 transport，完整 health 仍等 ready", async () => {
    const harness = createHostHarness();
    const starting = harness.host.start();
    const transport = harness.host.waitForTransport(60_000);
    await drain(4);
    const fork = harness.forks[0];
    fork.child.dispatch("message", readyFor(fork.socketPath, fork.child.pid, "transport_ready"));
    const transportHandle = await transport;
    assert.deepEqual(transportHandle, {
      socketPath: fork.socketPath,
      pluginAuthority: "synthetic-authority",
    });
    assert.equal(harness.host.running, false);
    assert.equal(harness.host.socketPath, null);
    assert.deepEqual(harness.healthCalls, []);
    await drain(4);
    fork.child.dispatch("message", readyFor(fork.socketPath, fork.child.pid));
    const handle = await starting;
    assert.equal(handle.pid, fork.child.pid);
    assert.equal(harness.host.running, true);
  });

  it("S51 socketPath 不匹配的 ready 被忽略，PID 不匹配的 ready 直接判失败并终止子进程", async () => {
    const harness = createHostHarness();
    const starting = harness.host.start();
    await drain(4);
    const fork = harness.forks[0];
    fork.child.dispatch("message", readyFor("/synthetic/other-pipe", fork.child.pid));
    await drain(4);
    assert.deepEqual(harness.healthCalls, []);
    assert.equal(harness.host.running, false);

    fork.child.dispatch("message", readyFor(fork.socketPath, fork.child.pid + 1));
    await drain(4);
    assert.deepEqual(fork.child.messages, [{ protocol: CONTROL, type: "shutdown" }]);
    fork.child.dispatch("exit", 1);
    await assert.rejects(starting, (error) => error.message === "ready-pid-mismatch");
    assert.ok(harness.entries.some((entry) => entry.args[2]?.errorClass === "ready-pid-mismatch"));
  });

  it("S51 health 回报的 PID 与子进程不一致时判 health-pid-mismatch 失败", async () => {
    const harness = createHostHarness({ healthResult: { bundleId: "b", pid: 999 } });
    const starting = harness.host.start();
    await drain(4);
    const fork = harness.forks[0];
    fork.child.dispatch("message", readyFor(fork.socketPath, fork.child.pid));
    await drain(4);
    assert.deepEqual(harness.healthCalls, [{ socketPath: fork.socketPath, timeoutMs: 60_000 }]);
    fork.child.dispatch("exit", 1);
    await assert.rejects(starting, (error) => error.message === "health-pid-mismatch");
    assert.equal(harness.host.running, false);
  });

  it("S51 helper 自报 error 消息时用它自己的诊断文本失败，而不是畸形消息文案", async () => {
    const harness = createHostHarness();
    const starting = harness.host.start();
    await drain(4);
    const fork = harness.forks[0];
    fork.child.dispatch("message", {
      protocol: CONTROL,
      type: "error",
      message: "native addon boom",
    });
    await drain(4);
    fork.child.dispatch("exit", 2);
    await assert.rejects(starting, (error) => error.message === "native addon boom");
    const failure = harness.entries.find((entry) => entry.args[2]?.errorClass);
    assert.equal(failure.args[2].errorClass, "helper-reported-error");
  });

  it("S51 本协议下缺字段的 ready 判为畸形控制消息并终止该代", async () => {
    const harness = createHostHarness();
    const starting = harness.host.start();
    await drain(4);
    const fork = harness.forks[0];
    fork.child.dispatch("message", { protocol: CONTROL, type: "ready", socketPath: "", pid: 1 });
    await drain(4);
    fork.child.dispatch("exit", 1);
    await assert.rejects(
      starting,
      (error) => error.message === "Invalid Windows Computer Use Helper control message",
    );
    assert.ok(harness.entries.some((entry) => entry.args[2]?.errorClass === "malformed-message"));
  });

  it("S51 ready 之前子进程退出：以退出码诊断失败；child error 事件同样终止该代", async () => {
    const harness = createHostHarness();
    const starting = harness.host.start();
    await drain(4);
    const first = harness.forks[0];
    first.child.dispatch("exit", 3);
    await assert.rejects(
      starting,
      (error) => error.message === "Windows Computer Use Helper exited before ready (3)",
    );

    const second = createHostHarness();
    const startingSecond = second.host.start();
    await drain(4);
    const fork = second.forks[0];
    const childError = new Error("synthetic child spawn error");
    fork.child.dispatch("error", childError);
    await drain(4);
    fork.child.dispatch("exit", null);
    await assert.rejects(startingSecond, (error) => error === childError);
    assert.ok(second.entries.some((entry) => entry.args[2]?.errorClass === "child-error"));
  });

  it("S51 fork 同步抛错时立即收口 transport 等待并记 fork 失败", async () => {
    const boom = new Error("synthetic fork boom");
    const harness = createHostHarness({ forkFailure: boom });
    await assert.rejects(harness.host.start(), (error) => error === boom);
    assert.equal(harness.forks.length, 0);
    assert.equal(harness.host.running, false);
    await assert.rejects(
      harness.host.waitForTransport(60_000),
      (error) => error === boom || error.message.includes("not starting"),
    );
    const failure = harness.entries.find((entry) => entry.args[2]?.errorClass);
    assert.equal(failure.args[2].errorClass, "fork");
    assert.equal(failure.args[2].generation, 1);
  });

  it("S51 监听注册失败即判 listener-setup，不留下无人观测的子进程", async () => {
    const harness = createHostHarness();
    const starting = harness.host.start();
    await drain(4);
    const fork = harness.forks[0];
    assert.ok(fork.child.listeners.exit.length >= 1);
    await drain(2);
    fork.child.dispatch("exit", 1);
    await assert.rejects(starting, (error) =>
      /startup timed out|exited before ready|listener setup failed/u.test(error.message),
    );
  });

  it("S51 启动超时按 startupTimeoutMs 触发并终止该代子进程", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"], now: 40_000 });
    const harness = createHostHarness();
    const starting = harness.host.start();
    await drain(4);
    const fork = harness.forks[0];
    t.mock.timers.tick(59_999);
    await drain(4);
    assert.equal(harness.host.running, false);
    t.mock.timers.tick(1);
    await drain(6);
    assert.deepEqual(fork.child.messages, [{ protocol: CONTROL, type: "shutdown" }]);
    fork.child.dispatch("exit", null);
    await assert.rejects(
      starting,
      (error) => error.message === "Windows Computer Use Helper startup timed out",
    );
    assert.ok(harness.entries.some((entry) => entry.args[2]?.errorClass === "startup-timeout"));
  });
});

describe("S52 WindowsCuaHelperHost transport 承诺与并发", () => {
  it("S52 未启动时 waitForTransport 直接拒绝，已握手后同步返回同一组凭据", async () => {
    const harness = createHostHarness();
    await assert.rejects(
      harness.host.waitForTransport(60_000),
      (error) => error.message === "Windows Computer Use Helper is not starting",
    );
    const { handle } = await startReady(harness);
    const resolved = await harness.host.waitForTransport(60_000);
    assert.deepEqual(resolved, {
      socketPath: handle.socketPath,
      pluginAuthority: handle.pluginAuthority,
    });
  });

  it("S52 同一 start 的并发调用复用同一 promise，只 fork 一次", async () => {
    const harness = createHostHarness();
    const first = harness.host.start();
    const second = harness.host.start();
    assert.equal(first, second);
    await drain(4);
    assert.equal(harness.forks.length, 1);
    const fork = harness.forks[0];
    fork.child.dispatch("message", readyFor(fork.socketPath, fork.child.pid));
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a, b);
    assert.equal(harness.sockets.length, 1);
    assert.equal(harness.forks.length, 1);
  });

  it("S52 waitForTransport 自带 30s 默认预算，Helper 不回消息时不会悬挂", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"], now: 50_000 });
    const harness = createHostHarness();
    const starting = harness.host.start();
    const transport = harness.host.waitForTransport();
    await drain(4);
    t.mock.timers.tick(29_999);
    await drain(4);
    let settled = "pending";
    transport.then(
      () => {
        settled = "resolved";
      },
      () => {
        settled = "rejected";
      },
    );
    await drain(2);
    assert.equal(settled, "pending");
    t.mock.timers.tick(1);
    await assert.rejects(
      transport,
      (error) => error.message === "Windows Computer Use Helper transport timed out after 30000ms",
    );
    const fork = harness.forks[0];
    fork.child.dispatch("exit", null);
    await assert.rejects(starting, (error) => error.message.includes("exited before ready"));
  });

  it("S52 Ready 后意外退出只通知 lifecycle owner，下次 start 复用已发布的 pipe 而不改发新凭据", async () => {
    const harness = createHostHarness();
    const { fork, handle } = await startReady(harness);
    fork.child.dispatch("exit", null);
    await drain(4);
    assert.deepEqual(harness.unexpected, [{ generation: 1, pid: fork.child.pid }]);
    assert.equal(harness.host.running, false);
    assert.equal(harness.host.socketPath, null);
    assert.ok(
      harness.entries.some(
        (entry) =>
          entry.level === "warn" &&
          entry.args[1] === "Windows Computer Use Helper exited unexpectedly" &&
          entry.args[2].errorClass === "unexpected-exit",
      ),
    );
    // 死代际的消息不再被接受
    fork.child.dispatch("message", readyFor(handle.socketPath, fork.child.pid));
    await drain(4);
    assert.equal(harness.healthCalls.length, 1);
    harness.state.nextPid = 4201;
    const starting = harness.host.start();
    await drain(4);
    assert.equal(harness.forks.length, 2);
    const next = harness.forks[1];
    assert.equal(next.argv[2], handle.socketPath);
    assert.equal(harness.sockets.length, 1);
    assert.notEqual(next.child, fork.child);
    next.child.dispatch("message", readyFor(next.argv[2], next.child.pid));
    const recovered = await starting;
    assert.equal(recovered.socketPath, handle.socketPath);
    assert.equal(recovered.pluginAuthority, handle.pluginAuthority);
    assert.equal(harness.state.nextPid, 4201);
  });
});

describe("S53 WindowsCuaHelperHost stop/restart 边界", () => {
  it("S53 在途 start 被 stop 中止：以 startup stopped 拒绝，旧代际不得再 fork", async () => {
    const harness = createHostHarness();
    const starting = harness.host.start();
    await drain(4);
    const fork = harness.forks[0];
    const stopping = harness.host.stop();
    await assert.rejects(
      starting,
      (error) => error.message === "Windows Computer Use Helper startup stopped",
    );
    assert.deepEqual(fork.child.messages, [{ protocol: CONTROL, type: "shutdown" }]);
    // stop 之后旧代际的消息必须被丢弃，不能把已清除的 tuple 写回。
    fork.child.dispatch("message", readyFor(fork.socketPath, fork.child.pid));
    await drain(4);
    assert.equal(harness.host.running, false);
    fork.child.dispatch("exit", 0);
    await stopping;
    assert.equal(harness.host.socketPath, null);

    const nextStart = harness.host.start();
    await drain(4);
    assert.equal(harness.forks.length, 2);
    const next = harness.forks[1];
    assert.equal(harness.sockets.length, 2);
    next.child.dispatch("message", readyFor(next.socketPath, next.child.pid));
    const handle = await nextStart;
    assert.equal(handle.socketPath, harness.sockets[1]);
    next.child.dispatch("exit", 0);
    await harness.host.stop();
    await drain(4);
  });

  it("S53 restart 停旧起新并用独立 in-flight 槽位，重复调用复用同一 promise", async () => {
    const harness = createHostHarness();
    const { fork, handle } = await startReady(harness);
    const first = harness.host.restart();
    assert.equal(harness.host.restart(), first);
    await drain(4);
    assert.deepEqual(fork.child.messages, [{ protocol: CONTROL, type: "shutdown" }]);
    fork.child.dispatch("exit", 0);
    await drain(6);
    assert.equal(harness.forks.length, 2);
    const next = harness.forks[1];
    assert.equal(harness.sockets.length, 2);
    next.child.dispatch("message", readyFor(next.socketPath, next.child.pid));
    const restarted = await first;
    assert.notEqual(restarted.socketPath, handle.socketPath);

    // restartAfterCurrentStart 是另一条槽位：与 restart 返回不同 promise。
    const viaPermissionPath = harness.host.restartAfterCurrentStart();
    const secondRestart = harness.host.restart();
    secondRestart.catch(() => {});
    assert.notEqual(viaPermissionPath, secondRestart);
    await drain(4);
    next.child.dispatch("exit", 0);
    await drain(6);
    const third = harness.forks[2];
    third.child.dispatch("message", readyFor(third.socketPath, third.child.pid));
    await viaPermissionPath;
    assert.equal(harness.forks.length, 3);
    third.child.dispatch("exit", 0);
    await harness.host.stop();
    await drain(4);
  });

  it("S53 保留 transport 的重启复用已发布凭据；无凭据时先跑 beforeFreshStart 再 mint 新 pipe", async () => {
    const harness = createHostHarness();
    const { handle } = await startReady(harness);
    const order = [];
    harness.forks[0].child.send = (message) => {
      order.push(`child-send:${message.type}`);
      return true;
    };
    const preserved = harness.host.restartAfterCurrentStartPreservingTransport();
    await drain(4);
    harness.forks[0].child.dispatch("exit", 0);
    await drain(8);
    assert.equal(harness.forks.length, 2);
    const next = harness.forks[1];
    assert.equal(next.argv[2], handle.socketPath);
    assert.equal(harness.sockets.length, 1);
    next.child.dispatch("message", readyFor(next.argv[2], next.child.pid));
    const result = await preserved;
    assert.equal(result.reused, true);
    assert.equal(result.handle.socketPath, handle.socketPath);
    assert.deepEqual(order, ["child-send:shutdown"]);

    const freshHarness = createHostHarness();
    const freshCalls = [];
    const fresh = freshHarness.host.restartAfterCurrentStartPreservingTransport({
      beforeFreshStart: () => freshCalls.push("before-fresh-start"),
    });
    await drain(6);
    assert.deepEqual(freshCalls, ["before-fresh-start"]);
    const freshFork = freshHarness.forks[0];
    freshFork.child.dispatch("message", readyFor(freshFork.socketPath, freshFork.child.pid));
    const freshResult = await fresh;
    assert.equal(freshResult.reused, false);
    assert.equal(freshResult.handle.socketPath, freshHarness.sockets[0]);
    freshFork.child.dispatch("exit", 0);
    await freshHarness.host.stop();
  });

  it("S53 checkHealth 只在运行中探测，并原样透传 socketPath 与超时", async () => {
    const harness = createHostHarness();
    await assert.rejects(
      harness.host.checkHealth(),
      (error) => error.message === "Windows Computer Use Helper is not running",
    );
    assert.deepEqual(harness.healthCalls, []);
    const { handle } = await startReady(harness);
    harness.healthCalls.length = 0;
    assert.deepEqual(await harness.host.checkHealth(1_234), {
      bundleId: "synthetic.bundle",
      pid: harness.state.nextPid,
    });
    assert.deepEqual(harness.healthCalls, [{ socketPath: handle.socketPath, timeoutMs: 1_234 }]);
    harness.healthCalls.length = 0;
    await harness.host.checkHealth();
    assert.deepEqual(harness.healthCalls, [{ socketPath: handle.socketPath, timeoutMs: 1_000 }]);
  });

  it("S53 终止阻塞会毒化后续操作：没有 exact exit 的 stop 之后新 start 不再 fork", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"], now: 60_000 });
    const harness = createHostHarness();
    const { handle } = await startReady(harness);
    assert.equal(handle.running, undefined);
    const stopping = harness.host.stop();
    await drain(4);
    t.mock.timers.tick(50_000);
    await drain(6);
    t.mock.timers.tick(50_000);
    await drain(6);
    await assert.rejects(stopping, (error) => error.message.includes("termination blocker"));
    assert.equal(harness.host.running, false);

    const forkCount = harness.forks.length;
    await assert.rejects(harness.host.start(), (error) =>
      error.message.includes("termination blocker"),
    );
    assert.equal(harness.forks.length, forkCount);
  });
});

/**
 * 合成根路径必须与实现同口径构造。
 *
 * 被测实现用宿主的 `path.resolve()` 把 `resourcesPath` 与 `KNORVIA_CUA_DEV_ROOT`
 * 变成真实路径（`packages/services/src/cua-permission-broker/windowsCuaDevRuntime.ts`
 * 的 `resolvePackagedRuntime` / `resolveDevelopmentRuntime`）。宿主是 Windows 时
 * `resolve("/synthetic/Resources")` 得到 `D:\synthetic\Resources`，若夹具仍用
 * POSIX 字面量建键，归一后是 `/synthetic/Resources`，两侧永不相等，所有用例都会
 * 误报 `invalid-runtime-manifest`（Linux 上恰好相等，故只在 Windows 暴露）。
 *
 * 因此这里也过一遍 `resolveHostPath()`，让夹具键与实现键落在同一坐标系，并把比较
 * 统一成「分隔符归一成 /、大小写归一」——前者吸收分隔符差异，后者与实现
 * `samePhysicalPath()` 的 `toLowerCase()` 口径一致。
 */
const hostRoot = (posixPath) => resolveHostPath(posixPath);

const DEV_ROOT = hostRoot("/synthetic/cua-dev-root");
const DEV_ENTRY = "dist/windowsDevHelperMain.js";
const DEV_ADDON = "dist/cua_windows.node";

function devPackage(contractOverrides) {
  const contract = { schema: 1, windows: { entry: DEV_ENTRY, nativeAddon: DEV_ADDON } };
  return JSON.stringify({
    name: "@knorvia/cua",
    version: "0.6.3",
    knorviaCuaRuntime: contractOverrides ? { ...contract, ...contractOverrides } : contract,
  });
}

const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");
const PACKAGED_RESOURCES = hostRoot("/synthetic/Resources");
const PACKAGED_ROOT = hostRoot("/synthetic/Resources/tools/cua-helper");
const PACKAGED_ENTRY = "bin/windowsDevHelperMain.js";
const PACKAGED_ADDON = "bin/cua_windows.node";
const packagedEntryBytes = new Uint8Array([1, 2, 3, 65, 66]);
const packagedAddonBytes = new Uint8Array([9, 8, 7, 65, 66, 67]);

function packagedManifest(overrides = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    packageName: "@knorvia/cua",
    packageVersion: "0.6.3",
    platform: "win32",
    arch: "x64",
    electronVersion: "99.0.0",
    entry: PACKAGED_ENTRY,
    addon: PACKAGED_ADDON,
    sha256: { entry: sha256Hex(packagedEntryBytes), addon: sha256Hex(packagedAddonBytes) },
    ...overrides,
  });
}

/**
 * 注入式文件系统：全部路径按「分隔符归一 + 大小写归一」比较，不接触真实磁盘。
 *
 * 大小写归一与实现 `samePhysicalPath()` 的 `windowsPath.normalize(p).toLowerCase()`
 * 保持同一口径（`windowsCuaDevRuntime.ts`）；Windows 的盘符与临时路径大小写不稳定，
 * 夹具若按大小写敏感建键会出现「同一路径查不到」的假阴性。
 */
function makeFakeFileSystem(entries, options = {}) {
  const norm = (value) => (value.replace(/\\/gu, "/").replace(/\/+$/u, "") || "/").toLowerCase();
  const index = new Map();
  for (const [key, value] of Object.entries(entries)) index.set(norm(key), value);
  const touched = [];
  const lookup = (path) => {
    touched.push(path);
    const hit = index.get(norm(path));
    if (!hit) {
      const error = new Error(`synthetic ENOENT ${path}`);
      error.code = "ENOENT";
      throw error;
    }
    return hit;
  };
  const fileSystem = {
    touched,
    async stat(path) {
      const entry = lookup(path);
      return { isDirectory: () => entry.kind === "dir", isFile: () => entry.kind === "file" };
    },
    async lstat(path) {
      const entry = lookup(path);
      return {
        isDirectory: () => entry.kind === "dir" && entry.symlink !== true,
        isFile: () => entry.kind === "file" && entry.symlink !== true,
        isSymbolicLink: () => entry.symlink === true,
      };
    },
    async realpath(path) {
      const entry = lookup(path);
      return norm(entry.realPath ?? path);
    },
    async readFile(path, encoding) {
      const entry = lookup(path);
      if (entry.readFails) throw new Error(`synthetic read failure ${path}`);
      return encoding === "utf8" ? entry.text : entry.bytes;
    },
  };
  if (options.omit) {
    for (const method of options.omit) delete fileSystem[method];
  }
  return fileSystem;
}

const win32Only = (extra = {}) => ({ platform: "win32", env: {}, ...extra });

describe("S54 resolveWindowsCuaRuntime 平台门与开发根解析", () => {
  it("S54 非 win32 平台在触碰文件系统前就拒绝，Linux/darwin 走同一诊断", async () => {
    const forbidden = {
      touched: [],
      stat: () => {
        throw new Error("must not touch filesystem");
      },
      lstat: () => {
        throw new Error("must not touch filesystem");
      },
      realpath: () => {
        throw new Error("must not touch filesystem");
      },
      readFile: () => {
        throw new Error("must not touch filesystem");
      },
    };
    for (const platform of ["darwin", "linux"]) {
      await assert.rejects(
        () => resolveWindowsCuaRuntime({ platform, env: {}, fileSystem: forbidden }),
        (error) =>
          error instanceof WindowsCuaDevRuntimeResolutionError &&
          error.name === "WindowsCuaDevRuntimeResolutionError" &&
          error.reason === "unsupported-platform" &&
          error.artifact === undefined &&
          error.message === "Windows CUA runtime is only available on win32.",
        platform,
      );
    }
    // 默认按宿主平台判定：宿主不是 win32 时不注入 platform 也必须拒绝。
    // 宿主是 win32 时同一分支无法成立（拒绝理由会变成 missing-resources-path），
    // 改为断言「不注入 platform 时走的是 win32 分支」——两条分支都必须可测，
    // 且都不接触真实文件系统。
    if (process.platform === "win32") {
      await assert.rejects(
        () => resolveWindowsCuaRuntime({}),
        (error) =>
          error.reason === "missing-resources-path" &&
          error.message === "Windows CUA packaged runtime requires resourcesPath.",
      );
    } else {
      await assert.rejects(
        () => resolveWindowsCuaRuntime(),
        (error) => error.reason === "unsupported-platform",
      );
    }
  });

  it("S54 显式开发根优先于安装资源；配置成相对路径时 fail closed 而不回退资源目录", async () => {
    const fileSystem = makeFakeFileSystem({
      [DEV_ROOT]: { kind: "dir" },
      [`${DEV_ROOT}/package.json`]: { kind: "file", text: devPackage() },
      [`${DEV_ROOT}/${DEV_ENTRY}`]: { kind: "file", bytes: packagedEntryBytes },
      [`${DEV_ROOT}/${DEV_ADDON}`]: { kind: "file", bytes: packagedAddonBytes },
      [PACKAGED_ROOT]: { kind: "dir" },
      [`${PACKAGED_ROOT}/runtime-manifest.json`]: { kind: "file", text: packagedManifest() },
      [`${PACKAGED_ROOT}/${PACKAGED_ENTRY}`]: { kind: "file", bytes: packagedEntryBytes },
      [`${PACKAGED_ROOT}/${PACKAGED_ADDON}`]: { kind: "file", bytes: packagedAddonBytes },
    });
    const runtime = await resolveWindowsCuaRuntime(
      win32Only({
        env: { KNORVIA_CUA_DEV_ROOT: DEV_ROOT },
        resourcesPath: PACKAGED_RESOURCES,
        fileSystem,
      }),
    );
    assert.equal(runtime.root, DEV_ROOT);
    // 返回值按宿主原生分隔符给出（实现内部用 join/resolve），期望值同样用 join 构造，
    // 避免把 `/` 拼接的字面量与 Windows 反斜杠路径做字符串比较。
    assert.equal(runtime.entryPath, join(DEV_ROOT, DEV_ENTRY));
    assert.equal(runtime.addonPath, join(DEV_ROOT, DEV_ADDON));
    assert.equal(runtime.command, process.execPath);
    assert.deepEqual(runtime.commandEnv, { ELECTRON_RUN_AS_NODE: "1" });

    const relative = makeFakeFileSystem({});
    await assert.rejects(
      () =>
        resolveWindowsCuaRuntime(
          win32Only({
            env: { KNORVIA_CUA_DEV_ROOT: "relative/cua-root" },
            resourcesPath: PACKAGED_RESOURCES,
            fileSystem: relative,
          }),
        ),
      (error) =>
        error.reason === "development-root-not-absolute" &&
        error.message === "KNORVIA_CUA_DEV_ROOT must be an absolute path.",
    );
    assert.deepEqual(relative.touched, []);
  });

  it("S54 非 Windows 主机也接受 C:\\ 形式的开发根，按 Windows 路径语义解析产物", async () => {
    const windowsRoot = "C:\\dev\\cua-root";
    const fileSystem = makeFakeFileSystem({
      [windowsRoot]: { kind: "dir" },
      [`${windowsRoot}\\package.json`]: { kind: "file", text: devPackage() },
      [`${windowsRoot}\\${DEV_ENTRY}`]: { kind: "file", bytes: packagedEntryBytes },
      [`${windowsRoot}\\${DEV_ADDON}`]: { kind: "file", bytes: packagedAddonBytes },
    });
    const runtime = await resolveWindowsCuaRuntime(
      win32Only({ env: { KNORVIA_CUA_DEV_ROOT: windowsRoot }, fileSystem }),
    );
    assert.equal(runtime.root, windowsRoot);
    assert.ok(runtime.entryPath.startsWith(windowsRoot));
    assert.ok(runtime.entryPath.endsWith("windowsDevHelperMain.js"));
    assert.ok(runtime.addonPath.endsWith("cua_windows.node"));
    assert.notEqual(runtime.entryPath, runtime.addonPath);
  });

  it("S54 开发根必须是自己指向自己的实体目录：stat 跟随 junction 时按未找到处理", async () => {
    const escaping = makeFakeFileSystem({
      [DEV_ROOT]: { kind: "dir", realPath: "/synthetic/elsewhere" },
    });
    await assert.rejects(
      () =>
        resolveWindowsCuaRuntime(
          win32Only({ env: { KNORVIA_CUA_DEV_ROOT: DEV_ROOT }, fileSystem: escaping }),
        ),
      (error) =>
        error.reason === "development-root-not-found" &&
        error.message === "KNORVIA_CUA_DEV_ROOT must reference an existing regular directory.",
    );
    const missing = makeFakeFileSystem({});
    await assert.rejects(
      () =>
        resolveWindowsCuaRuntime(
          win32Only({ env: { KNORVIA_CUA_DEV_ROOT: DEV_ROOT }, fileSystem: missing }),
        ),
      (error) => error.reason === "development-root-not-found" && error.artifact === undefined,
    );
  });

  it("S54 package.json 契约必须点名 @knorvia/cua 并给出 entry/nativeAddon，否则统一 invalid-package", async () => {
    const cases = [
      [
        "名字不符",
        JSON.stringify({
          name: "@other/cua",
          version: "1.0.0",
          knorviaCuaRuntime: { schema: 1, windows: { entry: DEV_ENTRY, nativeAddon: DEV_ADDON } },
        }),
      ],
      ["缺契约", JSON.stringify({ name: "@knorvia/cua", version: "1.0.0" })],
      [
        "schema 不符",
        JSON.stringify({
          name: "@knorvia/cua",
          version: "1.0.0",
          knorviaCuaRuntime: { schema: 2, windows: { entry: DEV_ENTRY, nativeAddon: DEV_ADDON } },
        }),
      ],
      [
        "entry 与 addon 相同",
        JSON.stringify({
          name: "@knorvia/cua",
          version: "1.0.0",
          knorviaCuaRuntime: { schema: 1, windows: { entry: DEV_ENTRY, nativeAddon: DEV_ENTRY } },
        }),
      ],
      [
        "版本带空白",
        JSON.stringify({
          name: "@knorvia/cua",
          version: " 1.0.0",
          knorviaCuaRuntime: { schema: 1, windows: { entry: DEV_ENTRY, nativeAddon: DEV_ADDON } },
        }),
      ],
      ["JSON 损坏", "{not json"],
    ];
    for (const [label, text] of cases) {
      const fileSystem = makeFakeFileSystem({
        [DEV_ROOT]: { kind: "dir" },
        [`${DEV_ROOT}/package.json`]: { kind: "file", text },
      });
      await assert.rejects(
        () =>
          resolveWindowsCuaRuntime(
            win32Only({ env: { KNORVIA_CUA_DEV_ROOT: DEV_ROOT }, fileSystem }),
          ),
        (error) =>
          error.reason === "invalid-package" &&
          error.artifact === "package.json" &&
          error.message.includes("@knorvia/cua"),
        label,
      );
    }
  });

  it("S54 契约里的产物路径必须是受含相对路径，越界或绝对写法判 invalid-artifact-path", async () => {
    for (const entry of ["../escape.js", "dist//entry.js", "./dist/entry.js", "C:/abs/entry.js"]) {
      const fileSystem = makeFakeFileSystem({
        [PACKAGED_ROOT]: { kind: "dir" },
        [`${PACKAGED_ROOT}/runtime-manifest.json`]: {
          kind: "file",
          text: packagedManifest({ entry }),
        },
        [`${PACKAGED_ROOT}/${PACKAGED_ENTRY}`]: { kind: "file", bytes: packagedEntryBytes },
        [`${PACKAGED_ROOT}/${PACKAGED_ADDON}`]: { kind: "file", bytes: packagedAddonBytes },
      });
      await assert.rejects(
        () =>
          resolveWindowsCuaRuntime(
            win32Only({
              env: {},
              resourcesPath: PACKAGED_RESOURCES,
              arch: "x64",
              electronVersion: "99.0.0",
              fileSystem,
            }),
          ),
        (error) =>
          error.reason === "invalid-artifact-path" &&
          error.artifact === "entry" &&
          error.message ===
            "Windows CUA packaged runtime entry must be a contained relative artifact path.",
        entry,
      );
    }
  });

  it("S54 缺 entry/addon 文件按各自 reason 报告，符号链接产物判 invalid-artifact-path", async () => {
    const noEntry = makeFakeFileSystem({
      [DEV_ROOT]: { kind: "dir" },
      [`${DEV_ROOT}/package.json`]: { kind: "file", text: devPackage() },
      [`${DEV_ROOT}/${DEV_ADDON}`]: { kind: "file", bytes: packagedAddonBytes },
    });
    await assert.rejects(
      () =>
        resolveWindowsCuaRuntime(
          win32Only({ env: { KNORVIA_CUA_DEV_ROOT: DEV_ROOT }, fileSystem: noEntry }),
        ),
      (error) =>
        error.reason === "missing-helper-entry" &&
        error.artifact === DEV_ENTRY &&
        error.message === `Windows CUA runtime is missing required entry: ${DEV_ENTRY}.`,
    );

    const noAddon = makeFakeFileSystem({
      [DEV_ROOT]: { kind: "dir" },
      [`${DEV_ROOT}/package.json`]: { kind: "file", text: devPackage() },
      [`${DEV_ROOT}/${DEV_ENTRY}`]: { kind: "file", bytes: packagedEntryBytes },
    });
    await assert.rejects(
      () =>
        resolveWindowsCuaRuntime(
          win32Only({ env: { KNORVIA_CUA_DEV_ROOT: DEV_ROOT }, fileSystem: noAddon }),
        ),
      (error) => error.reason === "missing-native-addon" && error.artifact === DEV_ADDON,
    );

    const symlinkAddon = makeFakeFileSystem({
      [DEV_ROOT]: { kind: "dir" },
      [`${DEV_ROOT}/package.json`]: { kind: "file", text: devPackage() },
      [`${DEV_ROOT}/${DEV_ENTRY}`]: { kind: "file", bytes: packagedEntryBytes },
      [`${DEV_ROOT}/${DEV_ADDON}`]: { kind: "file", symlink: true },
    });
    await assert.rejects(
      () =>
        resolveWindowsCuaRuntime(
          win32Only({ env: { KNORVIA_CUA_DEV_ROOT: DEV_ROOT }, fileSystem: symlinkAddon }),
        ),
      (error) => error.reason === "invalid-artifact-path" && error.artifact === "addon",
    );

    const escapingEntry = makeFakeFileSystem({
      [DEV_ROOT]: { kind: "dir" },
      [`${DEV_ROOT}/package.json`]: { kind: "file", text: devPackage() },
      [`${DEV_ROOT}/${DEV_ENTRY}`]: {
        kind: "file",
        bytes: packagedEntryBytes,
        realPath: "/synthetic/elsewhere/entry.js",
      },
    });
    await assert.rejects(
      () =>
        resolveWindowsCuaRuntime(
          win32Only({ env: { KNORVIA_CUA_DEV_ROOT: DEV_ROOT }, fileSystem: escapingEntry }),
        ),
      (error) => error.reason === "invalid-artifact-path" && error.artifact === "entry",
    );
  });
});

describe("S55 resolveWindowsCuaRuntime 打包模式与完整性", () => {
  it("S55 缺 resourcesPath 或非绝对 resourcesPath 分别拒绝，不搜索源码目录", async () => {
    const forbidden = {
      stat: () => Promise.reject(new Error("must not touch filesystem")),
      lstat: () => Promise.reject(new Error("must not touch filesystem")),
      realpath: () => Promise.reject(new Error("must not touch filesystem")),
      readFile: () => Promise.reject(new Error("must not touch filesystem")),
    };
    await assert.rejects(
      () => resolveWindowsCuaRuntime(win32Only({ env: {}, fileSystem: forbidden })),
      (error) =>
        error.reason === "missing-resources-path" &&
        error.message === "Windows CUA packaged runtime requires resourcesPath.",
    );
    await assert.rejects(
      () =>
        resolveWindowsCuaRuntime(
          win32Only({ env: {}, resourcesPath: "relative/Resources", fileSystem: forbidden }),
        ),
      (error) =>
        error.reason === "resources-path-not-absolute" &&
        error.message === "Windows CUA packaged runtime resourcesPath must be absolute.",
    );
  });

  it("S55 打包模式只读 resources/tools/cua-helper 并按清单交付运行时", async () => {
    const fileSystem = makeFakeFileSystem({
      [PACKAGED_ROOT]: { kind: "dir" },
      [`${PACKAGED_ROOT}/runtime-manifest.json`]: { kind: "file", text: packagedManifest() },
      [`${PACKAGED_ROOT}/${PACKAGED_ENTRY}`]: { kind: "file", bytes: packagedEntryBytes },
      [`${PACKAGED_ROOT}/${PACKAGED_ADDON}`]: { kind: "file", bytes: packagedAddonBytes },
    });
    const runtime = await resolveWindowsCuaRuntime(
      win32Only({
        env: {},
        resourcesPath: PACKAGED_RESOURCES,
        arch: "x64",
        electronVersion: "99.0.0",
        fileSystem,
      }),
    );
    assert.equal(runtime.root, PACKAGED_ROOT);
    assert.equal(runtime.entryPath, join(PACKAGED_ROOT, PACKAGED_ENTRY));
    assert.equal(runtime.addonPath, join(PACKAGED_ROOT, PACKAGED_ADDON));
    assert.deepEqual(runtime.commandEnv, { ELECTRON_RUN_AS_NODE: "1" });
    assert.ok(fileSystem.touched.some((path) => path.endsWith("runtime-manifest.json")));
    assert.ok(!fileSystem.touched.some((path) => path.includes("node_modules")));
  });

  it("S55 清单缺失/非对象/根目录被重定向都归为 invalid-runtime-manifest", async () => {
    const variants = [
      ["清单损坏", { [`${PACKAGED_ROOT}/runtime-manifest.json`]: { kind: "file", text: "{oops" } }],
      ["清单是数组", { [`${PACKAGED_ROOT}/runtime-manifest.json`]: { kind: "file", text: "[]" } }],
      [
        "清单是符号链接",
        { [`${PACKAGED_ROOT}/runtime-manifest.json`]: { kind: "file", symlink: true } },
      ],
    ];
    for (const [label, override] of variants) {
      const fileSystem = makeFakeFileSystem({
        [PACKAGED_ROOT]: { kind: "dir" },
        ...override,
      });
      await assert.rejects(
        () =>
          resolveWindowsCuaRuntime(
            win32Only({
              env: {},
              resourcesPath: PACKAGED_RESOURCES,
              arch: "x64",
              electronVersion: "99.0.0",
              fileSystem,
            }),
          ),
        (error) =>
          error.reason === "invalid-runtime-manifest" && error.artifact === "runtime-manifest.json",
        label,
      );
    }
    const redirectedRoot = makeFakeFileSystem({
      [PACKAGED_ROOT]: { kind: "dir", realPath: "/synthetic/elsewhere" },
      [`${PACKAGED_ROOT}/runtime-manifest.json`]: { kind: "file", text: packagedManifest() },
    });
    await assert.rejects(
      () =>
        resolveWindowsCuaRuntime(
          win32Only({
            env: {},
            resourcesPath: PACKAGED_RESOURCES,
            arch: "x64",
            electronVersion: "99.0.0",
            fileSystem: redirectedRoot,
          }),
        ),
      (error) => error.reason === "invalid-runtime-manifest",
    );
  });

  it("S55 清单与当前运行时不匹配时判 incompatible，且校验是精确键集与逐字段匹配", async () => {
    const cases = [
      ["架构不符", { arch: "arm64" }, "x64"],
      ["Electron 版本不符", { electronVersion: "88.0.0" }, "99.0.0"],
      ["平台不符", { platform: "darwin" }, undefined],
      ["schemaVersion 不符", { schemaVersion: 2 }, undefined],
      ["包名不符", { packageName: "@other/cua" }, undefined],
      ["entry 与 addon 相同", { entry: PACKAGED_ADDON }, undefined],
      ["多一个键", { extraKey: 1 }, undefined],
      [
        "sha256 非十六进制",
        { sha256: { entry: "ZZ", addon: sha256Hex(packagedAddonBytes) } },
        undefined,
      ],
    ];
    for (const [label, override, arch] of cases) {
      const fileSystem = makeFakeFileSystem({
        [PACKAGED_ROOT]: { kind: "dir" },
        [`${PACKAGED_ROOT}/runtime-manifest.json`]: {
          kind: "file",
          text: packagedManifest(override),
        },
        [`${PACKAGED_ROOT}/${PACKAGED_ENTRY}`]: { kind: "file", bytes: packagedEntryBytes },
        [`${PACKAGED_ROOT}/${PACKAGED_ADDON}`]: { kind: "file", bytes: packagedAddonBytes },
      });
      await assert.rejects(
        () =>
          resolveWindowsCuaRuntime(
            win32Only({
              env: {},
              resourcesPath: PACKAGED_RESOURCES,
              arch: arch ?? "x64",
              electronVersion: "99.0.0",
              fileSystem,
            }),
          ),
        (error) =>
          error.reason === "incompatible-runtime-manifest" &&
          error.message ===
            "Windows CUA packaged runtime runtime-manifest.json is incompatible with this runtime.",
        label,
      );
    }
  });

  it("S55 产物字节与清单 sha256 不符时按 artifact-integrity-mismatch 失败并指出是哪一项", async () => {
    const tamperedEntry = makeFakeFileSystem({
      [PACKAGED_ROOT]: { kind: "dir" },
      [`${PACKAGED_ROOT}/runtime-manifest.json`]: { kind: "file", text: packagedManifest() },
      [`${PACKAGED_ROOT}/${PACKAGED_ENTRY}`]: {
        kind: "file",
        bytes: new Uint8Array([1, 2, 3, 65, 67]),
      },
      [`${PACKAGED_ROOT}/${PACKAGED_ADDON}`]: { kind: "file", bytes: packagedAddonBytes },
    });
    await assert.rejects(
      () =>
        resolveWindowsCuaRuntime(
          win32Only({
            env: {},
            resourcesPath: PACKAGED_RESOURCES,
            arch: "x64",
            electronVersion: "99.0.0",
            fileSystem: tamperedEntry,
          }),
        ),
      (error) =>
        error.reason === "artifact-integrity-mismatch" &&
        error.artifact === "entry" &&
        error.message === "Windows CUA packaged runtime entry failed SHA-256 verification.",
    );

    const tamperedAddon = makeFakeFileSystem({
      [PACKAGED_ROOT]: { kind: "dir" },
      [`${PACKAGED_ROOT}/runtime-manifest.json`]: { kind: "file", text: packagedManifest() },
      [`${PACKAGED_ROOT}/${PACKAGED_ENTRY}`]: { kind: "file", bytes: packagedEntryBytes },
      [`${PACKAGED_ROOT}/${PACKAGED_ADDON}`]: {
        kind: "file",
        bytes: new Uint8Array([9, 8, 7, 65, 66, 68]),
      },
    });
    await assert.rejects(
      () =>
        resolveWindowsCuaRuntime(
          win32Only({
            env: {},
            resourcesPath: PACKAGED_RESOURCES,
            arch: "x64",
            electronVersion: "99.0.0",
            fileSystem: tamperedAddon,
          }),
        ),
      (error) => error.reason === "artifact-integrity-mismatch" && error.artifact === "addon",
    );

    // stat 与 read 之间文件被删除时仍归为缺产物，不泄漏宿主 I/O 诊断。
    const vanishing = makeFakeFileSystem({
      [PACKAGED_ROOT]: { kind: "dir" },
      [`${PACKAGED_ROOT}/runtime-manifest.json`]: { kind: "file", text: packagedManifest() },
      [`${PACKAGED_ROOT}/${PACKAGED_ENTRY}`]: {
        kind: "file",
        bytes: packagedEntryBytes,
        readFails: true,
      },
      [`${PACKAGED_ROOT}/${PACKAGED_ADDON}`]: { kind: "file", bytes: packagedAddonBytes },
    });
    await assert.rejects(
      () =>
        resolveWindowsCuaRuntime(
          win32Only({
            env: {},
            resourcesPath: PACKAGED_RESOURCES,
            arch: "x64",
            electronVersion: "99.0.0",
            fileSystem: vanishing,
          }),
        ),
      (error) => error.reason === "missing-helper-entry" && error.artifact === PACKAGED_ENTRY,
    );
  });
});
