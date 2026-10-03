import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const plain = (value) => JSON.parse(JSON.stringify(value));
export const trace = { traceId: "owned-trace", spanId: "owned-span" };
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export function fixture() {
  const calls = [];
  const runtime = {
    config: {},
    mcpInitialized: false,
    mcpToolsRegistered: false,
    mcpStartupPromise: undefined,
    workingDirectory: "/owned/cwd",
    workspaceRoot: "/owned/workspace",
    sessionId: "owned-parent",
    rootTraceContext: trace,
    cachedTools: null,
    eventSinks: new Set(),
    contextBuilder: null,
    registry: {},
    executor: {},
    eventStore: {},
    logger: Object.fromEntries(
      ["debug", "info", "warn"].map((level) => [
        level,
        function (message, fields) {
          assert.equal(this, runtime.logger);
          calls.push([level, message, fields]);
        },
      ]),
    ),
    trackResidencyBlockingWork(work) {
      assert.equal(this, runtime);
      calls.push(["track", work]);
      return work;
    },
    invalidateToolCache() {
      assert.equal(this, runtime);
      calls.push(["invalidate"]);
      this.cachedTools = null;
    },
    notifyEventSinks(event, eventTrace) {
      assert.equal(this, runtime);
      calls.push(["notify", event, eventTrace]);
      return Promise.resolve();
    },
    ensureSessionPersisted(input, eventTrace) {
      assert.equal(this, runtime);
      calls.push(["persist", input, eventTrace]);
      return Promise.resolve();
    },
    rebuildProjection() {
      assert.equal(this, runtime);
      return Promise.resolve({ ownedProjection: true });
    },
  };
  const shared = {
    KNORVIA_PLUGIN_ID_ENV_KEY: "KNORVIA_PLUGIN_ID",
    KNORVIA_CUA_PLUGIN_AUTHORITY_ENV_KEY: "KNORVIA_CUA_PLUGIN_AUTHORITY",
    KNORVIA_CUA_OFFICIAL_PLUGIN_ID: "computer-use@knorvia-plugins-bundled",
    getCapturedKnorviaCuaBrokerCredentials() {
      calls.push(["credentials"]);
      return { pluginAuthority: "owned-authority" };
    },
    resolveExecutionState(input, previous = { mode: "build", planEnabled: false }) {
      calls.push(["resolve-state", input, previous]);
      return {
        mode: input.mode ?? previous.mode,
        planEnabled: input.planEnabled ?? previous.planEnabled,
      };
    },
  };
  const deps = {
    traceContextToLogContext(value) {
      assert.equal(value, trace);
      return { ownedTrace: true };
    },
    registerMcpTools(registry, port, tools, options) {
      calls.push(["register", registry, port, tools, options]);
      return tools.map((tool) => tool.name);
    },
  };
  const modules = {
    "@knorvia/shared": shared,
    "runtime/deps.js": deps,
    "runtime/helpers/index.js": {
      isInspectablePermissionBroker: (broker) => typeof broker?.listPendingRequests === "function",
      projectIdFromDirectory: (directory) => "owned-project:" + directory,
    },
    "runtime/helpers/child-client-ports.js": {
      deriveChildClientPorts(ports, identity) {
        calls.push(["child-ports", ports, identity]);
        return ports;
      },
    },
    "runtime/model-selection.js": {
      cloneModelSelection: (value) => ({
        ...value,
        ...(value.options ? { options: { ...value.options } } : {}),
      }),
    },
    "runtime/execution-state.js": {
      applyRuntimeExecutionState(runtimeArg, input, cause) {
        calls.push(["execution-state", runtimeArg, input, cause]);
        return Promise.resolve({ mode: "build", planEnabled: true });
      },
    },
    "tool/provider-visible-order.js": {
      orderProviderVisibleToolContracts: (tools) => tools.slice().reverse(),
    },
    "tool/model-contract.js": {
      projectToolModelContract(contract, entry, context) {
        calls.push(["project-tool", contract, entry, context]);
        return contract;
      },
    },
    "runtime/methods/context-refresh.js": {
      rebuildContextPrefix: (owner) => calls.push(["prefix", owner]),
    },
    "runtime/methods/embedded-search-branch.js": {
      filterEmbeddedSearchRuntimeVisibleTools(owner, tools) {
        calls.push(["filter", owner, tools]);
        return tools;
      },
    },
    "runtime/methods/session-shell-environment.js": {
      getSessionShellSelection: (owner) => owner.ownedShell,
      initializeSessionShellEnvironmentIfNeeded(owner, candidate) {
        owner.ownedShell = candidate;
        return true;
      },
    },
  };
  return { runtime, calls, modules, clock: { reads: 0 } };
}
export async function load(mode, owned) {
  const oldBytes = fs.readFileSync(
    path.join(repo, "apps/cli/packages/core/test/mcp-config-baseline-20261003.json"),
  );
  assert.equal(hash(oldBytes), "c62abf9d549977fcba1ec7b46174e74a8b6e727ef245cd8714b82cc708cffe0b");
  const old = JSON.parse(oldBytes);
  for (const row of Object.values(old.files))
    for (const kind of ["source", "compiled", "declaration"])
      assert.equal(hash(row[kind]), row[kind + "Sha256"]);
  let files = old.files;
  if (mode === "current") {
    const bytes = fs.readFileSync(
      path.join(repo, "docs/evidence/knorvia-mcp-config-current-20261003.json"),
    );
    assert.equal(hash(bytes), "CURRENT_PIN");
    files = {};
    for (const [name, row] of Object.entries(JSON.parse(bytes).files)) {
      files[name] = {};
      for (const [kind, entry] of Object.entries(row)) {
        const bytes = fs.readFileSync(path.join(repo, entry.path));
        assert.equal(hash(bytes), entry.sha256, entry.path);
        files[name][kind] = bytes.toString();
      }
    }
  } else if (mode === "sealedDraft") {
    const bytes = fs.readFileSync(
      path.join(repo, "docs/evidence/mcp-config-checks-20261003/sealed-draft-emission.json"),
    );
    assert.equal(hash(bytes), "584100c8a38a37b048b3ee3af41c344f46d6f79be3d52c652739f47eb9316c9d");
    const result = JSON.parse(bytes);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.apiEqual, true);
    files = result.files;
  } else assert.equal(mode, "baseline");
  class OwnedClock extends Date {
    static now() {
      owned.calls.push(["clock"]);
      return 100 + owned.clock.reads++ * 20;
    }
  }
  const context = vm.createContext({ Date: OwnedClock, Error, Set, Map, Promise, String, Boolean });
  const modules = new Map(
    Object.entries(owned.modules).map(([id, exports]) => [
      id,
      new vm.SyntheticModule(
        Object.keys(exports),
        function () {
          for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
        },
        { context, identifier: id },
      ),
    ]),
  );
  for (const [name, row] of Object.entries(files)) {
    const id = "runtime/methods/" + name.replace(/\.ts$/u, ".js");
    modules.set(id, new vm.SourceTextModule(row.compiled, { context, identifier: id }));
  }
  const link = (specifier, parent) => {
    const id = specifier.startsWith(".")
      ? path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), specifier))
      : specifier;
    assert.ok(modules.has(id), "Unselected port: " + id);
    return modules.get(id);
  };
  const exports = {};
  for (const name of ["mcp", "config"]) {
    const module = modules.get("runtime/methods/" + name + ".js");
    if (module.status === "unlinked") await module.link(link);
    if (module.status === "linked") await module.evaluate();
    Object.assign(exports, module.namespace);
    Object.assign(owned.runtime, module.namespace);
  }
  return exports;
}
