// Owned synthetic ports only; source-exposed fixture patterns and retained baseline are disclosed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import dns from "node:dns";
import { invocation, gate } from "./tool-invocation-fixture.js";
export { gate };
export const emitted = process.env.KNORVIA_LIST_SAVED_WORKFLOWS_MODEL_TEST_EMITTED === "1";
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
export const { listSavedWorkflowsToolEntry: entry } = await load(
  "tool/handlers/list-saved-workflows",
);
export const handlers = await load("tool/handlers/index");
export const { createToolRegistry } = await load("tool/registry");
export const { executeToolCall } = await load("tool/executor/call-runner");
export const { ToolDeadline, executeWithTimeout, linkAbortSignal, resolveTimeoutMs } =
  await load("tool/executor/timeout");
export const { initializeRuntimeTooling } = await load("runtime/helpers/runtime-tools");
export const publicDeclaration = await readFile(
  new URL("../dist/tool/handlers/list-saved-workflows.d.ts", import.meta.url),
  "utf8",
);
export const archive = JSON.parse(
  await readFile(new URL("./list-saved-workflows-model-baseline.json", import.meta.url), "utf8"),
);
export const sha = (value: string) => createHash("sha256").update(value).digest("hex");
assert.equal(sha(archive.source), archive.sourceSha256);
assert.equal(sha(archive.compiled), archive.compiledSha256);
const mapped = archive.compiled.replace(/from "([^"]+)"/gu, (_match: string, specifier: string) => {
  const resolved = specifier.startsWith(".")
    ? new URL(
        specifier.replace(/\.js$/u, emitted ? ".js" : ".ts"),
        new URL(
          `../${emitted ? "dist" : "src"}/tool/handlers/list-saved-workflows.${emitted ? "js" : "ts"}`,
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
).listSavedWorkflowsToolEntry;
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
  name: 'synthetic<&"',
  description: "Synthetic description\nsecond line",
  scope: "project",
  path: "synthetic.dwf.ts",
  whenToUse: "",
  args: {
    z: { type: "json", required: true, default: null, description: "" },
    a: { type: "boolean", required: false, default: false },
    n: { type: "number", default: 0 },
  },
};
export const cases: any[] = [
  {},
  { output: null },
  { output: {} },
  { output: { workflows: [] } },
  { output: { workflows: [], invalid: [] } },
  { output: { workflows: [], invalid: [{ path: 'synthetic<&"', reason: "synthetic error" }] } },
  { output: { workflows: [row, row], invalid: [{ path: "synthetic", reason: "bad" }] } },
  { output: { workflows: [{ ...row, scope: "bad" }] } },
  { output: { workflows: [{ ...row, args: { a: { type: "bad" } } }] } },
  ...[undefined, "", null, false, 0, {}, [], "<&>"].map((value) => ({ value, defaultCase: true })),
  ...["throw", "circular", "bigint", "undefined", "getter"].map((flavor) => ({ flavor })),
];
export function output(c: any = {}) {
  if (Object.hasOwn(c, "output")) return c.output;
  let value = c.defaultCase
    ? c.value
    : {
        toJSON() {
          if (c.flavor === "throw") throw new Error("Synthetic default failure");
          return c.flavor === "undefined" ? undefined : "synthetic default";
        },
      };
  if (c.flavor === "circular") {
    value = {};
    value.self = value;
  }
  if (c.flavor === "bigint") value = 1n;
  if (c.flavor === "getter")
    value = Object.defineProperty({}, "toJSON", {
      get() {
        throw new Error("Synthetic toJSON getter failure");
      },
    });
  return {
    workflows: [{ ...row, args: { ...row.args, synthetic: { type: "json", default: value } } }],
  };
}
export function direct(c: any, selected = entry) {
  const tape: string[] = [];
  const raw = output(c);
  const observed =
    raw !== null && typeof raw === "object"
      ? new Proxy(raw, {
          get(t, k, r) {
            tape.push(String(k));
            return Reflect.get(t, k, r);
          },
        })
      : raw;
  try {
    return { success: true, model: selected.formatModelContent(observed), tape };
  } catch (error) {
    return { success: false, error: errorShape(error), tape };
  }
}
export function executorFixture(selected = entry, c: any = {}) {
  const f = invocation({ ...selected }),
    controller = new AbortController(),
    contexts: any[] = [],
    calls: any[] = [];
  const listing = output(c);
  const port = {
    list(this: any) {
      assert.equal(this, port);
      calls.push("synthetic-list");
      if (c.reject) return Promise.reject(new Error("Synthetic listing rejection"));
      if (c.queued)
        return Object.defineProperty({}, "then", {
          value(resolve: any) {
            queueMicrotask(() => resolve(listing));
          },
        });
      return Promise.resolve(listing);
    },
  };
  f.entry.handler = (_input: any, context: any) => {
    contexts.push(context);
    return port.list();
  };
  const registry = createToolRegistry();
  registry.register(f.entry);
  f.deps.registry = registry;
  f.deps.getWorkingDirectory = () => ".";
  f.deps.getWorkspaceRoot = () => ".";
  f.call.input = {};
  if (c.deny) f.behavior.decision = "deny";
  if (c.early) controller.abort("Synthetic early abort");
  return {
    ...f,
    controller,
    contexts,
    calls,
    execute: (options: any = {}) =>
      f.run(
        {
          signal: controller.signal,
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
      calls: f.calls,
    }),
    (_k, v) => (spans.includes(v) ? "synthetic-span" : v),
  );
  for (const id of ids) text = text.replaceAll(id, "synthetic-permission-id");
  return JSON.parse(text);
}
export async function executor(c: any = {}, selected = entry) {
  return clock(async () => {
    const f = executorFixture(selected, c);
    return normalized(f, await f.execute());
  });
}
export async function edge(selected: any, depth: number, early = false) {
  return clock(async () => {
    const f = executorFixture(selected, { early });
    let fired = false,
      calls = 0;
    const value = {
      toJSON() {
        calls++;
        if (!fired) {
          fired = true;
          const queue = (n: number) =>
            n === 0
              ? f.controller.abort("Synthetic projection-completion abort")
              : queueMicrotask(() => queue(n - 1));
          queue(depth);
        }
        return "synthetic default";
      },
    };
    f.entry.handler = (_input: any, context: any) => {
      f.contexts.push(context);
      return Promise.resolve({
        workflows: [{ ...row, args: { x: { type: "json", default: value } } }],
      });
    };
    const result = await f.execute();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.terminal().length, 1);
    assert.equal(
      f.events.filter((e: any) => ["tool_call_result", "tool_call_error"].includes(e.type)).length,
      early ? 0 : 1,
    );
    return { depth, early, fired, observed: normalized(f, result), calls };
  });
}
