import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
// File reads are limited to these three selected modules. All product ports are synthetic.
const baseline = process.argv.includes("--baseline");
const selected = process.argv.find((arg) => arg.startsWith("--owner="))?.slice(8);
const owners = {
  recording: "browserRecordingArtifactMaterializer.ts",
  proxy: "hostRemoteWorkspaceProxyState.ts",
  registry: "windowRemoteConnectionRegistry.ts",
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const defer = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const drain = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function load(owner, ports, globals = {}) {
  const file = baseline
    ? path.join("/tmp/knorvia-host-resource-baseline", owners[owner])
    : path.join(process.cwd(), "packages/desktop/src/host", owners[owner]);
  const result = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: file,
    reportDiagnostics: true,
  });
  assert.equal(
    result.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length,
    0,
  );
  const exports = {};
  vm.runInNewContext(
    result.outputText,
    {
      exports,
      module: { exports },
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
      Number,
      String,
      Math,
      ...globals,
    },
    { filename: file },
  );
  return exports;
}
function check(owner, name, run) {
  if (!selected || selected === owner) test(owner + ": " + name, run);
}
const workspaceKey = (context) => context.workspaceIdentity?.trim() || context.workspacePath;
const proxy = () =>
  load("proxy", {
    "@knorvia/shared": { resolveWorkspaceKey: workspaceKey },
  }).createHostRemoteWorkspaceProxyState();
function registryHarness(overrides = {}) {
  const connects = [],
    timers = new Map(),
    events = [];
  let id = 0,
    timerId = 0;
  class FakeAbortController {
    signal = { aborted: false };
    abort() {
      this.signal.aborted = true;
      events.push("abort");
    }
  }
  const options = {
    createId: () => "session-" + ++id,
    connect(request) {
      const ready = defer();
      connects.push({ request, ready });
      return ready.promise;
    },
    wslIdleTtlMs: 17,
    ...overrides,
  };
  const shared = {
    buildSshRemoteHostKey: (target) => target.syntheticIdentity,
    stripRemoteTargetSecrets(target) {
      const result = { ...target };
      delete result.syntheticSecret;
      return result;
    },
  };
  const registry = load(
    "registry",
    { "@knorvia/shared": shared },
    {
      AbortController: FakeAbortController,
      setTimeout(callback, delay) {
        const token = ++timerId;
        timers.set(token, { callback, delay });
        return token;
      },
      clearTimeout(token) {
        timers.delete(token);
      },
    },
  ).createWindowRemoteConnectionRegistry(options);
  const handle = (name) => {
    const listeners = new Set();
    return {
      services: { name },
      capabilities: { name },
      disposed: 0,
      dispose() {
        this.disposed++;
        events.push("dispose:" + name);
      },
      onDidClose(listener) {
        listeners.add(listener);
        return {
          dispose() {
            events.push("unsubscribe:" + name);
            listeners.delete(listener);
          },
        };
      },
      close(event) {
        for (const listener of listeners) listener(event);
      },
    };
  };
  const connect = (requestId, target, workspacePath = "/a", workspaceIdentity) =>
    registry.connect({
      requestId,
      target,
      remoteAssets: { mockCdnDir: "synthetic-assets" },
      workspacePath,
      workspaceIdentity,
    });
  const scope = (descriptor) => ({
    kind: "remote",
    remoteSessionId: descriptor.remoteSessionId,
    workspacePath: descriptor.workspacePath,
    workspaceIdentity: descriptor.workspaceIdentity,
    generation: -999,
  });
  return { registry, connects, timers, events, options, handle, connect, scope };
}
export {
  assert,
  fs,
  path,
  vm,
  test,
  ts,
  baseline,
  selected,
  owners,
  plain,
  defer,
  drain,
  load,
  check,
  workspaceKey,
  proxy,
  registryHarness,
};
