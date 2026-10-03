import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const core = path.join(repo, "apps/cli/packages/core");
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const historicalPath = path.join(core, "test/runtime-tooling-baseline-20261003.json");
export const historicalHash = "89c566f4070749a03f9cfcc450f080b27fcc589b634dedc0e421f442abf2d709";
export async function load(mode, ports) {
  const original = fs.readFileSync(historicalPath);
  assert.equal(hash(original), historicalHash);
  const old = JSON.parse(original);
  let files = old.files;
  if (mode === "current") {
    const manifestBytes = fs.readFileSync(
      path.join(repo, "docs/evidence/knorvia-runtime-tooling-current-20261003.json"),
    );
    assert.equal(hash(manifestBytes), "CURRENT_PIN");
    files = {};
    for (const [name, row] of Object.entries(JSON.parse(manifestBytes).files)) {
      files[name] = {};
      for (const [kind, entry] of Object.entries(row)) {
        const bytes = fs.readFileSync(path.join(repo, entry.path));
        assert.equal(hash(bytes), entry.sha256, entry.path);
        files[name][kind] = bytes.toString();
      }
    }
  } else if (mode === "draft") {
    const bytes = fs.readFileSync(process.argv[3]);
    assert.equal(hash(bytes), "370db9b62a232c581cf06129a918a5865eb4289533ab86e18469bafbf8bfede1");
    const result = JSON.parse(bytes);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.apiEqual, true);
    files = result.files;
  } else assert.equal(mode, "baseline");
  for (const row of Object.values(old.files))
    for (const kind of ["source", "compiled", "declaration"])
      assert.equal(hash(row[kind]), row[kind + "Sha256"]);
  const receipt = await import("../../contracts/dist/interfaces/permission-full-access.js");
  const contracts = {
    ...receipt,
    traceContextToLogContext: ports.traceContextToLogContext,
    AMEND_WORKFLOW_TOOL_NAME: "AmendWorkflow",
    CREATE_WORKFLOW_TOOL_NAME: "CreateWorkflow",
    RESOLVE_WORKFLOW_QUESTION_TOOL_NAME: "ResolveWorkflowQuestion",
    RESPOND_TO_COORDINATOR_TOOL_NAME: "RespondToCoordinator",
    RESUME_WORKFLOW_RUN_TOOL_NAME: "ResumeWorkflowRun",
    SAVE_WORKFLOW_TOOL_NAME: "SaveWorkflow",
  };
  const synthetic = (identifier, exports) =>
    new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
      },
      { identifier },
    );
  const modules = new Map();
  const dep = synthetic("deps", ports);
  const contract = synthetic("contracts", contracts);
  const boundaries = {
    "runtime/methods/session-shell-environment.js": {
      getSessionShellSelectionFromConfig: (config) => config.shellSelection,
    },
    "runtime/session-mode-port.js": {
      createRuntimeSessionModePort: (runtime) => {
        ports.calls.push("session-mode");
        return { runtime };
      },
    },
    "runtime/methods/runtime-command-generation.js": {
      isStaleBranchRuntimeTaskEvent: (_runtime, event) => event.stale === true,
    },
    "runtime/helpers/project-memory.js": {
      resolveEnabledProjectMemoryRoot: (config, root) => {
        ports.calls.push("memory-policy");
        return config.memoryRoot ?? root;
      },
    },
  };
  for (const [name, exports] of Object.entries(boundaries))
    modules.set(name, synthetic(name, exports));
  for (const [name, row] of Object.entries(files)) {
    const id = name.replace(/\.ts$/u, ".js");
    modules.set(id, new vm.SourceTextModule(row.compiled, { identifier: id }));
  }
  const get = (specifier, from) => {
    if (specifier === "@knorvia/contracts") return contract;
    const id = path.posix.normalize(
      path.posix.join(path.posix.dirname(from.identifier), specifier),
    );
    if (id === "runtime/deps.js") return dep;
    assert.ok(modules.has(id), `Unselected dependency ${id}`);
    return modules.get(id);
  };
  const names = [
    "runtime/helpers/runtime-tools.js",
    "runtime/helpers/tool-allowlist.js",
    "runtime/helpers/permission-grant-resume.js",
    "runtime/methods/embedded-search-branch.js",
  ];
  for (const name of names) {
    const module = modules.get(name);
    if (module.status === "unlinked") await module.link(get);
    if (module.status === "linked") await module.evaluate();
  }
  return Object.assign({}, ...names.map((name) => modules.get(name).namespace));
}
export const trace = { traceId: "owned-trace", spanId: "owned-span", turnId: "owned-turn" };
export function fixture() {
  const calls = [],
    events = [],
    warnings = [],
    notifications = [],
    hooks = [{ id: "owned-hook-a" }, { id: "owned-hook-b" }];
  const runner = {
    register(hook) {
      assert.equal(this, runner);
      calls.push(hook.id);
    },
  };
  const executor = { owned: "executor" };
  let registration, executorOptions, hookOptions, mailboxOptions;
  const ports = {
    calls,
    registerBuiltInTools(registry, options) {
      assert.equal(registry, runtime.registry);
      calls.push("register");
      registration = options;
    },
    createConfiguredHookRunner(options) {
      calls.push("configured");
      hookOptions = options;
      return runner;
    },
    createInMemoryHookRunner(options) {
      calls.push("memory-hooks");
      hookOptions = options;
      return runner;
    },
    createSessionMailboxHookRegistrations(options) {
      calls.push("mailbox-hooks");
      mailboxOptions = options;
      return hooks;
    },
    createToolExecutor(options) {
      calls.push("executor");
      executorOptions = options;
      return executor;
    },
    getCurrentTraceContext() {
      return ports.currentTrace;
    },
    traceContextToLogContext(context) {
      return { traceId: context.traceId, turnId: context.turnId };
    },
  };
  const runtime = {
    config: {},
    registry: {
      unregister(name) {
        calls.push("unregister:" + name);
      },
    },
    agentTelemetry: { port: {}, actorKind: "main" },
    permissionService: {},
    permissionBroker: {},
    skillPort: {},
    subagentPort: { sendMessage: null },
    rootTraceContext: trace,
    sessionId: "owned-runtime-session",
    workingDirectory: "owned-cwd",
    workspaceRoot: "owned-root",
    readFileState: new Map(),
    backgroundTaskNotificationsSealed: false,
    runtimeTaskRegistry: {
      get(id) {
        assert.equal(this, runtime.runtimeTaskRegistry);
        calls.push("registry:" + id);
        return runtime.task;
      },
    },
    logger: {
      warn(message, context) {
        assert.equal(this, runtime.logger);
        warnings.push([message, context]);
      },
      info(message, context) {
        assert.equal(this, runtime.logger);
        warnings.push([message, context]);
      },
    },
    async appendEvent(event, context) {
      assert.equal(this, runtime);
      calls.push("append");
      events.push([event, context]);
    },
    async steerTurn(input) {
      assert.equal(this, runtime);
      calls.push("steer");
      runtime.steered = input;
      return runtime.steerResult ?? { kind: "accepted" };
    },
    enqueueBackgroundTaskNotification(value) {
      assert.equal(this, runtime);
      notifications.push(value);
      return "ignored";
    },
    stopBackgroundTask(...args) {
      assert.equal(this, runtime);
      calls.push("stop");
      return args;
    },
    setWorkingDirectory(value) {
      assert.equal(this, runtime);
      runtime.workingDirectory = value;
    },
  };
  const deps = {};
  return {
    runtime,
    deps,
    ports,
    calls,
    events,
    warnings,
    runner,
    executor,
    hooks,
    notifications,
    get registration() {
      return registration;
    },
    get executorOptions() {
      return executorOptions;
    },
    get hookOptions() {
      return hookOptions;
    },
    get mailboxOptions() {
      return mailboxOptions;
    },
  };
}
