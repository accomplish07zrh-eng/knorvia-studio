// Owned synthetic ports only; source-exposed fixture patterns and retained baseline are disclosed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import dns from "node:dns";
import { invocation, gate } from "./tool-invocation-fixture.js";
import {
  answer,
  contextFields,
  validInput,
  type Scenario,
} from "./escalate-orchestration-cases.js";
export { gate };
export const emitted = process.env.KNORVIA_ESCALATE_ORCHESTRATION_TEST_EMITTED === "1";
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
export const { escalateToolEntry: entry } = await load("tool/handlers/escalate");
export const handlers = await load("tool/handlers/index");
export const { createToolRegistry } = await load("tool/registry");
export const { executeToolCall } = await load("tool/executor/call-runner");
export const { ToolDeadline, executeWithTimeout, linkAbortSignal, resolveTimeoutMs } =
  await load("tool/executor/timeout");
export const { initializeRuntimeTooling } = await load("runtime/helpers/runtime-tools");
export const publicDeclaration = await readFile(
  new URL("../dist/tool/handlers/escalate.d.ts", import.meta.url),
  "utf8",
);
export const archive = JSON.parse(
  await readFile(new URL("./escalate-orchestration-baseline.json", import.meta.url), "utf8"),
);
export const sha = (value: string) => createHash("sha256").update(value).digest("hex");
assert.equal(sha(archive.source), archive.sourceSha256);
assert.equal(sha(archive.compiled), archive.compiledSha256);
const mapped = archive.compiled.replace(/from "([^"]+)"/gu, (_match: string, specifier: string) => {
  const resolved = specifier.startsWith(".")
    ? new URL(
        specifier.replace(/\.js$/u, emitted ? ".js" : ".ts"),
        new URL(
          `../${emitted ? "dist" : "src"}/tool/handlers/escalate.${emitted ? "js" : "ts"}`,
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
).escalateToolEntry;
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
export function fixture(c: Scenario = { label: "owned" }) {
  const tape: string[] = [],
    calls: any[] = [],
    rawCalls: any[] = [],
    counts = new Map<string, number>();
  const controller = new AbortController(),
    failure = new Error("Synthetic port failure");
  const input = Object.hasOwn(c, "input") ? c.input : validInput;
  const outcome = Object.hasOwn(c, "outcome") ? c.outcome : answer;
  function read(target: string, value: any) {
    tape.push(target);
    const count = (counts.get(target) ?? 0) + 1;
    counts.set(target, count);
    if (c.probe?.target === target && c.probe.throwAt === count) throw failure;
    return value;
  }
  const observedInput =
    input !== null && typeof input === "object"
      ? new Proxy(input as object, {
          get(target, key, receiver) {
            return read(`input.${String(key)}`, Reflect.get(target, key, receiver));
          },
        })
      : input;
  const observedOutcome =
    outcome !== null && typeof outcome === "object"
      ? new Proxy(outcome as object, {
          get(target, key, receiver) {
            return read(`outcome.${String(key)}`, Reflect.get(target, key, receiver));
          },
        })
      : outcome;
  const explicitTrace = Object.hasOwn(c, "trace") ? c.trace : undefined;
  const pending = gate<any>();
  function method(this: unknown, ...args: any[]) {
    tape.push("invoke");
    rawCalls.push(args);
    calls.push({
      receiver: this === port || this === secondPort,
      secondReceiver: this === secondPort,
      argc: args.length,
      request: json(args[0]),
      requestKeys: Object.keys(args[0]),
      traceIdentity: explicitTrace == null ? undefined : args[0].trace === explicitTrace,
      traceKeys:
        args[0].trace !== null && typeof args[0].trace === "object"
          ? Object.keys(args[0].trace)
          : undefined,
    });
    if (c.port === "throw") throw failure;
    if (c.port === "throw-value") throw "Synthetic thrown value";
    if (c.port === "reject") return Promise.reject(failure);
    if (c.port === "reject-value") return Promise.reject("Synthetic rejected value");
    if (c.port === "delay") {
      queueMicrotask(() => pending.resolve(observedOutcome));
      return pending.promise;
    }
    if (c.port?.startsWith("then") || c.port === "double-settle")
      return Object.defineProperty({}, "then", {
        enumerable: true,
        configurable: true,
        get() {
          read("thenable.then", undefined);
          if (c.port === "then-getter-throw") throw failure;
          return (resolve: any, reject: any) => {
            tape.push("thenable.invoke");
            if (c.port === "thenable-throw") throw failure;
            resolve(observedOutcome);
            if (c.port === "double-settle") {
              reject(failure);
              resolve(answer);
            }
          };
        },
      });
    return observedOutcome;
  }
  const port: any = {};
  Object.defineProperty(port, "escalate", {
    configurable: true,
    get: () => read("port.escalate", method),
  });
  const secondPort = { escalate: method };
  const selected =
    c.port === "missing"
      ? undefined
      : c.port === "empty"
        ? {}
        : c.port === "nonfunction"
          ? { escalate: 7 }
          : port;
  const values: any = {
    workflowEscalatePort: selected,
    toolCallId: "synthetic-call",
    traceContext: explicitTrace,
    traceId: "synthetic-trace",
    spanId: "synthetic-span",
    parentSpanId: "synthetic-parent",
    sessionId: "synthetic-session",
    turnId: "synthetic-turn",
    runtimeScope: c.scope ?? "main",
    abortSignal: controller.signal,
  };
  const context: any = { workingDirectory: ".", workspaceRoot: "." };
  for (const field of contextFields)
    Object.defineProperty(context, field, {
      configurable: true,
      get: () => {
        const value =
          field === "workflowEscalatePort" && (counts.get(`context.${field}`) ?? 0) > 0 && c.swap
            ? c.swap === "missing"
              ? undefined
              : c.swap === "empty"
                ? {}
                : secondPort
            : values[field];
        return read(`context.${field}`, value);
      },
    });
  return {
    context,
    input: observedInput,
    outcome: observedOutcome,
    port,
    selected,
    tape,
    calls,
    rawCalls,
    controller,
    failure,
    read,
    pending,
  };
}
export async function observeDirect(c: Scenario, selected = entry) {
  const f = fixture(c);
  let fact: any;
  try {
    const output = await selected.handler(f.input, f.context);
    // Capture read order before any assertion/serialization can read the synthetic outcome again.
    fact = {
      success: true,
      output: json(output),
      keys: Object.keys(output),
      descriptors: Object.fromEntries(
        Object.entries(Object.getOwnPropertyDescriptors(output)).map(([key, d]: any) => [
          key,
          { enumerable: d.enumerable, configurable: d.configurable, writable: d.writable },
        ]),
      ),
      plain: Object.getPrototypeOf(output) === Object.prototype,
      modelContent: selected.formatModelContent(output),
    };
  } catch (error) {
    fact = { success: false, error: errorShape(error), sameFailure: error === f.failure };
  }
  return json({ fact, tape: f.tape, calls: f.calls });
}
export function executorFixture(c: Scenario, selected = entry) {
  const direct = fixture(c),
    f = invocation({ ...selected }),
    contexts: any[] = [];
  f.entry.handler = (input: any, context: any) => {
    contexts.push(context);
    return selected.handler(input, context);
  };
  const registry = createToolRegistry();
  registry.register(f.entry);
  f.deps.registry = registry;
  f.deps.workflowEscalatePort = direct.selected;
  f.deps.runtimeScope = (c.scope ?? "main") as any;
  f.call.input = (Object.hasOwn(c, "input") ? c.input : validInput) as any;
  if (c.port === "deny" || c.port === "ask") f.behavior.decision = c.port;
  if (c.port === "ask") f.behavior.reply = { decision: "deny" };
  if (c.port === "hook")
    f.behavior.hook = async () => ({ additionalContexts: [], permissionBehavior: "deny" });
  if (c.port === "early") direct.controller.abort("Synthetic early abort");
  const execute = (options: any = {}) =>
    f.run(
      {
        signal: direct.controller.signal,
        traceContext: { traceId: "synthetic-executor-trace", spanId: "synthetic-parent" },
        ...options,
      },
      executeToolCall,
    );
  return { ...f, direct, contexts, execute };
}
export function normalizedExecutor(f: any, result: any) {
  const spans = f.contexts.map((context: any) => context.spanId);
  assert.ok(spans.every((span: any) => typeof span === "string" && span.length > 0));
  const traceIdentity = f.direct.rawCalls.map((args: any) =>
    f.contexts.some((context: any) => context.traceContext === args[0].trace),
  );
  assert.ok(traceIdentity.every(Boolean));
  const requestIds = f.events
    .map((event: any) => event.payload?.requestId)
    .filter((id: any) => id !== undefined);
  for (const id of requestIds) assert.match(id, /^perm_[a-f0-9-]{36}$/u);
  assert.ok(new Set(requestIds).size <= 1);
  const serialized = JSON.stringify(
    json({
      result,
      timeline: f.timeline,
      events: f.events.map((e: any) => ({ type: e.type, payload: e.payload })),
      telemetry: f.observed.telemetry,
      terminal: f.terminal(),
      calls: f.direct.calls,
      traceIdentity,
      signals: f.contexts.map((context: any) => context.abortSignal.aborted),
    }),
    (_key, value) => (spans.includes(value) ? "synthetic-generated-span" : value),
  );
  return JSON.parse(
    [...new Set(requestIds)].reduce(
      (text: string, id: any) => text.replaceAll(id, "synthetic-generated-permission-id"),
      serialized,
    ),
  );
}
export async function observeExecutor(c: Scenario, selected = entry) {
  const f = executorFixture(c, selected);
  return normalizedExecutor(f, await f.execute());
}
export function registryObservations() {
  return [
    {},
    { includeEscalate: false },
    { includeEscalate: true },
    { includeEscalate: 1 },
    { includeEscalate: true, includeDynamicWorkflow: false },
    { includeEscalate: true, allowedTools: ["escalate"] },
    { includeEscalate: true, allowedTools: [] },
    { includeEscalate: true, disallowedTools: ["escalate"] },
  ].map((options) => {
    const registry = createToolRegistry();
    handlers.registerBuiltInTools(registry, options);
    const selected = registry.get("escalate");
    return {
      options,
      registered: !!selected,
      sameEntry: selected === entry,
      aliases: selected?.aliases,
    };
  });
}
export function runtimeObservations() {
  return [false, true].flatMap((present) =>
    ["main", "workflow_child", "subagent_child"].map((taskType) => {
      const registry = createToolRegistry(),
        runtime: any = { registry, config: { taskType, dynamicWorkflowEnabled: false } },
        port = {
          escalate() {
            throw new Error("Synthetic runtime port must never execute");
          },
        },
        executor = {};
      const result = initializeRuntimeTooling(
        runtime,
        { toolExecutor: executor, ...(present ? { workflowEscalatePort: port } : {}) },
        "synthetic-runtime-session",
      );
      return {
        present,
        taskType,
        registered: registry.has("escalate"),
        sameExecutor: result.executor === executor,
      };
    }),
  );
}
