import { createIndexOwnerControl } from "./indexOwner.state-fixture.mjs";
import { createIndexOwnerRegistries } from "./indexOwner.registry-fixture.mjs";
import { createIndexOwnerPorts } from "./indexOwner.ports-fixture.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {
  test,
  selected,
  plain,
  defer,
  drain,
  check,
  createIndexOwnerPort,
} from "./indexOwner.shared-fixture.mjs";
import ts from "typescript";
const baseline = process.argv.includes("--baseline");
function harness({ platform = "linux" } = {}) {
  const events = [],
    messages = [],
    processEvents = new Map(),
    protocols = [],
    scopes = [];
  const startupGate = defer(),
    phaseGate = defer(),
    taskReady = new Map(),
    terminal = new Map();
  const workspaceSubscriptions = new Map(),
    metadata = new Map();
  const symbols = {};
  for (const name of [
    "IFileService",
    "IMediaPreviewService",
    "IModelSelectionService",
    "ISettingService",
    "IStudioRuntimeService",
    "IWindowControllerService",
    "IKnorviaAgentService",
    "IKnorviaTaskService",
    "IKnorviaSessionService",
    "ICuaPipSessionService",
  ])
    symbols[name] = { channelName: name };
  const { control } = createIndexOwnerControl({ startupGate, phaseGate });
  const Port = createIndexOwnerPort(events);
  let messageHandler,
    uuid = 0;
  const parent = {
    on(name, callback) {
      assert.equal(name, "message");
      messageHandler = callback;
      events.push("message-handler");
    },
    postMessage(message) {
      messages.push(message);
    },
  };
  const fakeProcess = {
    parentPort: parent,
    pid: 12345,
    platform,
    env: {
      KNORVIA_PROCESS_LABEL: "synthetic-window",
      KNORVIA_REMOTE_MEDIA_RANGE_PREVIEW_ENABLED: "1",
      NODE_ENV: "test",
      SYNTHETIC_PUBLIC_ENV: "value",
    },
    title: "",
    cwd: () => "/synthetic-local",
    on(name, callback) {
      processEvents.set(name, callback);
    },
    once(name, callback) {
      processEvents.set(name, callback);
    },
    exit(code) {
      events.push("exit:" + code);
    },
    memoryUsage: () => ({ arrayBuffers: 1, external: 2, heapUsed: 3, rss: 4 }),
  };
  const tokens = symbols;
  const task = {
    async createTask(input) {
      events.push(["create", input]);
      return {
        taskId: "synthetic-task",
        traceId: "creation-trace",
        workspacePath: input.workspacePath,
        workspaceIdentity: input.workspaceIdentity,
      };
    },
    async resumeTask(input) {
      events.push(["resume", input]);
      return {
        taskId: input.taskId,
        traceId: "resume-trace",
        workspacePath: input.workspacePath,
        workspaceIdentity: input.workspaceIdentity,
      };
    },
    async setAutomationSessionConfig(input) {
      events.push(["config", input]);
    },
    async setConfigOption(input) {
      events.push(["config-option", input]);
    },
    async sendPrompt(input) {
      assert.ok(this === task || this === local.get(tokens.IKnorviaTaskService));
      events.push(["prompt", input]);
      if (control.promptGate) await control.promptGate.promise;
      return { accepted: true };
    },
    async releaseWorkspacePreparation(input) {
      events.push(["release-workspace", input]);
    },
    onDynamicWorkspaceEvent(context) {
      assert.equal(this, task);
      return (listener) => {
        workspaceSubscriptions.set(context.workspaceIdentity ?? context.workspacePath, listener);
        return {
          dispose() {
            events.push("workspace-subscription-dispose");
          },
        };
      };
    },
    onDynamicTaskReady(id) {
      assert.equal(this, task);
      return (listener) => {
        taskReady.set(id, listener);
        return {
          dispose() {
            events.push("ready-dispose:" + id);
          },
        };
      };
    },
    onDynamicStreamEvent(id) {
      assert.equal(this, task);
      return (listener) => {
        control.streamListener = listener;
        return {
          dispose() {
            events.push("stream-dispose:" + id);
          },
        };
      };
    },
    onDynamicTaskTerminalOutcome(id) {
      return (listener) => {
        terminal.set(id, listener);
        return {
          dispose() {
            events.push("terminal-dispose:" + id);
          },
        };
      };
    },
    async setTaskUnread(input) {
      events.push(["unread", input]);
      return input;
    },
    async deliverSessionMessage(input) {
      return input;
    },
    async sendSessionMessageDeliveryResult(input) {
      events.push(["delivery-result", input]);
    },
    passthrough() {
      return this;
    },
  };
  class Collection {
    values = new Map();
    constructor() {
      this.values.set(tokens.IKnorviaTaskService, task);
      this.values.set(tokens.IKnorviaAgentService, { name: "synthetic-agent" });
      this.values.set(tokens.IModelSelectionService, { name: "synthetic-selection" });
      this.values.set(tokens.ISettingService, {
        async get() {
          events.push("settings-read");
          return control.settings;
        },
      });
      this.values.set(tokens.IKnorviaSessionService, {
        async initializeWorkspace(context) {
          events.push(["warmup", context]);
          return { available: true, transportKind: "synthetic" };
        },
      });
      this.values.set(tokens.IFileService, { name: "synthetic-file" });
    }
    get(token) {
      const value = this.getOptional(token);
      assert.notEqual(value, undefined, token.channelName);
      return value;
    }
    getOptional(token) {
      return this.values.get(token);
    }
    register(token, service) {
      this.values.set(token, service);
      events.push(["register", token.channelName]);
    }
    exposeOnChannelServer(server, overrides) {
      control.exposures.push({ server, overrides });
      events.push("expose");
    }
  }
  const local = new Collection(),
    remote = new Collection();
  const trackerEntries = new Map();
  let trackerReporter;
  function publishCount(meta) {
    trackerReporter({
      workspacePath: meta.workspacePath,
      workspaceIdentity: meta.workspaceIdentity,
      runningTaskCount: trackerEntries.size,
    });
  }
  const tracker = {
    begin(id, meta) {
      if (trackerEntries.has(id)) return false;
      trackerEntries.set(id, meta);
      publishCount(meta);
      return true;
    },
    finish(id, meta) {
      if (trackerEntries.delete(id)) publishCount(meta);
    },
    clearWorkspace(context) {
      for (const [id, meta] of trackerEntries)
        if (key(meta) === key(context)) trackerEntries.delete(id);
      publishCount(context);
    },
    getTotalRunningTaskCount: () => trackerEntries.size,
  };
  const {
    key,
    sessions,
    registry,
    controller,
    attachment,
    Protocol,
    Server,
    Wrapper,
    realtime,
    backend,
    network,
    repo,
    shared,
    proxyState,
  } = createIndexOwnerRegistries({ events, control, protocols, metadata });
  const noop = () => {};
  const { ports } = createIndexOwnerPorts({
    shared,
    Protocol,
    Server,
    Wrapper,
    tokens,
    Collection,
    events,
    control,
    scopes,
    repo,
    local,
    network,
    noop,
    backend,
    fakeProcess,
    remote,
    startupGate,
    realtime,
    tracker,
    proxyState,
    phaseGate,
    attachment,
    registry,
    controller,
    randomUUID: () => "synthetic-" + ++uuid,
    setTrackerReporter: (callback) => {
      trackerReporter = callback;
    },
  });
  const source = baseline
    ? "/tmp/knorvia-host-index-baseline/index.ts"
    : path.join(process.cwd(), "packages/desktop/src/host/index.ts");
  const output = ts.transpileModule(fs.readFileSync(source, "utf8"), {
    fileName: source,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  assert.equal(
    output.diagnostics.filter((value) => value.category === ts.DiagnosticCategory.Error).length,
    0,
  );
  const exports = {},
    fakeConsole = { log: noop, warn: noop, error: noop };
  vm.runInNewContext(
    output.outputText,
    {
      exports,
      module: { exports },
      process: fakeProcess,
      console: fakeConsole,
      require(id) {
        assert.ok(Object.hasOwn(ports, id), "uninjected product import " + id);
        return ports[id];
      },
      Error,
      Promise,
      Map,
      Set,
      Object,
      Array,
      Proxy,
      Reflect,
      String,
      Number,
      Math,
      Date: class extends Date {
        static now() {
          return 1700000000000;
        }
      },
    },
    { filename: source },
  );
  const send = (data, port) => messageHandler({ data, ports: port ? [port] : [] });
  const init = async (extra = {}) => {
    const base = new Port(),
      pending = send(
        {
          type: "InitLocal",
          databaseStartupId: "startup",
          workspacePath: "/local",
          workspaceIdentity: "local",
          ...extra,
        },
        base,
      );
    startupGate.resolve();
    await pending;
    return base;
  };
  const connect = async () => {
    await send({
      type: "ConnectRemoteWorkspace",
      requestId: "connect",
      target: { kind: "ssh", username: "synthetic-user", host: "synthetic.invalid" },
      remoteAssets: { mockCdnDir: "synthetic-assets" },
      workspacePath: "/remote",
      workspaceIdentity: "remote:identity",
    });
    await drain();
    assert.ok(control.remoteHandle);
    return registry.getSession("remote-session");
  };
  return {
    events,
    messages,
    processEvents,
    protocols,
    scopes,
    control,
    Port,
    parent,
    fakeProcess,
    fakeConsole,
    tokens,
    local,
    remote,
    task,
    taskReady,
    terminal,
    trackerEntries,
    sessions,
    registry,
    attachment,
    controller,
    metadata,
    send,
    init,
    connect,
    invalid: () =>
      messageHandler({
        invalid: true,
        get ports() {
          assert.fail("invalid event port read");
        },
      }),
  };
}
export { assert, fs, path, vm, test, ts, baseline, selected, plain, defer, drain, check, harness };
