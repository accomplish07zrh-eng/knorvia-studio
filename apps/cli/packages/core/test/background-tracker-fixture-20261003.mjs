import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
export const hash = (b) => createHash("sha256").update(b).digest("hex");
export const oraclePath = "apps/cli/packages/core/test/background-tracker-baseline-20261003.json";
const bytes = await readFile(path.join(repo, oraclePath));
assert.equal(hash(bytes), "21ad66af851971aa60edef827577865d37de02ad32b02ec0ebdf5d2873cc8eb3");
export const oracle = JSON.parse(bytes);
for (const row of Object.values(oracle.files))
  for (const k of ["source", "compiled", "declaration"])
    assert.equal(hash(row[k]), row[k + "Sha256"]);
export const plain = (x) => JSON.parse(JSON.stringify(x));
export const flush = async () => {
  for (let i = 0; i < 32; i++) await Promise.resolve();
};
export function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
export async function fixture(mode) {
  assert.ok(["baseline", "current"].includes(mode));
  const texts = new Map(
    Object.values(oracle.files).map((r) => [r.logicalPath.replace(/\.ts$/u, ".js"), r.compiled]),
  );
  if (mode === "current") {
    const b = await readFile(
      path.join(repo, "docs/evidence/knorvia-background-tracker-current-20261003.json"),
    );
    assert.equal(hash(b), "e3a8f212f9a30970acdffbefb1f7198c859fb698da87a689ed3fd57f222b1453");
    for (const row of Object.values(JSON.parse(b).files)) {
      for (const [k, e] of Object.entries(row)) {
        const b = await readFile(path.join(repo, e.path));
        assert.equal(hash(b), e.sha256, e.path);
        if (k === "compiled") texts.set(row.source.path.replace(/\.ts$/u, ".js"), b.toString());
      }
    }
  }
  // 两项下层 owner 已更新：历史模式只读固定 oracle，当前模式必须绑定新 artifact，避免旧码误当新码。
  const dataOwners = new Set([
    "tool/executor/background-task-output",
    "tool/executor/workflow-artifact",
  ]);
  if (mode === "current") {
    const b = await readFile(
      path.join(repo, "docs/evidence/knorvia-background-data-current-20261003.json"),
    );
    assert.equal(hash(b), "5abaeeb926d865401fc122a4ac86067850faea180afe46a7e7ad2ecb3e8663bc");
    const rows = JSON.parse(b).files;
    assert.deepEqual(
      Object.keys(rows).sort(),
      [...dataOwners].map((n) => `apps/cli/packages/core/src/${n}.ts`).sort(),
    );
    for (const [logical, row] of Object.entries(rows)) {
      assert.equal(row.source.path, logical);
      for (const [kind, entry] of Object.entries(row)) {
        const body = await readFile(path.join(repo, entry.path));
        assert.equal(hash(body), entry.sha256, entry.path);
        if (kind === "compiled") texts.set(logical.replace(/\.ts$/u, ".js"), body.toString());
      }
    }
  }
  for (const [n, row] of Object.entries(oracle.files))
    if (n !== "tool/executor/background-tasks" && !dataOwners.has(n))
      assert.equal(
        hash(await readFile(path.join(repo, row.logicalPath))),
        row.sourceSha256,
        row.logicalPath,
      );
  const trace = [],
    events = [],
    notifications = [],
    records = new Map(),
    timers = new Map();
  let clock = 0,
    id = 0,
    timerId = 0;
  class Clock extends Date {
    constructor(...args) {
      super(...(args.length ? args : [1700000000000 + clock++]));
    }
  }
  const makeTimer = (kind, fn, delay) => {
    const t = {
      id: ++timerId,
      kind,
      fn,
      delay,
      unref() {
        trace.push(["unref", this.id]);
      },
    };
    timers.set(t.id, t);
    trace.push(["timer", kind, t.id, delay]);
    return t;
  };
  const clear = (kind, t) => {
    trace.push(["clear", kind, t.id]);
    timers.delete(t.id);
  };
  const context = vm.createContext({
    Date: Clock,
    crypto: { randomUUID: () => `owned-event-${++id}` },
    setInterval: (f, d) => makeTimer("interval", f, d),
    clearInterval: (t) => clear("interval", t),
    setTimeout: (f, d) => makeTimer("timeout", f, d),
    clearTimeout: (t) => clear("timeout", t),
    Promise,
    Number,
    JSON,
  });
  const synthetic = (exports) =>
    new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [k, v] of Object.entries(exports)) this.setExport(k, v);
      },
      { context },
    );
  const terminal = (t) =>
    ["completed", "failed", "killed", "cancelled", "stopped", "lost"].includes(t.status);
  const externals = new Map([
    [
      "@knorvia/contracts",
      synthetic({
        SessionEventType: {
          BackgroundTaskStarted: "BackgroundTaskStarted",
          BackgroundTaskUpdated: "BackgroundTaskUpdated",
          BackgroundTaskCompleted: "BackgroundTaskCompleted",
        },
        traceContextToLogContext: (t) => ({ traceId: t.traceId, spanId: t.spanId }),
        serializeWorkflowArtifact: (x) =>
          typeof x === "string" ? x : x === undefined ? undefined : JSON.stringify(x),
        CREATE_WORKFLOW_TOOL_NAME: "CreateWorkflow",
        AMEND_WORKFLOW_TOOL_NAME: "AmendWorkflow",
        RESUME_WORKFLOW_RUN_TOOL_NAME: "ResumeWorkflowRun",
      }),
    ],
    ["node:path", synthetic({ default: path })],
    [
      "apps/cli/packages/core/src/runtime-task/registry.js",
      synthetic({ isTerminalRuntimeTask: terminal }),
    ],
    [
      "apps/cli/packages/core/src/permission/broker.js",
      synthetic({
        createDenyPermissionBroker: () => {
          throw Error("owned broker supplied; default must not execute");
        },
      }),
    ],
    [
      "apps/cli/packages/core/src/tool/executor/batch-runner.js",
      synthetic({
        executeToolBatch: () => {
          throw Error("no actual batch");
        },
        executeToolSchedule: () => {
          throw Error("no actual schedule");
        },
      }),
    ],
    [
      "apps/cli/packages/core/src/tool/executor/call-runner.js",
      synthetic({
        executeToolCall: () => {
          throw Error("no actual tool call");
        },
      }),
    ],
  ]);
  const modules = new Map(
    [...texts]
      .filter(([, t]) => t !== undefined)
      .map(([n, t]) => [n, new vm.SourceTextModule(t, { context, identifier: n })]),
  );
  const root = modules.get("apps/cli/packages/core/src/tool/executor/impl.js");
  await root.link((specifier, referencing) => {
    if (externals.has(specifier)) return externals.get(specifier);
    const n = path.posix.normalize(
      path.posix.join(path.posix.dirname(referencing.identifier), specifier),
    );
    const m = modules.get(n) ?? externals.get(n);
    assert.ok(m, `owned dependency ${n}`);
    return m;
  });
  await root.evaluate();
  const deps = {
    sessionId: "owned-session",
    permissionService: {},
    permissionBroker: {},
    registry: {},
    runtimeScope: "main",
    getWorkingDirectory: () => "/owned-workspace",
    getWorkspaceRoot: () => "/owned-workspace",
    getMode: () => "build",
    defaultTimeoutMs: 300000,
    maxConcurrency: 2,
    readFileState: new Map(),
    emitEvent: async function (e) {
      assert.equal(this.emitEvent, deps.emitEvent);
      events.push(e);
      trace.push(["event", e.type, e.payload.status, e.payload.taskId]);
    },
    logger: Object.fromEntries(
      ["info", "warn", "debug"].map((k) => [
        k,
        (message, facts) => trace.push(["log", k, message, plain(facts)]),
      ]),
    ),
    runtimeTaskRegistry: {
      get(taskId) {
        trace.push(["registry.get", taskId]);
        return records.get(taskId);
      },
      register(t) {
        trace.push(["registry.register", t.taskId]);
        records.set(t.taskId, t);
        return t;
      },
      update(taskId, fn) {
        trace.push(["registry.update", taskId]);
        const old = records.get(taskId);
        if (!old) return;
        const next = fn(old);
        records.set(taskId, next);
        return next;
      },
      remove(taskId) {
        trace.push(["registry.remove", taskId]);
        return records.delete(taskId);
      },
    },
    enqueueBackgroundTaskNotification: function (n) {
      assert.equal(this.enqueueBackgroundTaskNotification, deps.enqueueBackgroundTaskNotification);
      notifications.push(n);
      trace.push(["enqueue", n.taskId]);
      return undefined;
    },
  };
  const Tracker = modules.get("apps/cli/packages/core/src/tool/executor/background-tasks.js")
    .namespace.BackgroundTaskTracker;
  const tracker = new Tracker(deps),
    tool = (name = "Bash", input = { command: "owned command" }) => ({
      id: "owned-tool",
      name,
      input,
    }),
    launch = { status: "backgrounded", backgroundTaskId: "owned-task" };
  const tracking = (call = tool(), output = launch) =>
    tracker.trackBackgroundTask(
      call,
      output,
      { traceId: "owned-trace", spanId: "owned-span" },
      "owned-turn",
    );
  const fire = (kind) => {
    const t = [...timers.values()].find((t) => t.kind === kind);
    assert.ok(t, kind);
    return t.fn();
  };
  return {
    context,
    trace,
    events,
    notifications,
    records,
    timers,
    deps,
    tracker,
    tool,
    launch,
    tracking,
    fire,
    Clock,
    executor: (options = {}) => new root.namespace.ToolExecutorImpl({ ...deps, ...options }),
    summary: () =>
      plain({
        trace,
        events,
        notifications,
        records: [...records.values()],
        timers: [...timers.values()].map(({ id, kind, delay }) => ({ id, kind, delay })),
      }),
  };
}
