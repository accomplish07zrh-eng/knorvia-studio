import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
const baseline = process.argv.includes("--baseline");
const selected = process.argv.find((arg) => arg.startsWith("--owner="))?.slice(8);
const names = {
  browser: "browserControlMainBridge",
  attachments: "remotePromptAttachments",
  collection: "remoteWorkspaceServiceCollection",
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const quote = (value) => "Q(" + value + ")";
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function load(owner, ports, globals = {}) {
  const file = baseline
    ? "/tmp/knorvia-host-baseline/" + names[owner] + ".ts"
    : path.join(process.cwd(), "packages/desktop/src/host/" + names[owner] + ".ts");
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  let nonce = 0;
  vm.runInNewContext(
    code,
    {
      exports,
      module: { exports },
      Error,
      Promise,
      Math,
      Date,
      String,
      Object,
      Array,
      Map,
      Set,
      require: (id) => {
        if (id === "node:crypto") return { randomUUID: () => "uuid-" + ++nonce };
        if (Object.hasOwn(ports, id)) return ports[id];
        throw new Error("Unprovided product port: " + id);
      },
      ...globals,
    },
    { filename: file },
  );
  return exports;
}
function check(owner, name, fn) {
  if (!selected || selected === owner) test(owner + ": " + name, fn);
}
console.log(
  "sourceMode=" +
    (baseline ? "frozen-baseline" : "installed-candidate") +
    "; owner=" +
    (selected ?? "all"),
);
function browserFixture(deps = {}) {
  let now = 100,
    nextTimer = 0;
  const timers = new Map(),
    posts = [];
  const parameters = { postToMain: (message) => posts.push(message), ...deps };
  const api = load(
    "browser",
    { "@knorvia/shared": { HostResponseTypes: { BrowserExecuteRequest: "browser.execute" } } },
    {
      Date: { now: () => now },
      setTimeout: (fn, ms) => {
        const id = ++nextTimer;
        timers.set(id, { fn, ms });
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  ).createBrowserControlMainBridge(parameters);
  return {
    api,
    posts,
    timers,
    parameters,
    advance: (ms) => {
      now += ms;
    },
  };
}
function attachmentsFixture(failUpload = false) {
  const commands = [],
    uploads = [],
    failure = new Error("synthetic-upload-failure");
  const backend = {
    exec: async (command) => {
      commands.push(command);
      const listeners = { stdout: [], stderr: [] };
      return {
        stdout: { on: (_name, fn) => listeners.stdout.push(fn) },
        stderr: { on: (_name, fn) => listeners.stderr.push(fn) },
        onClose: (fn) => {
          queueMicrotask(() => {
            if (command === 'printf %s "$HOME"')
              for (const cb of listeners.stdout) cb(" /virtual/home///\n");
            fn(0);
          });
        },
      };
    },
    upload: async (...args) => {
      uploads.push(args);
      if (failUpload) throw failure;
    },
  };
  const api = load("attachments", {
    "@knorvia/server/remote/posixShell.js": { quotePosixPathArg: quote },
  });
  return { api, backend, commands, uploads, failure };
}
function collectionFixture() {
  const events = [],
    responses = [],
    errors = [],
    logs = [],
    entries = [];
  let handler, networkGetter;
  const setting = {
    get: async () => ({
      httpProxy: "synthetic-proxy",
      httpProxyNoProxy: "synthetic-exclusion",
      httpProxyCaCertPath: "/virtual/cert",
      memoryEnabled: true,
      askUserQuestionAutoResolutionEnabled: false,
      integratedTerminalShell: "synthetic-shell",
    }),
  };
  const agent = {
    onDynamicSessionRuntimePreferencesRequest: () => {
      events.push("subscribe-factory");
      return (fn) => {
        handler = fn;
        events.push("subscribe");
      };
    },
    respondSessionRuntimePreferences: async (message) => {
      responses.push(message);
    },
  };
  const connection = new Proxy(
    { agentService: agent },
    {
      get(target, key) {
        return Object.hasOwn(target, key) ? target[key] : { remote: String(key) };
      },
    },
  );
  class Collection {
    register(token, value) {
      entries.push([token, value]);
      return this;
    }
  }
  const services = new Proxy(
    { ServiceCollection: Collection },
    {
      get(target, key) {
        return Object.hasOwn(target, key) ? target[key] : String(key);
      },
    },
  );
  const nodes = {
    createServiceLogger: (scope) => {
      events.push("logger:" + scope);
      return Object.fromEntries(
        ["info", "warn", "debug"].map((level) => [level, (...args) => logs.push([level, ...args])]),
      );
    },
    createSettingService: () => {
      events.push("setting");
      return setting;
    },
    createCredentialService: () => {
      events.push("credential");
      return { local: "credential" };
    },
    createHostApiNetworkTransport: (getter) => {
      events.push("network");
      networkGetter = getter;
      return { local: "transport" };
    },
    createBroadcastService: (port) => {
      events.push("broadcast");
      return port;
    },
    createUsageStatsService: (params) => ({ local: "usage", params }),
    createSubagentsService: (params) => ({ local: "subagents", params }),
    createMemoryService: () => ({ local: "memory" }),
    createSettingsSyncService: (params) => ({ local: "sync", params }),
    registerHostApiNetworkTransportForDispose: (collection, transport) =>
      events.push(["dispose-association", collection, transport]),
  };
  const api = load("collection", {
    "@knorvia/services": services,
    "@knorvia/services/node": nodes,
    "@knorvia/shared": { DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY: "synthetic-budget" },
    "./legacyRemoteWorkspaceRpcContract.js": {
      assertLegacyRemoteWorkspaceRpcContract: (value) => {
        assert.equal(value, connection);
        events.push("assert");
      },
    },
  });
  const port = { synthetic: "port" },
    transfer = { synthetic: "transfer" };
  const result = api.createRemoteWorkspaceServiceCollection({
    connectionServices: connection,
    sourceServices: {
      get ignored() {
        throw new Error("sourceServices observed");
      },
    },
    parentPort: port,
    createReportingRemoteKnorviaTaskService: (value) => {
      events.push("reporting");
      return { reporting: value };
    },
    createRemotePromptAttachmentTaskService: (value) => {
      events.push("attachment-task");
      return { attachment: value };
    },
    createRemotePromptAttachmentSessionService: (value) => {
      events.push("attachment-session");
      return { attachment: value };
    },
    promptAttachmentTransferService: transfer,
    runtimePreferencesBridge: { onError: (error) => errors.push(error) },
  });
  return {
    events,
    responses,
    errors,
    logs,
    entries,
    setting,
    agent,
    connection,
    result,
    port,
    transfer,
    dispatch: (request) => handler(request),
    network: () => networkGetter(),
  };
}
export {
  fs,
  path,
  vm,
  assert,
  test,
  ts,
  baseline,
  selected,
  names,
  plain,
  quote,
  flush,
  load,
  check,
  browserFixture,
  attachmentsFixture,
  collectionFixture,
};
