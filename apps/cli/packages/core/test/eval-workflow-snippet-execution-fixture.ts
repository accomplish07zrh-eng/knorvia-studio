// Synthetic execution fixtures; historical implementation and public prose stay attributed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { TraceContext } from "@knorvia/contracts";
import { invocation, gate } from "./tool-invocation-fixture.js";
import {
  clock,
  emitted,
  errorShape,
  json,
  load,
  normalized,
  sha,
} from "./workflow-run-summary-fixture.js";
export { clock, gate, sha };
const archive = JSON.parse(
  await readFile(
    new URL("./eval-workflow-snippet-execution-baseline.json", import.meta.url),
    "utf8",
  ),
);
const pins = JSON.parse(
  await readFile(
    new URL("./eval-workflow-snippet-execution-current.json", import.meta.url),
    "utf8",
  ),
);
const root = new URL("../", import.meta.url);
const modulePath = "tool/handlers/eval-workflow-snippet";
type ReadArtifact = (url: URL) => Promise<string>;
const read: ReadArtifact = (url) => readFile(url, "utf8");
export async function loadCurrent(readArtifact = read) {
  for (const [path, pin] of [
    [`src/${modulePath}.ts`, pins.sourceSha256],
    [`dist/${modulePath}.js`, pins.emittedSha256],
    [`dist/${modulePath}.d.ts`, pins.declarationSha256],
  ])
    assert.equal(sha(await readArtifact(new URL(path, root))), pin, path);
  return load(modulePath);
}
export const { evalWorkflowSnippetToolEntry: current } = await loadCurrent();
const code = await read(new URL(`dist/${modulePath}.js`, root));
const start = code.indexOf("const evalWorkflowSnippetHandler =");
const end = code.indexOf("export const evalWorkflowSnippetToolEntry =");
assert.ok(start > 0 && end > start);
assert.equal(sha(code.slice(0, start)), archive.emittedHeaderSha256);
assert.equal(sha(code.slice(end)), archive.emittedTailSha256);
assert.equal(sha(archive.owner), archive.ownerSha256);
const oldCode = code.slice(0, start) + archive.owner + code.slice(end);
assert.equal(sha(oldCode), archive.emittedSha256);
assert.equal(pins.declarationSha256, archive.declarationSha256);
const mapped = oldCode.replace(/from "([^"]+)"/gu, (_match, specifier: string) => {
  const target = specifier.startsWith(".")
    ? new URL(
        specifier.replace(/\.js$/u, emitted ? ".js" : ".ts"),
        new URL(`${emitted ? "dist" : "src"}/tool/handlers/`, root),
      ).href
    : import.meta.resolve(specifier);
  return `from ${JSON.stringify(target)}`;
});
export const { evalWorkflowSnippetToolEntry: baseline } = await import(
  `data:text/javascript;base64,${Buffer.from(mapped).toString("base64")}`
);
export const { createToolRegistry } = await load("tool/registry");
export const handlers = await load("tool/handlers/index");
const { executeToolCall } = await load("tool/executor/call-runner");
export const { createWorkflowObservationDisplay } = await load(
  "tool/executor/workflow-observation-display",
);
export const diagnostic = { code: 7, line: 2, column: 3, message: "Synthetic diagnostic" };
export const completed = {
  kind: "completed",
  artifact: { synthetic: true },
  logs: ["owned log"],
  logsTruncated: false,
};
export const cases: any[] = [
  { name: "completed" },
  { name: "empty", outcome: { kind: "completed", logs: [], logsTruncated: true } },
  {
    name: "failed",
    outcome: {
      kind: "failed",
      error: { code: "SYNTHETIC", message: "Owned failure" },
      logs: ["a", "b"],
      logsTruncated: true,
    },
  },
  { name: "diagnostics", outcome: { kind: "diagnostics", diagnostics: [diagnostic] } },
  {
    name: "path-location",
    input: { code: "return 7;", path: "/synthetic/owned.dwf.ts" },
    outcome: { kind: "diagnostics", diagnostics: [diagnostic] },
  },
  { name: "explicit-timeout", input: { code: "return 7;", timeoutMs: 1000 }, fallbackTrace: true },
  { name: "duration-clamp", backwards: true },
  { name: "unavailable", port: "missing" },
  { name: "schema", input: { code: "", extra: true } },
  { name: "unresolved", input: { path: "synthetic.dwf.ts" } },
  { name: "unknown-kind", outcome: { ...completed, kind: "synthetic-unknown" } },
  ...["null", "nonfunction", "throw", "reject", "queued", "hostile"].map((port) => ({
    name: port,
    port,
  })),
  {
    name: "diagnostics-second-read",
    outcome: { kind: "diagnostics", diagnostics: [diagnostic] },
    throwAt: "diagnostics:2",
  },
  {
    name: "failure-logs-before-error",
    outcome: {
      kind: "failed",
      error: { code: "SYNTHETIC", message: "Owned failure" },
      logs: [],
      logsTruncated: false,
    },
    throwAt: "logs:2",
  },
  { name: "artifact-before-logs", throwAt: "artifact:1" },
];
export async function observe(selected: any, c: any) {
  const tape: string[] = [],
    calls: any[] = [],
    counts = new Map<string, number>();
  const failure = new Error("Synthetic port failure");
  const watch = (target: any, prefix = "") =>
    new Proxy(target, {
      get(t, k, receiver) {
        if (typeof k !== "string") return Reflect.get(t, k, receiver);
        const key = prefix + k;
        tape.push(key);
        const n = (counts.get(key) ?? 0) + 1;
        counts.set(key, n);
        if (c.throwAt === `${key}:${n}`) throw failure;
        return Reflect.get(t, k, receiver);
      },
    });
  const raw = c.outcome ?? completed;
  const outcome = watch({ ...raw, ...(raw.error ? { error: watch(raw.error, "error.") } : {}) });
  const signal = new AbortController().signal;
  const trace = { traceId: "synthetic-trace", spanId: "synthetic-span" };
  let receiver: any;
  const port: any = {
    evalSnippet(this: any, request: any, options: any) {
      tape.push("invoke");
      calls.push({ receiver: this === receiver, request, signal: options.signal === signal });
      if (c.port === "throw") throw failure;
      if (c.port === "reject") return Promise.reject(failure);
      if (c.port === "queued" || c.port === "hostile")
        return {
          then(resolve: any, reject: any) {
            tape.push("then");
            queueMicrotask(() => {
              resolve(outcome);
              if (c.port === "hostile") {
                reject(failure);
                resolve(undefined);
              }
            });
          },
        };
      return Promise.resolve(outcome);
    },
  };
  receiver =
    c.port === "missing"
      ? undefined
      : c.port === "null"
        ? null
        : c.port === "nonfunction"
          ? { evalSnippet: 7 }
          : watch(port, "port.");
  const context = watch(
    {
      workingDirectory: "/synthetic",
      dynamicWorkflowSnippetPort: receiver,
      abortSignal: signal,
      traceContext: c.fallbackTrace ? undefined : trace,
      traceId: "synthetic-trace",
      spanId: "synthetic-span",
      parentSpanId: "synthetic-parent",
      sessionId: "synthetic-session",
      turnId: "synthetic-turn",
    },
    "context.",
  );
  const now = Date.now;
  let ticks = 0;
  Date.now = () => {
    tape.push("clock");
    return ++ticks === 1 ? 100 : c.backwards ? 90 : 107;
  };
  try {
    const output = await selected.handler(c.input ?? { code: "return 7;" }, context);
    const projectionTape = [...tape];
    return {
      ok: true,
      output: json(output),
      tape: projectionTape,
      calls: json(calls),
      ownKeys: Object.keys(output),
      arrayIdentity: {
        diagnostics: output.diagnostics === raw.diagnostics,
        logs: output.logs === raw.logs,
      },
      model: selected.formatModelContent(output),
      display: createWorkflowObservationDisplay("EvalWorkflowSnippet", output),
    };
  } catch (error) {
    return {
      ok: false,
      error: errorShape(error),
      sameFailure: error === failure,
      tape: [...tape],
      calls: json(calls),
    };
  } finally {
    Date.now = now;
  }
}
export const approvalCases = [
  { input: {}, gate: "proceed" },
  { input: { path: "synthetic.dwf.ts" }, gate: "proceed" },
  { input: { code: "return 7;" }, gate: "proceed" },
  { input: { code: "return missingSyntheticName;" }, gate: "proceed" },
  { input: { code: 'return await world.run("synthetic-never-run", ["owned"]);' }, gate: "ask" },
  {
    input: { code: 'const command = "synthetic-never-run"; return await world.run(command);' },
    gate: "proceed",
  },
];
export function consumer(
  selected: any,
  mode = "normal",
  label = "owned",
  shared?: ReturnType<typeof gate<any>>,
) {
  const controller = new AbortController(),
    calls: any[] = [],
    contexts: any[] = [],
    entered = gate();
  const f = invocation({ ...selected });
  f.entry.handler = (input, context) => {
    contexts.push(context);
    return selected.handler(input, context);
  };
  f.entry.formatModelContent = (output) => {
    if (mode === "model-begin")
      queueMicrotask(() => controller.abort("Synthetic completion abort"));
    const content = selected.formatModelContent(output);
    if (mode === "model-end") queueMicrotask(() => controller.abort("Synthetic completion abort"));
    return content;
  };
  const registry = createToolRegistry();
  registry.register(f.entry);
  f.deps.registry = registry;
  const port = {
    evalSnippet(this: any, request: any, options: any) {
      calls.push({
        receiver: this === port,
        request,
        signal: options.signal instanceof AbortSignal,
      });
      entered.resolve();
      if (mode === "throw") throw new Error("Synthetic consumer failure");
      if (mode === "reject") return Promise.reject(new Error("Synthetic consumer failure"));
      if (shared) return shared.promise;
      if (mode === "queued" || mode === "hostile")
        return {
          then(resolve: any, reject: any) {
            queueMicrotask(() => {
              resolve({ ...completed, artifact: label });
              if (mode === "hostile") {
                reject(new Error("Synthetic stale rejection"));
                resolve(undefined);
              }
            });
          },
        };
      if (mode === "settlement")
        queueMicrotask(() => controller.abort("Synthetic completion abort"));
      return Promise.resolve({ ...completed, artifact: label });
    },
  };
  f.deps.dynamicWorkflowSnippetPort = port as any;
  f.call.input = { code: mode === "ask-refuse" ? approvalCases[4].input.code : "return 7;" };
  if (mode === "deny") f.behavior.decision = "deny";
  if (mode === "ask-refuse" || mode === "pure-ask") f.behavior.decision = "ask";
  if (mode === "ask-refuse") f.behavior.reply = { decision: "deny" };
  if (mode === "early") controller.abort("Synthetic early abort");
  return {
    ...f,
    controller,
    calls,
    entered,
    async run() {
      const result = await f.run(
        {
          signal: controller.signal,
          traceContext: { traceId: "synthetic-trace", spanId: "synthetic-parent" } as TraceContext,
        },
        executeToolCall,
      );
      return normalized({ ...f, contexts, d: { calls } }, result);
    },
  };
}
