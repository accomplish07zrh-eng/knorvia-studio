// Owned synthetic ports only; source-exposed fixture patterns and retained baseline are disclosed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import dns from "node:dns";
import { invocation, gate } from "./tool-invocation-fixture.js";
export { gate };
export const emitted = process.env.KNORVIA_GET_WORKFLOW_RUN_SNAPSHOT_TEST_EMITTED === "1";
const forbiddenNetwork = () => {
  throw new Error("Only owned synthetic ports are allowed");
};
globalThis.fetch = forbiddenNetwork as typeof fetch;
for (const target of [dns, dns.promises] as any[])
  for (const method of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny"])
    target[method] = forbiddenNetwork;
export async function load(path: string) {
  const url = new URL(
    `../${emitted ? "dist" : "src"}/${path}.${emitted ? "js" : "ts"}`,
    import.meta.url,
  );
  if (emitted) await readFile(url);
  return import(url.href);
}
export const { getWorkflowRunToolEntry: entry } = await load("tool/handlers/get-workflow-run");
export const handlers = await load("tool/handlers/index");
export const { createToolRegistry } = await load("tool/registry");
export const { executeToolCall } = await load("tool/executor/call-runner");
export const { ToolDeadline, executeWithTimeout, linkAbortSignal, resolveTimeoutMs } =
  await load("tool/executor/timeout");
export const { initializeRuntimeTooling } = await load("runtime/helpers/runtime-tools");
export const publicDeclaration = await readFile(
  new URL("../dist/tool/handlers/get-workflow-run.d.ts", import.meta.url),
  "utf8",
);
export const archive = JSON.parse(
  await readFile(new URL("./get-workflow-run-snapshot-baseline.json", import.meta.url), "utf8"),
);
export const sha = (value: string) => createHash("sha256").update(value).digest("hex");
assert.equal(sha(archive.source), archive.sourceSha256);
assert.equal(sha(archive.compiled), archive.compiledSha256);
const mapped = archive.compiled.replace(/from "([^"]+)"/gu, (_match: string, specifier: string) => {
  const resolved = specifier.startsWith(".")
    ? new URL(
        specifier.replace(/\.js$/u, emitted ? ".js" : ".ts"),
        new URL(
          `../${emitted ? "dist" : "src"}/tool/handlers/get-workflow-run.${emitted ? "js" : "ts"}`,
          import.meta.url,
        ),
      ).href
    : specifier.startsWith("node:")
      ? specifier
      : import.meta.resolve(specifier);
  return `from ${JSON.stringify(resolved)}`;
});
export const baseline = (
  await import(`data:text/javascript;base64,${Buffer.from(mapped).toString("base64")}`)
).getWorkflowRunToolEntry;
export const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value, (key, item) => (key === "stack" ? undefined : item)));
export const errorShape = (error: any): any =>
  error !== null && (typeof error === "object" || typeof error === "function")
    ? json({
        name: error.name,
        type: error.type,
        code: error.code,
        message: error.message,
        detail: error.detail,
        context: error.context,
        recoverable: error.recoverable,
        issues: error.issues,
        cause: error.cause instanceof Error ? errorShape(error.cause) : error.cause,
      })
    : { value: error };
export async function clock<T>(run: () => T | Promise<T>): Promise<T> {
  const Original = globalThis.Date;
  class SyntheticDate extends Original {
    constructor(value?: string | number | Date) {
      super(value === undefined ? Date.UTC(2026, 0, 15, 12) : value);
    }
    static override now() {
      return Date.UTC(2026, 0, 15, 12);
    }
  }
  globalThis.Date = SyntheticDate as DateConstructor;
  try {
    return await run();
  } finally {
    globalThis.Date = Original;
  }
}
export const detail = {
  runId: "synthetic-run",
  label: "Synthetic <&> run",
  labelSource: "name",
  status: "running",
  stopReason: "provider",
  resumedFrom: "synthetic-old",
  maxConcurrency: 2,
  subagentModel: "fake/model",
  scriptPath: "synthetic.dwf.ts",
  supersededBy: "synthetic-next",
  ownedByThisSession: false,
  possiblyInterrupted: true,
  createdAt: 0,
  updatedAt: 1,
  usage: { spentTokens: 7, nodesObserved: 3, nodesRunning: 1, nodesCompleted: 1, nodesFailed: 1 },
  actors: [{ siteId: "synthetic-actor", ordinal: 0, name: "" }],
  logTail: [{ sequence: 0, message: "synthetic log <&>", at: 0 }],
  subagents: [],
  phases: [],
  health: { consecutiveFailures: 0, cachedSteps: 0, pendingQuestionsKnown: true },
  result: { synthetic: true },
  pendingQuestions: [],
  artifacts: [],
};
export const cases: any[] = [
  {},
  { input: null },
  { input: {} },
  { input: { run_id: "" } },
  { input: { run_id: "synthetic-run", cwd: "fake" } },
  ...[
    "missing",
    "null",
    "empty",
    "nonfunction",
    "throw",
    "reject",
    "then-getter-throw",
    "then-throw",
    "queued",
    "double",
  ].map((port) => ({ port })),
  ...[
    undefined,
    null,
    {},
    { ...detail, usage: null },
    { ...detail, actors: [null] },
    { ...detail, logTail: [null] },
    { ...detail, result: null },
    { ...detail, result: undefined },
    {
      ...detail,
      possiblyInterrupted: false,
      stopReason: undefined,
      resumedFrom: undefined,
      scriptPath: undefined,
      maxConcurrency: undefined,
      subagentModel: undefined,
      supersededBy: undefined,
    },
  ].map((outcome) => ({ outcome })),
  ...[
    "context.port",
    "port.method",
    "detail.result",
    "detail.runId",
    "detail.scriptPath",
    "context.cwd",
    "detail.usage",
    "usage.nodesFailed",
    "actor.name",
    "log.at",
  ].flatMap((target) => [1, 2].map((throwAt) => ({ target, throwAt }))),
];
export function fixture(c: any = {}) {
  const tape: string[] = [],
    calls: any[] = [],
    counts = new Map<string, number>(),
    controller = new AbortController(),
    failure = new Error("Synthetic detail failure");
  const read = (key: string, value: any) => {
    tape.push(key);
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    if (c.target === key && c.throwAt === n) throw failure;
    return value;
  };
  const watch = (v: any, prefix: string): any =>
    v !== null && typeof v === "object"
      ? new Proxy(v, {
          get(t, k, r) {
            return read(`${prefix}.${String(k)}`, Reflect.get(t, k, r));
          },
        })
      : v;
  const raw = Object.hasOwn(c, "outcome") ? c.outcome : detail;
  const result =
    raw !== null && typeof raw === "object"
      ? watch(
          {
            ...raw,
            usage: watch(raw.usage, "usage"),
            actors: Array.isArray(raw.actors)
              ? raw.actors.map((a: any) => watch(a, "actor"))
              : raw.actors,
            logTail: Array.isArray(raw.logTail)
              ? raw.logTail.map((a: any) => watch(a, "log"))
              : raw.logTail,
          },
          "detail",
        )
      : raw;
  const port: any = {};
  Object.defineProperty(port, "getRunDetail", {
    get() {
      read("port.method", undefined);
      return function (this: any, ...args: any[]) {
        calls.push({ receiver: this === port, argc: args.length, args });
        tape.push("invoke");
        if (c.port === "throw") throw failure;
        if (c.port === "reject") return Promise.reject(failure);
        if (["then-getter-throw", "then-throw", "queued", "double"].includes(c.port))
          return Object.defineProperty({}, "then", {
            get() {
              read("then.get", undefined);
              if (c.port === "then-getter-throw") throw failure;
              return (resolve: any, reject: any) => {
                tape.push("then.invoke");
                if (c.port === "then-throw") throw failure;
                const finish = () => {
                  resolve(result);
                  if (c.port === "double") {
                    reject(failure);
                    resolve(undefined);
                  }
                };
                if (c.port === "queued") queueMicrotask(finish);
                else finish();
              };
            },
          });
        return result;
      };
    },
  });
  const selected =
    c.port === "missing"
      ? undefined
      : c.port === "null"
        ? null
        : c.port === "empty"
          ? {}
          : c.port === "nonfunction"
            ? { getRunDetail: 7 }
            : port;
  const context: any = { abortSignal: controller.signal, workspaceRoot: "." };
  Object.defineProperties(context, {
    dynamicWorkflowRunPort: { configurable: true, get: () => read("context.port", selected) },
    workingDirectory: { get: () => read("context.cwd", ".") },
  });
  return {
    tape,
    calls,
    context,
    controller,
    selected,
    failure,
    input: Object.hasOwn(c, "input") ? c.input : { run_id: "synthetic-run" },
  };
}
export async function direct(c: any, selected = entry) {
  return clock(async () => {
    const f = fixture(c);
    let fact: any;
    try {
      const output = await selected.handler(f.input, f.context);
      const tape = [...f.tape];
      fact = {
        success: true,
        output: json(output),
        keys: Object.keys(output),
        actorKeys: output.actors?.map((a: any) => Object.keys(a)),
        logKeys: output.logTail?.map((a: any) => Object.keys(a)),
        model: selected.formatModelContent(output),
        tape,
      };
    } catch (error) {
      fact = {
        success: false,
        error: errorShape(error),
        sameFailure: error === f.failure,
        tape: [...f.tape],
      };
    }
    return json({ fact, calls: f.calls });
  });
}
export function executorFixture(c: any = {}, selected = entry) {
  const d = fixture(c),
    f = invocation({ ...selected }),
    contexts: any[] = [];
  f.entry.handler = (input: any, context: any) => {
    contexts.push(context);
    return selected.handler(input, context);
  };
  const r = createToolRegistry();
  r.register(f.entry);
  f.deps.registry = r;
  f.deps.dynamicWorkflowRunPort = d.selected;
  f.deps.getWorkingDirectory = () => ".";
  f.deps.getWorkspaceRoot = () => ".";
  f.call.input = (Object.hasOwn(c, "input") ? c.input : { run_id: "synthetic-run" }) as any;
  if (c.port === "deny") f.behavior.decision = "deny";
  if (c.port === "early") d.controller.abort("Synthetic early abort");
  return {
    ...f,
    d,
    contexts,
    execute: (options: any = {}) =>
      f.run(
        {
          signal: d.controller.signal,
          traceContext: { traceId: "synthetic-trace", spanId: "synthetic-parent" },
          ...options,
        },
        executeToolCall,
      ),
  };
}
export function normalized(f: any, result: any) {
  const spans = f.contexts.map((c: any) => c.spanId);
  assert.ok(spans.every((s: any) => typeof s === "string" && s.length > 0));
  const ids = f.events.map((e: any) => e.payload?.requestId).filter(Boolean);
  for (const id of ids) assert.match(id, /^perm_[a-f0-9-]{36}$/u);
  let text = JSON.stringify(
    json({
      result,
      events: f.events.map((e: any) => ({ type: e.type, payload: e.payload })),
      timeline: f.timeline,
      telemetry: f.observed.telemetry,
      terminal: f.terminal(),
      calls: f.d.calls,
    }),
    (_k, v) => (spans.includes(v) ? "synthetic-span" : v),
  );
  for (const id of ids) text = text.replaceAll(id, "synthetic-permission-id");
  return JSON.parse(text);
}
export async function executor(c: any, selected = entry) {
  return clock(async () => {
    const f = executorFixture(c, selected);
    return normalized(f, await f.execute());
  });
}
