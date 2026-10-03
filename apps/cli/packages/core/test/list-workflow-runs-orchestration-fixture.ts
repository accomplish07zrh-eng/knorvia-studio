// Owned synthetic ports only; source-exposed fixture patterns and retained baseline are disclosed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import dns from "node:dns";
import { invocation, gate } from "./tool-invocation-fixture.js";
export { gate };
export const emitted = process.env.KNORVIA_LIST_WORKFLOW_RUNS_ORCHESTRATION_TEST_EMITTED === "1";
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
export const { listWorkflowRunsToolEntry: entry } = await load("tool/handlers/list-workflow-runs");
export const handlers = await load("tool/handlers/index");
export const { createToolRegistry } = await load("tool/registry");
export const { executeToolCall } = await load("tool/executor/call-runner");
export const { ToolDeadline, executeWithTimeout, linkAbortSignal, resolveTimeoutMs } =
  await load("tool/executor/timeout");
export const { initializeRuntimeTooling } = await load("runtime/helpers/runtime-tools");
export const publicDeclaration = await readFile(
  new URL("../dist/tool/handlers/list-workflow-runs.d.ts", import.meta.url),
  "utf8",
);
export const archive = JSON.parse(
  await readFile(
    new URL("./list-workflow-runs-orchestration-baseline.json", import.meta.url),
    "utf8",
  ),
);
export const sha = (value: string) => createHash("sha256").update(value).digest("hex");
assert.equal(sha(archive.source), archive.sourceSha256);
assert.equal(sha(archive.compiled), archive.compiledSha256);
const mapped = archive.compiled.replace(/from "([^"]+)"/gu, (_match: string, specifier: string) => {
  const resolved = specifier.startsWith(".")
    ? new URL(
        specifier.replace(/\.js$/u, emitted ? ".js" : ".ts"),
        new URL(
          `../${emitted ? "dist" : "src"}/tool/handlers/list-workflow-runs.${emitted ? "js" : "ts"}`,
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
).listWorkflowRunsToolEntry;
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
export const row = {
  runId: "synthetic-run",
  label: "Synthetic <&> run",
  labelSource: "name",
  status: "stopped",
  stopReason: "user",
  resumedFrom: "synthetic-old",
  supersededBy: "synthetic-new",
  ownedByThisSession: false,
  possiblyInterrupted: true,
  createdAt: 0,
  updatedAt: 1,
  spentTokens: 7,
};
export const cases: any[] = [
  ...[undefined, -10, 0, 1.7, 20, 50, 100, NaN, Infinity, null, "20"].map((limit) => ({
    label: `limit:${String(limit)}`,
    input: { limit },
  })),
  ...[undefined, [], ["running", "pending", "running"], ["bad"], null].map((statuses) => ({
    label: `statuses:${JSON.stringify(statuses)}`,
    input: { statuses },
  })),
  ...[null, 7, [], { cwd: "synthetic-other" }].map((input) => ({
    label: `invalid:${JSON.stringify(input)}`,
    input,
  })),
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
  ].map((port) => ({ label: port, port })),
  ...[
    null,
    {},
    { runs: null },
    { runs: [null] },
    { runs: [] },
    { runs: [row, row], truncated: "yes" },
    {
      runs: [
        {
          ...row,
          stopReason: undefined,
          resumedFrom: undefined,
          supersededBy: undefined,
          possiblyInterrupted: false,
        },
      ],
      truncated: false,
    },
  ].map((outcome) => ({ label: `result:${JSON.stringify(outcome)}`, outcome })),
  ...[
    "context.dynamicWorkflowRunPort",
    "port.listRuns",
    "context.workingDirectory",
    "result.runs",
    "row.runId",
    "row.stopReason",
    "row.spentTokens",
    "result.truncated",
  ].flatMap((target) =>
    [1, 2].map((throwAt) => ({ label: `throw:${target}:${throwAt}`, target, throwAt })),
  ),
];
export function fixture(c: any = {}) {
  const tape: string[] = [],
    calls: any[] = [],
    counts = new Map<string, number>();
  const failure = new Error("Synthetic journal failure"),
    controller = new AbortController();
  const read = (key: string, value: any) => {
    tape.push(key);
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    if (c.target === key && c.throwAt === n) throw failure;
    return value;
  };
  const watch = (value: any, prefix: string): any =>
    value !== null && typeof value === "object"
      ? new Proxy(value, {
          get(t, k, r) {
            return read(`${prefix}.${String(k)}`, Reflect.get(t, k, r));
          },
        })
      : value;
  const supplied = Object.hasOwn(c, "outcome") ? c.outcome : { runs: [row], truncated: true };
  const result =
    supplied !== null && typeof supplied === "object"
      ? watch(
          {
            ...supplied,
            runs: Array.isArray(supplied.runs)
              ? supplied.runs.map((r: any) => watch(r, "row"))
              : supplied.runs,
          },
          "result",
        )
      : supplied;
  const port: any = {};
  const method = function (this: any, ...args: any[]) {
    calls.push({
      receiver: this === port,
      argc: args.length,
      request: json(args[0]),
      keys: Object.keys(args[0]),
    });
    tape.push("invoke");
    if (c.port === "throw") throw failure;
    if (c.port === "reject") return Promise.reject(failure);
    if (["then-getter-throw", "then-throw", "queued", "double"].includes(c.port))
      return Object.defineProperty({}, "then", {
        get() {
          read("thenable.then", undefined);
          if (c.port === "then-getter-throw") throw failure;
          return (resolve: any, reject: any) => {
            tape.push("thenable.invoke");
            if (c.port === "then-throw") throw failure;
            const finish = () => {
              resolve(result);
              if (c.port === "double") {
                reject(failure);
                resolve({ runs: [] });
              }
            };
            if (c.port === "queued") queueMicrotask(finish);
            else finish();
          };
        },
      });
    return result;
  };
  Object.defineProperty(port, "listRuns", { get: () => read("port.listRuns", method) });
  const selected =
    c.port === "missing"
      ? undefined
      : c.port === "null"
        ? null
        : c.port === "empty"
          ? {}
          : c.port === "nonfunction"
            ? { listRuns: 7 }
            : port;
  const context: any = { workspaceRoot: "synthetic-workspace", abortSignal: controller.signal };
  Object.defineProperties(context, {
    dynamicWorkflowRunPort: {
      configurable: true,
      get: () => read("context.dynamicWorkflowRunPort", selected),
    },
    workingDirectory: { get: () => read("context.workingDirectory", "synthetic/../project/é") },
  });
  return {
    tape,
    calls,
    context,
    selected,
    controller,
    failure,
    input: Object.hasOwn(c, "input") ? c.input : {},
    result,
  };
}
export async function direct(c: any, selected = entry) {
  const f = fixture(c);
  let fact: any;
  try {
    const output = await selected.handler(f.input, f.context);
    const tape = [...f.tape];
    fact = {
      success: true,
      output: json(output),
      keys: Object.keys(output),
      rowKeys: output.runs?.map((r: any) => Object.keys(r)),
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
}
export function executorFixture(c: any = {}, selected = entry) {
  const d = fixture(c),
    f = invocation({ ...selected }),
    contexts: any[] = [];
  f.entry.handler = (input: any, context: any) => {
    contexts.push(context);
    return selected.handler(input, context);
  };
  const registry = createToolRegistry();
  registry.register(f.entry);
  f.deps.registry = registry;
  f.deps.dynamicWorkflowRunPort = d.selected;
  f.call.input = (Object.hasOwn(c, "input") ? c.input : {}) as any;
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
export function registry() {
  return [
    {},
    { includeDynamicWorkflow: false },
    { includeDynamicWorkflow: true },
    { includeDynamicWorkflow: true, allowedTools: ["ListWorkflowRuns"] },
    { includeDynamicWorkflow: true, disallowedTools: ["ListWorkflowRuns"] },
  ].map((options) => {
    const r = createToolRegistry();
    handlers.registerBuiltInTools(r, options);
    return {
      options,
      present: r.has("ListWorkflowRuns"),
      same: r.get("ListWorkflowRuns") === entry,
    };
  });
}
