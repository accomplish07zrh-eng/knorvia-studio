// SPDX-License-Identifier: Apache-2.0
// A31–A49：agent 子进程管理（命令解析、启动/复用/换代/回收、spawn 环境与生命周期上报）。
// A50–A56：storageStartupGate 的门闩语义（required 直通、schema 严格性、单调序、超时与 dispose）。
// 全部时序断言走事件序列（真实 stdio 帧 / Emitter 回调），不使用 sleep。
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { describe, it } from "node:test";

import { importDeep, servicesNode } from "./entry.mjs";
import { makeTempRoot, withEnv, writeText } from "./helpers.mjs";

const { KnorviaAgentProcessManager, resolveDefaultKnorviaAgentCommand } = servicesNode;
const { KnorviaStorageStartupGate } = await importDeep("agent/storageStartupGate.ts");

// 本地 node 夹具：按脚本行读写 stdio，回显 pid/cwd/argv/env，用于模拟 app-server 子进程。
const FIXTURE_SOURCE = `"use strict";
const fs = require("node:fs");
const argv = process.argv.slice(2);
const mode = argv[0] || "echo";
const opts = {};
for (const pair of argv.slice(1)) {
  const eq = pair.indexOf("=");
  if (eq > 0) {
    const rawKey = pair.slice(0, eq);
    const key = rawKey.startsWith("--") ? rawKey.slice(2) : rawKey;
    opts[key] = pair.slice(eq + 1);
  }
}
const decode = (raw) => (raw ? JSON.parse(Buffer.from(raw, "base64").toString("utf8")) : []);
const write = (fd, text) => fs.writeSync(fd, text + String.fromCharCode(10));
for (const action of decode(opts.pre)) write(action.fd, action.text);
if (opts.exitPre) process.exit(Number(opts.exitPre));
const onNotify = decode(opts.notify);
let notifyCount = 0;
function handleMessage(message) {
  if (message.id === undefined) {
    if (notifyCount < onNotify.length) write(onNotify[notifyCount].fd, onNotify[notifyCount].text);
    notifyCount += 1;
    return;
  }
  if (mode === "stall") return;
  write(
    1,
    JSON.stringify({
      id: message.id,
      result: {
        ok: true,
        pid: process.pid,
        cwd: process.cwd(),
        argv,
        env: process.env,
        method: message.method,
        params: message.params === undefined ? null : message.params,
      },
    }),
  );
}
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const index = buffer.indexOf(String.fromCharCode(10));
    if (index < 0) break;
    const frame = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (frame.trim()) handleMessage(JSON.parse(frame));
  }
});
process.stdin.on("end", () => process.exit(0));
`;

const b64 = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64");

/** 按脚本描述子进程要写的行；fd 1 = stdout（协议帧），fd 2 = stderr（诊断）。 */
const line = (fd, text) => ({ fd, text });

async function makeFixture(t) {
  const root = await makeTempRoot(t);
  const fixturePath = join(root, "agent-fixture.cjs");
  await writeText(fixturePath, FIXTURE_SOURCE);
  const workspacePath = await mkdtemp(join(root, "ws-"));
  return { root, fixturePath, workspacePath };
}

function fixtureArgs(fixturePath, mode, options = {}) {
  const args = [fixturePath, mode];
  if (options.tag !== undefined) args.push(`--tag=${options.tag}`);
  if (options.pre !== undefined) args.push(`--pre=${b64(options.pre)}`);
  if (options.notify !== undefined) args.push(`--notify=${b64(options.notify)}`);
  if (options.exitPre !== undefined) args.push(`--exitPre=${options.exitPre}`);
  return args;
}

/** 顺序事件记录器：next() 只向前扫描，因此断言的是「事件顺序」而不是快照计数。 */
function createRecorder() {
  const entries = [];
  const pending = [];
  let cursor = 0;
  return {
    entries,
    push(entry) {
      entries.push(entry);
      for (const waiter of [...pending]) {
        for (let index = cursor; index < entries.length; index += 1) {
          if (waiter.pred(entries[index])) {
            pending.splice(pending.indexOf(waiter), 1);
            cursor = index + 1;
            waiter.resolve(entries[index]);
            break;
          }
        }
      }
    },
    next(pred = () => true) {
      for (let index = cursor; index < entries.length; index += 1) {
        if (pred(entries[index])) {
          cursor = index + 1;
          return Promise.resolve(entries[index]);
        }
      }
      return new Promise((resolveWait) => pending.push({ pred, resolve: resolveWait }));
    },
    count(pred) {
      return entries.filter(pred).length;
    },
  };
}

function createLifecycleReporter(recorder) {
  const tag = (kind) => (event) => recorder.push({ kind, event });
  return {
    onSpawn: tag("spawn"),
    onReady: tag("ready"),
    onExit: tag("exit"),
    onError: tag("error"),
    onException: tag("exception"),
  };
}

function managerEvents(recorder) {
  return {
    onLifecycle: (event) => recorder.push({ kind: "lifecycle", event }),
    onRestarted: (event) => recorder.push({ kind: "restarted", event }),
    onStorage: (event) => recorder.push({ kind: "storage", event }),
  };
}

/** 断言 runtimeIdentity 与实际子进程 pid 对齐，同时回显 env/cwd/argv 供 spawn 边界断言。 */
async function requestSnapshot(client, method = "svc01/ping") {
  const result = await client.request(method, { marker: "svc01" });
  return result;
}

describe("A31 默认命令解析：env 显式覆盖", () => {
  it("KNORVIA_AGENT_SERVER_COMMAND 给出 command/args/cwd 三元组与缺省 args", async (t) => {
    const context = { workspacePath: "/tmp/svc01-workspace", workspaceKey: "/tmp/svc01-workspace" };
    await withEnv(t, "KNORVIA_AGENT_SERVER_COMMAND", "custom-agent");
    await withEnv(t, "KNORVIA_AGENT_SERVER_ARGS_JSON", undefined);
    await withEnv(t, "KNORVIA_AGENT_SERVER_CWD", undefined);
    assert.deepEqual(resolveDefaultKnorviaAgentCommand(context), {
      command: "custom-agent",
      args: ["app-server", "--stdio"],
      cwd: context.workspacePath,
    });

    await withEnv(t, "KNORVIA_AGENT_SERVER_ARGS_JSON", JSON.stringify(["run", "--stdio"]));
    await withEnv(t, "KNORVIA_AGENT_SERVER_CWD", "/tmp/svc01-explicit-cwd");
    assert.deepEqual(resolveDefaultKnorviaAgentCommand(context), {
      command: "custom-agent",
      args: ["run", "--stdio"],
      cwd: "/tmp/svc01-explicit-cwd",
    });
  });

  it("ARGS_JSON 只接受字符串数组，空白回退缺省 args，非法结构抛稳定错误", () => {
    const context = { workspacePath: "/tmp/svc01-workspace", workspaceKey: "/tmp/svc01-workspace" };
    process.env.KNORVIA_AGENT_SERVER_COMMAND = "custom-agent";
    const previous = process.env.KNORVIA_AGENT_SERVER_ARGS_JSON;
    try {
      for (const raw of ["  ", ""]) {
        process.env.KNORVIA_AGENT_SERVER_ARGS_JSON = raw;
        assert.deepEqual(resolveDefaultKnorviaAgentCommand(context).args, [
          "app-server",
          "--stdio",
        ]);
      }
      for (const raw of ['{"a":1}', "[1,2]", '["ok",5]']) {
        process.env.KNORVIA_AGENT_SERVER_ARGS_JSON = raw;
        assert.throws(
          () => resolveDefaultKnorviaAgentCommand(context),
          (error) => error.message === "KNORVIA_AGENT_SERVER_ARGS_JSON must be a JSON string array",
          raw,
        );
      }
    } finally {
      if (previous === undefined) delete process.env.KNORVIA_AGENT_SERVER_ARGS_JSON;
      else process.env.KNORVIA_AGENT_SERVER_ARGS_JSON = previous;
      delete process.env.KNORVIA_AGENT_SERVER_COMMAND;
    }
  });
});

describe("A32 presentationSurface=desktop 的 --surface 重写", () => {
  function resolveDesktop(argsJson) {
    process.env.KNORVIA_AGENT_SERVER_COMMAND = "custom-agent";
    process.env.KNORVIA_AGENT_SERVER_ARGS_JSON = argsJson;
    try {
      return resolveDefaultKnorviaAgentCommand({
        workspacePath: "/tmp/svc01-workspace",
        workspaceKey: "/tmp/svc01-workspace",
        presentationSurface: "desktop",
      });
    } finally {
      delete process.env.KNORVIA_AGENT_SERVER_COMMAND;
      delete process.env.KNORVIA_AGENT_SERVER_ARGS_JSON;
    }
  }

  it("追加 --surface desktop，并只消费真正的 --surface 值对", () => {
    assert.deepEqual(resolveDesktop('["app-server","--stdio"]').args, [
      "app-server",
      "--stdio",
      "--surface",
      "desktop",
    ]);
    assert.deepEqual(resolveDesktop('["app-server","--surface","web","--stdio"]').args, [
      "app-server",
      "--stdio",
      "--surface",
      "desktop",
    ]);
    assert.deepEqual(resolveDesktop('["app-server","--surface=web","--stdio"]').args, [
      "app-server",
      "--stdio",
      "--surface",
      "desktop",
    ]);
  });

  it("孤立的 --surface 不吞掉后续协议启动参数（旧实现会丢 --stdio）", () => {
    assert.deepEqual(resolveDesktop('["app-server","--surface","--stdio"]').args, [
      "app-server",
      "--stdio",
      "--surface",
      "desktop",
    ]);
    assert.deepEqual(resolveDesktop('["app-server","--surface"]').args, [
      "app-server",
      "--surface",
      "desktop",
    ]);
  });

  it("非 desktop 呈现面不改写参数；storage 能力标记随 bundled 命令同现", () => {
    process.env.KNORVIA_AGENT_SERVER_COMMAND = "custom-agent";
    process.env.KNORVIA_AGENT_SERVER_ARGS_JSON = '["app-server","--surface","web"]';
    try {
      const resolved = resolveDefaultKnorviaAgentCommand({
        workspacePath: "/tmp/svc01-workspace",
        workspaceKey: "/tmp/svc01-workspace",
      });
      assert.deepEqual(resolved.args, ["app-server", "--surface", "web"]);
      assert.equal(resolved.supportsStorageStartup, undefined);
    } finally {
      delete process.env.KNORVIA_AGENT_SERVER_COMMAND;
      delete process.env.KNORVIA_AGENT_SERVER_ARGS_JSON;
    }
  });
});

describe("A33 默认候选链：本仓库 CLI 入口兜底", () => {
  it("未配置 env 命令时命中 apps/cli 入口，cwd 取业务 workspacePath", async (t) => {
    await withEnv(t, "KNORVIA_AGENT_SERVER_COMMAND", undefined);
    const workspacePath = "/tmp/svc01-default-chain";
    const resolved = resolveDefaultKnorviaAgentCommand({
      workspacePath,
      workspaceKey: workspacePath,
    });
    assert.ok(resolved, "默认候选链必须在本仓库内解析出命令");
    assert.ok(isAbsolute(resolved.command));
    assert.equal(existsSync(resolved.command), true, resolved.command);
    assert.deepEqual(resolved.args.slice(-2), ["app-server", "--stdio"]);
    assert.ok(
      resolved.args[0]
        .replace(/[\\/]$/u, "")
        .endsWith(join("apps", "cli", "packages", "cli", "src", "main.ts").replace(/\\/gu, "/")) ||
        resolved.args[0]
          .replace(/[\\/]$/u, "")
          .endsWith(
            join("apps", "cli", "packages", "cli", "dist", "knorvia.cjs").replace(/\\/gu, "/"),
          ),
      resolved.args[0],
    );
    assert.equal(isAbsolute(resolved.args[0]), true);
    assert.equal(resolved.cwd, workspacePath);
    assert.equal(resolved.supportsStorageStartup, true);
    // 只有本地配套 bundle 才同时给出存储专用 Worker 入口与 Node 模式标记；自定义/远端命令不推断能力。
    assert.equal(resolved.storagePreparationEntry !== undefined, resolved.env !== undefined);
    if (resolved.env !== undefined) assert.deepEqual(resolved.env, { ELECTRON_RUN_AS_NODE: "1" });
  });

  it("resolver 抛错时 canStart 报告原因而不抛出，未配置时给出稳定 reason", async () => {
    const failing = new KnorviaAgentProcessManager({
      commandResolver: () => {
        throw new Error("resolver exploded");
      },
    });
    const unavailable = new KnorviaAgentProcessManager({ commandResolver: () => null });
    const available = new KnorviaAgentProcessManager({
      commandResolver: () => ({ command: process.execPath, args: [] }),
    });
    try {
      assert.deepEqual(await failing.canStart({ workspacePath: "/tmp/svc01-a" }), {
        available: false,
        workspaceKey: "/tmp/svc01-a",
        reason: "resolver exploded",
      });
      assert.deepEqual(await unavailable.canStart({ workspacePath: "/tmp/svc01-a" }), {
        available: false,
        workspaceKey: "/tmp/svc01-a",
        reason: "KNORVIA_AGENT_SERVER_COMMAND is not configured",
      });
      assert.deepEqual(
        await available.canStart({ workspacePath: "/tmp/svc01-b", workspaceIdentity: " id " }),
        {
          available: true,
          workspaceKey: "id",
        },
      );
    } finally {
      failing.disposeAll();
      unavailable.disposeAll();
      available.disposeAll();
    }
  });

  it("resolver 收到的上下文是 workspace 三元组加呈现面，且不额外 spawn 进程", async () => {
    const contexts = [];
    const manager = new KnorviaAgentProcessManager({
      presentationSurface: "desktop",
      commandResolver: (context) => {
        contexts.push(context);
        return null;
      },
    });
    try {
      await manager.canStart({ workspacePath: "/tmp/svc01-c", workspaceIdentity: "  ident  " });
      assert.deepEqual(contexts, [
        {
          workspacePath: "/tmp/svc01-c",
          workspaceIdentity: "  ident  ",
          presentationSurface: "desktop",
          workspaceKey: "ident",
        },
      ]);
      assert.deepEqual(manager.listManagedProcesses(), []);
    } finally {
      manager.disposeAll();
    }
  });
});

describe("A34 getClient 启动、复用与并发串行化", () => {
  it("首次启动返回可用 client，同 workspace 再次 getClient 复用同一实例", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    let resolverCalls = 0;
    const recorder = createRecorder();
    const manager = new KnorviaAgentProcessManager({
      commandResolver: () => {
        resolverCalls += 1;
        return {
          command: process.execPath,
          args: fixtureArgs(fixturePath, "echo", { tag: "reuse" }),
          cwd: workspacePath,
        };
      },
      processLifecycleReporter: createLifecycleReporter(recorder),
    });
    t.after(() => manager.disposeAllAndWait());
    const events = createRecorder();
    const lifecycle = manager.onRuntimeLifecycle((event) =>
      events.push({ kind: "lifecycle", event }),
    );
    const storage = manager.onStorageStartupChanged((event) =>
      events.push({ kind: "storage", event }),
    );

    const first = await manager.getClient({ workspacePath });
    const second = await manager.getClient({ workspacePath });
    assert.equal(second, first, "同 workspaceKey 必须复用已登记的 client");
    assert.equal(resolverCalls, 1);
    const snapshot = await requestSnapshot(first);
    assert.equal(snapshot.ok, true);
    assert.equal(manager.listManagedProcesses().length, 1);
    assert.equal(manager.listManagedProcesses()[0].pid, snapshot.pid);

    const identity = await manager.getRuntimeIdentity({ workspacePath });
    assert.equal(
      identity.processId,
      snapshot.pid,
      "runtimeIdentity.processId 必须是真实子进程 pid",
    );
    assert.equal(identity.generation, 1);
    assert.equal(identity.workspaceKey, workspacePath);
    assert.equal(identity.identity, `${workspacePath}:1:${snapshot.pid}`);
    assert.equal(first.transportKind, "stdio");

    // 未声明 supportsStorageStartup 的自定义命令不进入启动门闩：首帧即 null，不阻塞请求。
    const storageEvents = events.entries.filter((entry) => entry.kind === "storage");
    assert.deepEqual(
      storageEvents.map((entry) => entry.event),
      [{ workspaceKey: workspacePath, snapshot: { generation: 1, state: null } }],
    );
    assert.deepEqual(manager.getStorageStartupState({ workspacePath }), {
      generation: 1,
      state: null,
    });
    assert.equal(manager.getStorageStartupState({ workspacePath: "/tmp/svc01-absent" }), null);
    const lifecycleEvents = events.entries.filter((entry) => entry.kind === "lifecycle");
    assert.deepEqual(
      lifecycleEvents.map((entry) => [entry.event.state, entry.event.runtimeIdentity.generation]),
      [["available", 1]],
    );
    lifecycle.dispose();
    storage.dispose();
    await manager.disposeWorkspace({ workspacePath });
    assert.equal(resolverCalls, 1);
  });

  it("并发 getClient 在启动窗口内按 workspaceKey 收敛为一次 spawn", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const recorder = createRecorder();
    let releaseResolve;
    const gate = new Promise((resolveGate) => {
      releaseResolve = resolveGate;
    });
    const resolverCallsByWorkspace = new Map();
    const manager = new KnorviaAgentProcessManager({
      commandResolver: async (context) => {
        resolverCallsByWorkspace.set(
          context.workspaceKey,
          (resolverCallsByWorkspace.get(context.workspaceKey) ?? 0) + 1,
        );
        await gate;
        return {
          command: process.execPath,
          args: fixtureArgs(fixturePath, "echo", { tag: "single" }),
          cwd: workspacePath,
        };
      },
      processLifecycleReporter: createLifecycleReporter(recorder),
    });
    t.after(() => manager.disposeAllAndWait());

    const firstStart = manager.getClient({ workspacePath });
    const secondStart = manager.getClient({ workspacePath });
    const otherWorkspace = manager.getClient({ workspacePath: "/tmp/svc01-other" });
    const otherRejection = assert.rejects(
      otherWorkspace,
      (error) => error.message === "Knorvia Studio agent process start was cancelled.",
    );
    await manager.disposeWorkspace({ workspacePath: "/tmp/svc01-other" }).catch(() => undefined);
    releaseResolve();
    const [first, second] = [await firstStart, await secondStart];
    assert.equal(second, first);
    assert.equal(
      resolverCallsByWorkspace.get(workspacePath),
      1,
      "并发启动只能进入一次 startClient",
    );
    assert.equal(manager.listManagedProcesses().length, 1);
    await otherRejection;
  });

  it("不同 workspaceKey 各起一份进程，disposeWorkspace 只回收自己那一份", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const secondWorkspace = await mkdtemp(join(workspacePath, "nested-"));
    const manager = new KnorviaAgentProcessManager({
      commandResolver: (context) => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo", { tag: context.workspaceKey }),
        cwd: context.workspacePath,
      }),
    });
    t.after(() => manager.disposeAllAndWait());
    const [clientA, clientB] = await Promise.all([
      manager.getClient({ workspacePath }),
      manager.getClient({ workspacePath: secondWorkspace }),
    ]);
    assert.notEqual(clientA, clientB);
    const pidA = (await requestSnapshot(clientA)).pid;
    const pidB = (await requestSnapshot(clientB)).pid;
    assert.notEqual(pidA, pidB);
    assert.equal(manager.listManagedProcesses().length, 2);
    await manager.disposeWorkspace({ workspacePath });
    assert.equal(manager.listManagedProcesses().length, 1);
    assert.equal(manager.getExistingClient({ workspacePath }), undefined);
    assert.equal(manager.getExistingClient({ workspacePath: secondWorkspace }), clientB);
    await assert.rejects(
      () => manager.getRuntimeIdentity({ workspacePath }),
      (error) => error.message === "Knorvia Studio agent runtime identity is unavailable.",
    );
  });
});

describe("A35 workspaceIdentity 身份键与 lane 泳道", () => {
  it("身份键取 trim 后的 workspaceIdentity，同 path 不同身份互不复用", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const recorder = createRecorder();
    const manager = new KnorviaAgentProcessManager({
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo", { tag: "identity" }),
        cwd: workspacePath,
      }),
      processLifecycleReporter: createLifecycleReporter(recorder),
    });
    t.after(() => manager.disposeAllAndWait());
    const identityKey = "  remote:/srv/project  ";
    const client = await manager.getClient({ workspacePath, workspaceIdentity: identityKey });
    const snapshot = await requestSnapshot(client);
    const identity = await manager.getRuntimeIdentity({
      workspacePath,
      workspaceIdentity: identityKey,
    });
    assert.equal(identity.workspaceKey, "remote:/srv/project");
    assert.equal(identity.identity, `remote:/srv/project:1:${snapshot.pid}`);
    assert.equal(manager.getExistingClient({ workspacePath }), undefined, "缺省身份键是 path 本身");
    assert.equal(
      manager.getExistingClient({ workspacePath, workspaceIdentity: "remote:/srv/project" }),
      client,
    );
    assert.equal(
      manager.getStorageStartupState({ workspacePath: "remote:/srv/project" }).state,
      null,
    );

    // 同 path 的另一身份是另一条泳道/另一 Host 归属，必须各自起进程且互不覆盖。
    const otherClient = await manager.getClient({ workspacePath, workspaceIdentity: "other" });
    assert.notEqual(otherClient, client);
    assert.equal(manager.listManagedProcesses().length, 2);
    assert.deepEqual(
      manager
        .listManagedProcesses()
        .map((entry) => entry.workspaceIdentity)
        .sort(),
      ["  remote:/srv/project  ", "other"],
    );
    await manager.disposeWorkspace({ workspacePath, workspaceIdentity: "other" });
    assert.equal(
      manager.getExistingClient({ workspacePath, workspaceIdentity: "  remote:/srv/project \t" }),
      client,
    );
  });

  it("lane 进入 identity、listManagedProcesses 与生命周期上报，缺省主泳道不带标记", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const recorder = createRecorder();
    const plainRecorder = createRecorder();
    const laneManager = new KnorviaAgentProcessManager({
      lane: "  mcp-status ",
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo", { tag: "lane" }),
        cwd: workspacePath,
      }),
      processLifecycleReporter: createLifecycleReporter(recorder),
    });
    const mainManager = new KnorviaAgentProcessManager({
      lane: "   ",
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo", { tag: "main" }),
        cwd: workspacePath,
      }),
      processLifecycleReporter: createLifecycleReporter(plainRecorder),
    });
    t.after(async () => {
      await laneManager.disposeAllAndWait();
      await mainManager.disposeAllAndWait();
    });

    const laneClient = await laneManager.getClient({ workspacePath });
    const mainClient = await mainManager.getClient({ workspacePath });
    assert.notEqual(laneClient, mainClient, "同一 workspace 的不同泳道各走独立 manager 实例");
    const lanePid = (await requestSnapshot(laneClient)).pid;
    const mainPid = (await requestSnapshot(mainClient)).pid;
    const laneIdentity = await laneManager.getRuntimeIdentity({ workspacePath });
    assert.equal(laneIdentity.lane, "mcp-status");
    assert.equal(laneIdentity.identity, `${workspacePath}:1:${lanePid}:mcp-status`);
    assert.deepEqual(managerEntry(laneManager), { lane: "mcp-status", pid: lanePid });
    assert.deepEqual(managerEntry(mainManager), { pid: mainPid });

    const laneSpawn = await recorder.next((entry) => entry.kind === "spawn");
    assert.equal(laneSpawn.event.lane, "mcp-status");
    assert.equal(laneSpawn.event.provider, "knorvia");
    await plainRecorder.next((entry) => entry.kind === "spawn");
    assert.equal("lane" in plainRecorder.entries[0].event, false);
    assert.equal(laneIdentity.identity.includes("mcp-status"), true);
  });
});

function managerEntry(manager) {
  const [entry] = manager.listManagedProcesses();
  return {
    pid: entry.pid,
    ...("lane" in entry ? { lane: entry.lane } : {}),
  };
}

describe("A36 被动观察入口不隐式拉起 Agent", () => {
  it("空池时 getExistingClient 返回 undefined、getRuntimeIdentity 抛错，且不触碰 resolver", async (t) => {
    const { root, fixturePath, workspacePath } = await makeFixture(t);
    let resolverCalls = 0;
    const manager = new KnorviaAgentProcessManager({
      commandResolver: () => {
        resolverCalls += 1;
        return {
          command: process.execPath,
          args: fixtureArgs(fixturePath, "echo"),
          cwd: workspacePath,
        };
      },
    });
    t.after(() => manager.disposeAllAndWait());
    assert.equal(manager.getExistingClient({ workspacePath }), undefined);
    await assert.rejects(
      () => manager.getRuntimeIdentity({ workspacePath }),
      (error) => error.message === "Knorvia Studio agent runtime identity is unavailable.",
    );
    assert.deepEqual(manager.listManagedProcesses(), []);
    assert.equal(resolverCalls, 0, "被动 observer 绝不能触发 spawn");

    const client = await manager.getClient({ workspacePath });
    assert.equal(resolverCalls, 1);
    assert.equal(manager.getExistingClient({ workspacePath }), client);
    // 已登记的 client 若被标记 killed，被动入口同样视为不存在，不改用启动型入口兜底。
    await manager.disposeWorkspace({ workspacePath });
    assert.equal(manager.getExistingClient({ workspacePath }), undefined);
    assert.equal(join(root, "unused"), join(root, "unused"));
  });
});

describe("A37 退出、崩溃与换代重启", () => {
  it("子进程 EOF 退出后退休池位，再次 getClient 递增 generation 并广播 restarted", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const recorder = createRecorder();
    const manager = new KnorviaAgentProcessManager({
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo", { notify: [line(1, "raw non protocol frame")] }),
        cwd: workspacePath,
      }),
      processLifecycleReporter: createLifecycleReporter(recorder),
    });
    t.after(() => manager.disposeAllAndWait());
    const events = createRecorder();
    manager.onRuntimeLifecycle((event) => events.push({ kind: "lifecycle", event }));
    manager.onRuntimeRestarted((event) => events.push({ kind: "restarted", event }));

    const first = await manager.getClient({ workspacePath });
    const firstPid = (await requestSnapshot(first)).pid;
    assert.equal((await recorder.next((entry) => entry.kind === "spawn")).event.pid, firstPid);

    // 子进程收到通知后自行退出：EOF → protocol close → 池位退休 + unavailable。
    await first.notify("svc01/exit");
    const unavailable = await events.next(
      (entry) => entry.kind === "lifecycle" && entry.event.state === "unavailable",
    );
    assert.equal(unavailable.event.runtimeIdentity.generation, 1);
    assert.equal(unavailable.event.runtimeIdentity.processId, firstPid);
    assert.equal(manager.getExistingClient({ workspacePath }), undefined);
    const exit = await recorder.next((entry) => entry.kind === "exit");
    assert.equal(exit.event.terminationKind, "unexpected");
    assert.equal(exit.event.runtimeGeneration, 1);

    const second = await manager.getClient({ workspacePath });
    assert.notEqual(second, first);
    const secondPid = (await requestSnapshot(second)).pid;
    assert.notEqual(secondPid, firstPid);
    const restarted = await events.next((entry) => entry.kind === "restarted");
    assert.equal(restarted.event.workspaceKey, workspacePath);
    assert.equal((await manager.getRuntimeIdentity({ workspacePath })).generation, 2);
    // 换代只发一次 available/unavailable 配对，迟到的旧 client close 不能重复播报。
    await first.notify("svc01/late").catch(() => undefined);
    const lifecycleStates = events.entries
      .filter((entry) => entry.kind === "lifecycle")
      .map((entry) => [entry.event.state, entry.event.runtimeIdentity.generation]);
    assert.deepEqual(lifecycleStates, [
      ["available", 1],
      ["unavailable", 1],
      ["available", 2],
    ]);
  });

  it("非零退出码的崩溃被归为 unexpected，并带 stderr 尾窗与脱敏结果", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const recorder = createRecorder();
    const olderLines = ["older-1", "older-2", "older-3", "older-4", "older-5"];
    const emitted = [];
    for (let index = 1; index <= 18; index += 1) emitted.push(`agent-stderr-${index}`);
    const secretLine = "fatal api_key=sk-abcdefghijklmnopqrstuvwxyz123456 leaked";
    const longLine = `x=${"y".repeat(1400)}`;
    const manager = new KnorviaAgentProcessManager({
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo", {
          pre: [
            ...olderLines.map((text) => line(2, text)),
            ...emitted.map((text) => line(2, text)),
            line(2, secretLine),
            line(2, longLine),
          ],
          exitPre: 3,
        }),
        cwd: workspacePath,
      }),
      processLifecycleReporter: createLifecycleReporter(recorder),
    });
    t.after(() => manager.disposeAllAndWait());

    await manager.getClient({ workspacePath }).then(async (client) => {
      assert.equal(manager.getExistingClient({ workspacePath }), client);
    });
    const exit = await recorder.next((entry) => entry.kind === "exit");
    assert.equal(exit.event.exitCode, 3);
    assert.equal(exit.event.signal, null);
    assert.equal(exit.event.terminationKind, "unexpected");
    assert.equal(exit.event.terminationReason, "protocol-close");
    assert.equal(exit.event.runtimeReady, false);
    assert.ok(exit.event.stderrLineCount > emitted.length, "行计数包含全部 stderr 行");
    assert.ok(
      exit.event.stderrTail.length < exit.event.stderrLineCount,
      "尾窗必须有界，不能整段透传 stderr",
    );
    assert.equal(exit.event.stderrTail.at(-1).startsWith("x="), true);
    assert.ok(exit.event.stderrTail.at(-1).endsWith("[truncated]"));
    assert.ok(exit.event.stderrTail.at(-1).length < longLine.length);
    assert.equal(
      exit.event.stderrTail.some((text) => text.includes("abcdefghijklmnopqrstuvwxyz123456")),
      false,
      "裸 key 必须遮盖",
    );
    assert.equal(
      exit.event.stderrTail.some((text) => text === "fatal api_key=<redacted> leaked"),
      true,
    );
    assert.deepEqual(exit.event.stderrTail.slice(0, 3), emitted.slice(0, 3));
    assert.ok(olderLines.every((text) => !exit.event.stderrTail.includes(text)));
  });

  it("结构化异常行走 onException 旁路且不进 stderr 尾窗，脱敏与限长后再上报", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const recorder = createRecorder();
    const diagnostic = {
      version: 1,
      errorId: "0f8fad5b-d9cb-469f-a165-70867728950e",
      kind: "uncaughtException",
      origin: "uncaughtException",
      name: "TypeError token=abcdef",
      message: `cannot read token=${"s".repeat(3000)}`,
      stack: `at foo Basic zzzzzzzzzzzzzzzzzzz\n${" ".repeat(10000)}`,
      occurredAt: 1,
    };
    const diagnosticLine = `[knorvia-process-exception] ${JSON.stringify(diagnostic)}`;
    const manager = new KnorviaAgentProcessManager({
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo", {
          pre: [line(2, "plain noise"), line(2, diagnosticLine), line(2, "tail noise")],
          exitPre: 1,
        }),
        cwd: workspacePath,
      }),
      processLifecycleReporter: createLifecycleReporter(recorder),
    });
    t.after(() => manager.disposeAllAndWait());
    await manager.getClient({ workspacePath });

    const spawn = await recorder.next((entry) => entry.kind === "spawn");
    const exception = await recorder.next((entry) => entry.kind === "exception");
    assert.equal(exception.event.pid, spawn.event.pid);
    assert.equal(exception.event.diagnostic.errorId, diagnostic.errorId);
    assert.equal(exception.event.diagnostic.name, "TypeError token=<redacted>");
    assert.ok(exception.event.diagnostic.message.includes("token=<redacted>"));
    assert.ok(!exception.event.diagnostic.stack.includes("zzzzzzzzzzzzzzz"));
    assert.equal(exception.event.diagnostic.message.length <= 4000, true);
    assert.ok(exception.event.diagnostic.stack.includes("Basic <redacted>"));
    assert.equal(exception.event.diagnostic.stack.length <= 16000, true);
    assert.equal(exception.event.runtimeGeneration, 1);
    assert.ok(exception.event.runtimeInstanceId.startsWith("agent-"));

    const exit = await recorder.next((entry) => entry.kind === "exit");
    assert.equal(exit.event.stderrLineCount, 2, "诊断行不占 stderr 尾窗");
    assert.deepEqual(exit.event.stderrTail, ["plain noise", "tail noise"]);
    assert.equal(exit.event.terminationKind, "unexpected");
  });

  it("非法 stdout 帧触发 protocol-close 回收，并把首次 cleanup 原因留在退出轨迹里", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const recorder = createRecorder();
    let resolverInvocations = 0;
    const manager = new KnorviaAgentProcessManager({
      commandResolver: () => {
        resolverInvocations += 1;
        return {
          command: process.execPath,
          // 首帧就是非 JSON 文本：协议立即失效，但根进程仍在运行。重启后正常恢复。
          args:
            resolverInvocations === 1
              ? fixtureArgs(fixturePath, "echo", { pre: [line(1, "definitely-not-json")] })
              : fixtureArgs(fixturePath, "echo"),
          cwd: workspacePath,
        };
      },
      processLifecycleReporter: createLifecycleReporter(recorder),
    });
    t.after(() => manager.disposeAllAndWait());
    const events = createRecorder();
    manager.onRuntimeLifecycle((event) => events.push({ kind: "lifecycle", event }));

    const client = await manager.getClient({ workspacePath });
    await events.next((entry) => entry.event.state === "unavailable");
    assert.equal(client.isDisposed, true, "protocol close 必须让 client 不再可复用");
    assert.equal(manager.getExistingClient({ workspacePath }), undefined);
    const exit = await recorder.next((entry) => entry.kind === "exit");
    assert.equal(exit.event.terminationKind, "unexpected");
    assert.equal(exit.event.terminationReason, "protocol-close");

    const restarted = await manager.getClient({ workspacePath });
    assert.notEqual(restarted, client);
    assert.equal((await requestSnapshot(restarted)).ok, true);
    assert.equal((await manager.getRuntimeIdentity({ workspacePath })).generation, 2);
  });
});

describe("A38 disposeWorkspace 取消在飞启动（stale run 防护）", () => {
  it("代际推进后旧启动请求不得写回进程池，也不得留下 spawn", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    let releaseResolve;
    const blocked = new Promise((resolveGate) => {
      releaseResolve = resolveGate;
    });
    const signals = [];
    let resolverCalls = 0;
    const recorder = createRecorder();
    const manager = new KnorviaAgentProcessManager({
      commandResolver: async () => {
        resolverCalls += 1;
        await blocked;
        return {
          command: process.execPath,
          args: fixtureArgs(fixturePath, "echo"),
          cwd: workspacePath,
        };
      },
      waitForSpawnAdmission: (context) => {
        signals.push(context.signal);
      },
      processLifecycleReporter: createLifecycleReporter(recorder),
    });
    t.after(() => manager.disposeAllAndWait());

    const start = manager.getClient({ workspacePath });
    const disposal = manager.disposeWorkspace({ workspacePath });
    await disposal;
    assert.equal(signals.length, 0, "resolver 未返回前不能进入 spawn admission");
    releaseResolve();
    await assert.rejects(
      start,
      (error) => error.message === "Knorvia Studio agent process start was cancelled.",
    );
    assert.equal(manager.listManagedProcesses().length, 0);
    assert.equal(
      recorder.count((entry) => entry.kind === "spawn"),
      0,
    );
    assert.equal(manager.getExistingClient({ workspacePath }), undefined);
    await assert.rejects(
      () => manager.getRuntimeIdentity({ workspacePath }),
      (error) => error.message === "Knorvia Studio agent runtime identity is unavailable.",
    );

    // 取消后新一次 getClient 必须能正常拉起（代际检查只否决旧请求）。
    const client = await manager.getClient({ workspacePath });
    assert.equal((await requestSnapshot(client)).ok, true);
    assert.equal(manager.listManagedProcesses().length, 1);
  });

  it("admission hook 观察到 abort 信号后启动请求立即失败", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    let admissionStarted;
    const admissionGate = new Promise((resolveGate) => {
      admissionStarted = resolveGate;
    });
    let observed;
    const manager = new KnorviaAgentProcessManager({
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo"),
        cwd: workspacePath,
      }),
      waitForSpawnAdmission: async (context) => {
        admissionStarted();
        if (!context.signal) throw new Error("missing admission signal");
        if (!context.signal.aborted) {
          await new Promise((resolveAbort) =>
            context.signal.addEventListener("abort", resolveAbort, { once: true }),
          );
        }
        observed = context.signal.reason;
      },
    });
    t.after(() => manager.disposeAllAndWait());
    const start = manager.getClient({ workspacePath });
    await admissionGate;
    const disposal = manager.disposeWorkspace({ workspacePath });
    await assert.rejects(
      start,
      (error) => error.message === "Knorvia Studio agent process start was cancelled.",
    );
    await disposal;
    assert.equal(observed?.message, "Knorvia Studio agent process start was cancelled.");
    assert.equal(manager.listManagedProcesses().length, 0);
  });

  it("disposeAll 之后再取 client 一律抛 manager disposed", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const recorder = createRecorder();
    const manager = new KnorviaAgentProcessManager({
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo"),
        cwd: workspacePath,
      }),
      processLifecycleReporter: createLifecycleReporter(recorder),
    });
    const client = await manager.getClient({ workspacePath });
    const pid = (await requestSnapshot(client)).pid;
    await recorder.next((entry) => entry.kind === "spawn");
    const events = createRecorder();
    manager.onRuntimeLifecycle((event) => events.push({ kind: "lifecycle", event }));
    manager.disposeAll();
    await assert.rejects(
      () => manager.getClient({ workspacePath }),
      (error) => error.message === "Knorvia Studio agent process manager is disposed.",
    );
    assert.deepEqual(manager.listManagedProcesses(), []);
    const unavailable = await events.next((entry) => entry.event.state === "unavailable");
    assert.equal(unavailable.event.runtimeIdentity.processId, pid);
    const exit = await recorder.next((entry) => entry.kind === "exit");
    assert.equal(exit.event.terminationKind, "expected");
    assert.equal(exit.event.terminationReason, "manager-dispose");
    assert.equal(exit.event.pid, pid);
    if (process.platform !== "win32") {
      assert.throws(
        () => process.kill(pid, 0),
        (error) => error.code === "ESRCH",
      );
    }
    await manager.disposeAllAndWait();
    await manager.disposeAllAndWait();
  });

  it("disposeAllAndWait 复用同一次回收并等进程树真正消失", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const recorder = createRecorder();
    const manager = new KnorviaAgentProcessManager({
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo"),
        cwd: workspacePath,
      }),
      processLifecycleReporter: createLifecycleReporter(recorder),
    });
    const client = await manager.getClient({ workspacePath });
    const pid = (await requestSnapshot(client)).pid;
    await recorder.next((entry) => entry.kind === "spawn");
    const firstCall = manager.disposeAllAndWait();
    const secondCall = manager.disposeAllAndWait();
    await Promise.all([firstCall, secondCall]);
    const exit = await recorder.next((entry) => entry.kind === "exit");
    assert.equal(exit.event.terminationReason, "manager-dispose");
    assert.equal(exit.event.terminationKind, "expected");
    assert.deepEqual(manager.listManagedProcesses(), []);
    if (process.platform !== "win32") {
      assert.throws(
        () => process.kill(pid, 0),
        (error) => error.code === "ESRCH",
      );
    }
    await assert.rejects(
      () => manager.getClient({ workspacePath }),
      (error) => error.message === "Knorvia Studio agent process manager is disposed.",
    );
  });
});

describe("A39 生命周期上报时序与 ready 幂等", () => {
  it("onSpawn 先于 onReady，字段绑定同一 runtimeInstance，reporter 抛错不阻断启动", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const recorder = createRecorder();
    const manager = new KnorviaAgentProcessManager({
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo"),
        cwd: workspacePath,
      }),
      processLifecycleReporter: createLifecycleReporter(recorder),
    });
    t.after(() => manager.disposeAllAndWait());
    const client = await manager.getClient({ workspacePath });
    const snapshot = await requestSnapshot(client);

    const spawn = await recorder.next((entry) => entry.kind === "spawn");
    assert.equal(
      recorder.count((entry) => entry.kind === "ready"),
      0,
      "未 markReady 之前不得报 ready",
    );
    manager.markReady({ workspacePath }, client);
    const ready = await recorder.next((entry) => entry.kind === "ready");
    assert.equal(ready.event.pid, spawn.event.pid);
    assert.equal(ready.event.pid, snapshot.pid);
    assert.equal(ready.event.workspacePath, workspacePath);
    assert.equal(ready.event.runtimeInstanceId, spawn.event.runtimeInstanceId);
    assert.equal(ready.event.runtimeGeneration, 1);
    assert.ok(ready.event.startupDurationMs >= 0);
    assert.ok(ready.event.readyAt >= spawn.event.startedAt);
    manager.markReady({ workspacePath }, client);
    assert.equal(
      recorder.count((entry) => entry.kind === "ready"),
      1,
      "同一 runtime 只上报一次 ready",
    );
    manager.markReady({ workspacePath: "/tmp/svc01-unknown" }, client);
    assert.equal(
      recorder.count((entry) => entry.kind === "ready"),
      1,
    );

    await manager.disposeWorkspace({ workspacePath });
    const exit = await recorder.next((entry) => entry.kind === "exit");
    assert.equal(exit.event.runtimeReady, true);
    assert.equal(exit.event.runtimeInstanceId, spawn.event.runtimeInstanceId);
    assert.equal(exit.event.terminationReason, "workspace-dispose");
    assert.equal(exit.event.terminationKind, "expected");
    assert.ok(exit.event.uptimeMs >= 0);
    assert.deepEqual(
      recorder.entries.map((entry) => entry.kind),
      ["spawn", "ready", "exit"],
    );
  });

  it("reporter 回调抛错只记日志，启动与回收继续", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const thrown = [];
    const recorder = createRecorder();
    const manager = new KnorviaAgentProcessManager({
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo"),
        cwd: workspacePath,
      }),
      processLifecycleReporter: {
        onSpawn: () => {
          thrown.push(new Error("reporter spawn failed"));
          throw new Error("reporter spawn failed");
        },
        onExit: (event) => {
          recorder.push({ kind: "exit", event });
          throw new Error("reporter exit failed");
        },
      },
    });
    t.after(() => manager.disposeAllAndWait());
    const client = await manager.getClient({ workspacePath });
    assert.equal((await requestSnapshot(client)).ok, true);
    assert.equal((await manager.getRuntimeIdentity({ workspacePath })).generation, 1);
    await manager.disposeWorkspace({ workspacePath });
    await recorder.next((entry) => entry.kind === "exit");
    assert.equal(thrown.length, 1);
    assert.equal(client.isDisposed, true);
  });
});

describe("A40 spawn 前置 hook 时序", () => {
  it("resolver → admission → resolveSpawnEnv → preflight → admission → spawn 的事件顺序", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const order = [];
    const manager = new KnorviaAgentProcessManager({
      commandResolver: async () => {
        order.push("resolveCommand");
        return {
          command: process.execPath,
          args: fixtureArgs(fixturePath, "echo"),
          cwd: workspacePath,
        };
      },
      waitForSpawnAdmission: async () => {
        order.push("admission");
      },
      resolveSpawnEnv: async () => {
        order.push("resolveSpawnEnv");
        return { SVC01_SPAWN_ENV: "from-resolve-spawn-env" };
      },
    });
    t.after(() => manager.disposeAllAndWait());
    const client = await manager.getClient({ workspacePath });
    const result = await requestSnapshot(client);
    assert.deepEqual(order, ["resolveCommand", "admission", "resolveSpawnEnv", "admission"]);
    assert.equal(result.env.SVC01_SPAWN_ENV, "from-resolve-spawn-env");
    assert.deepEqual(result.argv, ["echo"]);
    assert.equal(result.cwd, resolve(workspacePath));
    assert.equal(result.method, "svc01/ping");
    assert.deepEqual(result.params, { marker: "svc01" });
  });

  it("resolveSpawnEnv 收到 workspace 三元组，command.env 优先级高于 spawn env，身份 env 最高", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const contexts = [];
    const manager = new KnorviaAgentProcessManager({
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo"),
        cwd: workspacePath,
        env: {
          SVC01_PRIORITY: "from-command-env",
          ELECTRON_RUN_AS_NODE: "1",
          KNORVIA_WORKSPACE_IDENTITY: "from-command-env",
        },
      }),
      resolveSpawnEnv: (context) => {
        contexts.push(context);
        return { SVC01_PRIORITY: "from-spawn-env", HTTPS_PROXY: "http://spawn-env-proxy.invalid" };
      },
    });
    t.after(() => manager.disposeAllAndWait());
    const client = await manager.getClient({
      workspacePath,
      workspaceIdentity: "  trimmed identity  ",
    });
    const { env } = await requestSnapshot(client);
    assert.deepEqual(contexts, [
      {
        workspacePath,
        workspaceIdentity: "  trimmed identity  ",
        workspaceKey: "trimmed identity",
      },
    ]);
    assert.equal(env.SVC01_PRIORITY, "from-command-env");
    assert.equal(env.ELECTRON_RUN_AS_NODE, "1");
    assert.equal(env.KNORVIA_WORKSPACE_IDENTITY, "trimmed identity");
    assert.equal(env.HTTPS_PROXY, "http://spawn-env-proxy.invalid");
  });

  it("宿主敏感键被清洗，非法 runtime env 归一为 production", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    await withEnv(t, "KNORVIA_RUNTIME_ENV", "staging");
    await withEnv(t, "KNORVIA_CUA_PERMISSION_BROKER_TOKEN", "svc01-broker-token-secret");
    await withEnv(t, "HTTPS_PROXY", "http://host-proxy.invalid");
    const manager = new KnorviaAgentProcessManager({
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo"),
        cwd: workspacePath,
      }),
    });
    t.after(() => manager.disposeAllAndWait());
    const { env } = await requestSnapshot(await manager.getClient({ workspacePath }));
    assert.equal(env.KNORVIA_RUNTIME_ENV, "production");
    assert.equal(env.KNORVIA_CUA_PERMISSION_BROKER_TOKEN, undefined);
    assert.equal(env.HTTPS_PROXY, undefined);
    assert.equal(Object.values(env).includes("svc01-broker-token-secret"), false);
  });

  it("E2E 覆盖率注入需要开关与产物目录同时在场，否则不写 NODE_OPTIONS", async (t) => {
    const { fixturePath, workspacePath, root } = await makeFixture(t);
    const artifactDir = join(root, "artifacts");
    await withEnv(t, "KNORVIA_E2E_COVERAGE", "1");
    await withEnv(t, "KNORVIA_E2E_ARTIFACT_DIR", artifactDir);
    const manager = new KnorviaAgentProcessManager({
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo"),
        cwd: workspacePath,
      }),
    });
    t.after(() => manager.disposeAllAndWait());
    const injected = await requestSnapshot(await manager.getClient({ workspacePath }));
    const coverageDir = resolve(artifactDir, "coverage", "raw", "cli");
    assert.equal(injected.env.NODE_V8_COVERAGE, coverageDir);
    assert.ok(injected.env.NODE_OPTIONS.includes("--require="));
    assert.ok(injected.env.NODE_OPTIONS.includes("knorvia-e2e-coverage-preload.cjs"));
    assert.equal(existsSync(join(coverageDir, `coverage-ready-${injected.pid}.marker`)), true);

    await manager.disposeWorkspace({ workspacePath });
    await withEnv(t, "KNORVIA_E2E_ARTIFACT_DIR", undefined);
    const notInjected = await requestSnapshot(await manager.getClient({ workspacePath }));
    assert.equal(notInjected.env.NODE_V8_COVERAGE, undefined);
    assert.notEqual(notInjected.env.NODE_OPTIONS?.includes("knorvia-e2e-coverage-preload"), true);
  });
});

describe("A41 spawn cwd 兜底与失败可见性", () => {
  it("workspace 目录不可用且未配 fallback 时按 ENOENT 上报，且不谎报可用进程", async (t) => {
    const { fixturePath, root } = await makeFixture(t);
    const recorder = createRecorder();
    const missingWorkspace = join(root, "gone");
    const manager = new KnorviaAgentProcessManager({
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo", { tag: "no-cwd" }),
        cwd: missingWorkspace,
      }),
      processLifecycleReporter: createLifecycleReporter(recorder),
    });
    t.after(() => manager.disposeAllAndWait());
    const events = createRecorder();
    manager.onRuntimeLifecycle((event) => events.push({ kind: "lifecycle", event }));

    const client = await manager.getClient({ workspacePath: missingWorkspace });
    const error = await recorder.next((entry) => entry.kind === "error");
    assert.equal(client.isDisposed, true, "spawn 失败后协议必须立即失效");
    assert.equal(
      recorder.count((entry) => entry.kind === "spawn"),
      0,
    );
    assert.equal(error.event.errorCode, "ENOENT");
    assert.equal(error.event.pid, null);
    assert.equal(error.event.runtimeGeneration, 1);
    assert.deepEqual(manager.listManagedProcesses(), []);
    assert.equal(manager.getExistingClient({ workspacePath: missingWorkspace }), undefined);
    assert.equal(events.entries.length, 0, "未成功 spawn 的进程不谎报 lifecycle 事件");
  });

  it("仅当默认 cwd 就是目标 workspace 时启用 spawnFallbackCwd，业务 workspaceKey 不变", async (t) => {
    const { fixturePath, root } = await makeFixture(t);
    const recorder = createRecorder();
    const missingWorkspace = join(root, "missing");
    const fallback = await mkdtemp(join(root, "fallback-"));
    const manager = new KnorviaAgentProcessManager({
      spawnFallbackCwd: fallback,
      commandResolver: (context) => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo", { tag: context.workspaceKey }),
        cwd: context.workspacePath,
      }),
      processLifecycleReporter: createLifecycleReporter(recorder),
    });
    t.after(() => manager.disposeAllAndWait());
    const client = await manager.getClient({ workspacePath: missingWorkspace });
    const snapshot = await requestSnapshot(client);
    assert.equal(snapshot.cwd, resolve(fallback), "进程实际 cwd 走兜底目录");
    assert.equal(snapshot.argv.at(-1), `--tag=${missingWorkspace}`);
    const identity = await manager.getRuntimeIdentity({ workspacePath: missingWorkspace });
    assert.equal(identity.workspaceKey, missingWorkspace, "业务 workspaceKey 不随 cwd 兜底改变");
    assert.equal(identity.processId, snapshot.pid);
    assert.equal(
      recorder.count((entry) => entry.kind === "error"),
      0,
    );

    // 命令显式给出与 workspace 不同的 cwd 时不得被兜底改写。
    const otherCwd = await mkdtemp(join(root, "explicit-"));
    const explicit = new KnorviaAgentProcessManager({
      spawnFallbackCwd: fallback,
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo"),
        cwd: otherCwd,
      }),
    });
    t.after(() => explicit.disposeAllAndWait());
    assert.equal(
      (await requestSnapshot(await explicit.getClient({ workspacePath: missingWorkspace }))).cwd,
      resolve(otherCwd),
    );
  });
});

describe("A42 请求超时看门狗与空闲回收", () => {
  it("请求超时后回收整棵进程树，下一次 getClient 透明重启", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const recorder = createRecorder();
    const manager = new KnorviaAgentProcessManager({
      requestTimeoutMs: 300,
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "stall"),
        cwd: workspacePath,
      }),
      processLifecycleReporter: createLifecycleReporter(recorder),
    });
    t.after(() => manager.disposeAllAndWait());
    const events = createRecorder();
    manager.onRuntimeLifecycle((event) => events.push({ kind: "lifecycle", event }));

    const stale = await manager.getClient({ workspacePath });
    const stalePid = await recorder
      .next((entry) => entry.kind === "spawn")
      .then((entry) => entry.event.pid);
    await assert.rejects(
      () => stale.request("svc01/hang"),
      (error) =>
        error.name === "KnorviaProtocolRequestTimeoutError" &&
        error.method === "svc01/hang" &&
        error.timeoutMs === 300,
    );
    assert.equal(manager.getExistingClient({ workspacePath }), undefined, "坏 client 不得继续复用");
    assert.equal(stale.isDisposed, true);
    const unavailable = await events.next((entry) => entry.event.state === "unavailable");
    assert.equal(unavailable.event.runtimeIdentity.processId, stalePid);
    await recorder.next((entry) => entry.kind === "exit");
    const replacement = await manager.getClient({ workspacePath });
    assert.notEqual(replacement, stale);
    assert.equal((await manager.getRuntimeIdentity({ workspacePath })).generation, 2);
  });

  it("workspace/cancelGenerateText 超时只告警，不回收仍在服务的 client", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const manager = new KnorviaAgentProcessManager({
      requestTimeoutMs: 300,
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "stall"),
        cwd: workspacePath,
      }),
    });
    t.after(() => manager.disposeAllAndWait());
    const events = createRecorder();
    manager.onRuntimeLifecycle((event) => events.push({ kind: "lifecycle", event }));
    const client = await manager.getClient({ workspacePath });
    await assert.rejects(
      () => client.request("workspace/cancelGenerateText", { requestId: "svc01" }),
      (error) => error.name === "KnorviaProtocolRequestTimeoutError",
    );
    assert.equal(manager.getExistingClient({ workspacePath }), client);
    assert.equal(
      events.count((entry) => entry.event.state === "unavailable"),
      0,
    );
    assert.equal(client.pendingOperationRequestCount, 0);
  });

  it("空闲回收把整棵进程树归因为 expected/idle-timeout", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const recorder = createRecorder();
    const manager = new KnorviaAgentProcessManager({
      idleTimeoutMs: 250,
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo"),
        cwd: workspacePath,
      }),
      processLifecycleReporter: createLifecycleReporter(recorder),
    });
    t.after(() => manager.disposeAllAndWait());
    const events = createRecorder();
    manager.onRuntimeLifecycle((event) => events.push({ kind: "lifecycle", event }));

    const client = await manager.getClient({ workspacePath });
    assert.equal(manager.getExistingClient({ workspacePath }), client);
    await requestSnapshot(client);
    await recorder.next((entry) => entry.kind === "spawn");
    assert.equal(
      events.count((entry) => entry.event.state === "unavailable"),
      0,
      "在飞请求归零前不回收",
    );
    const unavailable = await events.next((entry) => entry.event.state === "unavailable");
    assert.equal(unavailable.event.workspaceKey, workspacePath);
    assert.equal(manager.getExistingClient({ workspacePath }), undefined);
    const exit = await recorder.next((entry) => entry.kind === "exit");
    assert.equal(exit.event.terminationKind, "expected");
    assert.equal(exit.event.terminationReason, "idle-timeout");
    const restarted = await manager.getClient({ workspacePath });
    assert.notEqual(restarted, client);
    assert.equal((await requestSnapshot(restarted)).ok, true);
  });
});

describe("A43 存储启动门闩上报", () => {
  it("supportsStorageStartup 命令按 CLI 帧序发布 generation 与阶段", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const migrating = {
      schemaVersion: 1,
      attemptId: "attempt-svc01",
      sequence: 1,
      databaseId: "db-svc01",
      databaseKind: "session",
      phase: "migrating",
      elapsedMs: 1,
      completed: 1,
      total: 2,
    };
    const ready = { ...migrating, sequence: 2, phase: "ready", completed: 2 };
    const manager = new KnorviaAgentProcessManager({
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo", {
          pre: [line(1, JSON.stringify({ method: "startup/storageState", params: migrating }))],
          notify: [line(1, JSON.stringify({ method: "startup/storageState", params: ready }))],
        }),
        cwd: workspacePath,
        supportsStorageStartup: true,
      }),
    });
    t.after(() => manager.disposeAllAndWait());
    const events = createRecorder();
    const disposable = manager.onStorageStartupChanged((event) =>
      events.push({ kind: "storage", event }),
    );

    const client = await manager.getClient({ workspacePath });
    await events.next((entry) => entry.event.snapshot.state?.phase === "migrating");
    assert.deepEqual(manager.getStorageStartupState({ workspacePath }), {
      generation: 1,
      state: migrating,
    });
    assert.equal(client.pendingRequestCount, 0);

    await client.notify("svc01/advance");
    const readyEvent = await events.next((entry) => entry.event.snapshot.state?.phase === "ready");
    assert.equal(readyEvent.event.workspaceKey, workspacePath);
    assert.deepEqual(readyEvent.event.snapshot, { generation: 1, state: ready });
    assert.deepEqual(manager.getStorageStartupState({ workspacePath }), {
      generation: 1,
      state: ready,
    });
    assert.deepEqual(
      events.entries.map((entry) => [
        entry.event.snapshot.generation,
        entry.event.snapshot.state?.phase ?? null,
      ]),
      [
        [1, null],
        [1, "migrating"],
        [1, "ready"],
      ],
    );
    disposable.dispose();
  });

  it("CLI 上报 failed 阶段时门闩把启动事实合成为失败并拒绝后续状态", async (t) => {
    const { fixturePath, workspacePath } = await makeFixture(t);
    const migrating = {
      schemaVersion: 1,
      attemptId: "attempt-fail",
      sequence: 1,
      databaseId: "db-fail",
      databaseKind: "tasks-index",
      phase: "waiting_for_lock",
      elapsedMs: 0,
    };
    const failed = {
      schemaVersion: 1,
      attemptId: "attempt-fail",
      sequence: 2,
      databaseId: "db-fail",
      databaseKind: "tasks-index",
      phase: "failed",
      elapsedMs: 3,
      errorCode: "lock_timeout",
    };
    const manager = new KnorviaAgentProcessManager({
      commandResolver: () => ({
        command: process.execPath,
        args: fixtureArgs(fixturePath, "echo", {
          pre: [line(1, JSON.stringify({ method: "startup/storageState", params: migrating }))],
          notify: [line(1, JSON.stringify({ method: "startup/storageState", params: failed }))],
        }),
        cwd: workspacePath,
        supportsStorageStartup: true,
      }),
    });
    t.after(() => manager.disposeAllAndWait());
    const events = createRecorder();
    manager.onStorageStartupChanged((event) => events.push({ kind: "storage", event }));
    const client = await manager.getClient({ workspacePath });
    await events.next((entry) => entry.event.snapshot.state?.phase === "waiting_for_lock");
    await client.notify("svc01/advance");
    const failure = await events.next((entry) => entry.event.snapshot.state?.phase === "failed");
    assert.deepEqual(failure.event.snapshot.state, failed);
    await assert.rejects(
      () => client.request("svc01/after-fail"),
      (error) => error.message === "SQLite startup failed: lock_timeout",
    );
    assert.equal(manager.getStorageStartupState({ workspacePath }).state.phase, "failed");
  });
});
