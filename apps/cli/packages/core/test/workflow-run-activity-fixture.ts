// Owned synthetic activity rows; archived publisher-derived prose remains attributed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  emitted,
  load,
  sha,
  detail,
  clock,
  json,
  errorShape,
  entry,
  handlers,
  createToolRegistry,
  executorFixture,
  normalized,
  gate,
} from "./workflow-run-summary-fixture.js";
export { emitted, sha, entry, handlers, createToolRegistry };
export const archive = JSON.parse(
  await readFile(new URL("./workflow-run-activity-baseline.json", import.meta.url), "utf8"),
);
assert.equal(sha(archive.compiled), archive.compiledSha256);
function moduleUrl(compiled: string, name: string, overrides: Record<string, string> = {}) {
  const mapped = compiled.replace(/from "([^"]+)"/gu, (_match, specifier) => {
    const resolved =
      overrides[specifier] ??
      (specifier.startsWith(".")
        ? new URL(
            specifier.replace(/\.js$/u, emitted ? ".js" : ".ts"),
            new URL(
              `../${emitted ? "dist" : "src"}/tool/handlers/${name}.${emitted ? "js" : "ts"}`,
              import.meta.url,
            ),
          ).href
        : import.meta.resolve(specifier));
    return `from ${JSON.stringify(resolved)}`;
  });
  return `data:text/javascript;base64,${Buffer.from(mapped).toString("base64")}`;
}
const oldUrl = moduleUrl(archive.compiled, "get-workflow-run-format-roster");
export const old = await import(oldUrl);
export const current = await load("tool/handlers/get-workflow-run-format-roster");
const parent = await readFile(
  new URL("../dist/tool/handlers/get-workflow-run-format.js", import.meta.url),
  "utf8",
);
assert.equal(sha(parent), archive.parentEmittedSha256);
const oldFormat = (
  await import(
    moduleUrl(parent, "get-workflow-run-format", {
      "./get-workflow-run-format-roster.js": oldUrl,
    })
  )
).formatGetWorkflowRunModelContent;
export const oldEntry = { ...entry, formatModelContent: oldFormat };
export const declaration = await readFile(
  new URL("../dist/tool/handlers/get-workflow-run-format-roster.d.ts", import.meta.url),
  "utf8",
);
export const rowCases: any[] = [
  ...["idle", "executing", "waiting", "parked", "done", "failed", "unfinished", "unknown"].map(
    (state) => ({ state }),
  ),
  ...[
    "no-ask",
    "no-wait",
    "slot",
    "unknown-wait",
    "missing-question",
    "no-parked-id",
    "zero",
    "absent",
    "empty",
    "sparse",
    "long-name",
    "ask-null",
    "wait-null",
    "tool-null",
    "step-symbol",
    "tools-symbol",
    "state-changing",
    "ask-changing",
    "tool-changing",
    "parked-changing",
    "turn-changing",
    "counts-changing",
    "step-coercion",
    "ordinal-coercion",
  ].map((kind) => ({ kind })),
  ...[
    ["agent.state", 3],
    ["agent.currentAsk", 2],
    ["ask.actorSeq", 2],
    ["wait.cause", 1],
    ["tool.target", 2],
    ["tool.name", 1],
    ["agent.stepsFailed", 2],
  ].map(([target, at]) => ({ kind: "throw", target, at })),
];
export function rowFixture(c: any = {}) {
  const tape: any[] = [],
    counts = new Map<string, number>(),
    failure = new Error("Synthetic activity failure");
  const read = (key: string, value: any) => {
    tape.push(key);
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    if (c.target === key && c.at === n) throw failure;
    if (c.kind === "state-changing" && key === "agent.state")
      return ["executing", "executing", "parked", "waiting", "unfinished"][n - 1] ?? "idle";
    if (c.kind === "ask-changing" && key === "agent.currentAsk" && n === 2) return undefined;
    if (c.kind === "parked-changing" && key === "agent.parkedOn" && n === 3)
      return "synthetic-missing";
    if (c.kind === "turn-changing" && key === "ask.turn" && n === 2) return undefined;
    if (c.kind === "counts-changing" && key === "agent.stepsSettled") return n;
    if (c.kind === "tool-changing" && key === "ask.lastTool")
      return watch({ name: `Synthetic${n}`, target: `synthetic-${n}`, at: n }, "tool");
    return value;
  };
  const watch = (value: any, prefix: string): any =>
    new Proxy(value, {
      get(t, key, receiver) {
        return read(`${prefix}.${String(key)}`, Reflect.get(t, key, receiver));
      },
    });
  const coercion = (key: string) => ({
    [Symbol.toPrimitive](hint: string) {
      tape.push([key, hint]);
      throw failure;
    },
  });
  const ask: any = {
    siteId: "synthetic-ask<&>",
    ordinal: 2,
    actorSeq: 0,
    instructionsHead: "Synthetic task <&>",
    startedAt: 60000,
    turn: 0,
    toolCalls: 1,
    lastTool: watch({ name: "Bash", target: "", at: 0 }, "tool"),
  };
  if (c.kind === "absent")
    for (const key of [
      "actorSeq",
      "instructionsHead",
      "startedAt",
      "turn",
      "toolCalls",
      "lastTool",
    ])
      ask[key] = undefined;
  if (c.kind === "tool-null") ask.lastTool = null;
  if (c.kind === "step-symbol") ask.actorSeq = Symbol("synthetic-step");
  if (c.kind === "tools-symbol") ask.toolCalls = Symbol("synthetic-tools");
  if (c.kind === "step-coercion") ask.actorSeq = coercion("step.coerce");
  if (c.kind === "ordinal-coercion") ask.ordinal = coercion("ordinal.coerce");
  const waiting =
    ["no-wait", "slot", "unknown-wait", "wait-null"].includes(c.kind) ||
    c.target?.startsWith("wait.");
  const settled = c.kind === "counts-changing" || c.target === "agent.stepsFailed";
  const agent: any = {
    siteId: "synthetic-worker",
    ordinal: 0,
    name: "Synthetic <&>",
    state:
      c.state ??
      (waiting
        ? "waiting"
        : settled
          ? "done"
          : ["parked-changing", "missing-question", "no-parked-id"].includes(c.kind)
            ? "parked"
            : "executing"),
    currentAsk:
      c.kind === "no-ask" || settled ? undefined : c.kind === "ask-null" ? null : watch(ask, "ask"),
    wait:
      c.kind === "no-wait"
        ? undefined
        : c.kind === "wait-null"
          ? null
          : watch(
              {
                cause:
                  c.kind === "slot" ? "slot" : c.kind === "unknown-wait" ? "unknown" : "backoff",
                reason: "Synthetic <&>",
                retryAfterMs: 1200,
                since: 0,
              },
              "wait",
            ),
    parkedOn:
      c.kind === "no-parked-id"
        ? undefined
        : c.kind === "missing-question"
          ? "synthetic-missing"
          : "synthetic-q",
    stepsSettled: c.kind === "zero" ? 0 : 2,
    stepsFailed: c.kind === "zero" ? 0 : 1,
    tokens: 1200,
  };
  if (c.kind === "zero") {
    ask.toolCalls = 0;
    ask.startedAt = 0;
    agent.currentAsk = undefined;
  }
  if (c.kind === "long-name") agent.name = "synthetic-".repeat(5);
  const subagents: any[] =
    c.kind === "empty" ? [] : c.kind === "sparse" ? Array(1) : [watch(agent, "agent")];
  for (const [key, arity] of [
    ["map", 1],
    ["forEach", 2],
  ] as const)
    Object.defineProperty(subagents, key, {
      value(this: any, callback: any) {
        assert.equal(this, subagents);
        tape.push([key, callback.length, callback.name]);
        assert.equal(callback.length, arity);
        return Array.prototype[key].call(this, callback);
      },
    });
  const run = watch(
    {
      ...detail,
      summary: "Synthetic summary",
      generatedAt: 120000,
      subagents,
      pendingQuestions: [0, 10000].map((askedAt) =>
        watch(
          {
            qid: "synthetic-q",
            actor: "synthetic-worker",
            question: "Synthetic question?",
            askedAt,
          },
          "question",
        ),
      ),
      subagentsTruncated: true,
    },
    "run",
  );
  return { run, tape, failure };
}
export function observe(c: any, selected = current) {
  const f = rowFixture(c);
  try {
    return { text: selected.formatWorkflowRunSubagentsBlock(f.run), tape: f.tape };
  } catch (error) {
    return { error: errorShape(error), sameFailure: error === f.failure, tape: f.tape };
  }
}
export const consumerCases = [
  { state: "executing" },
  { state: "parked" },
  { state: "unfinished" },
  { state: "waiting" },
  { kind: "slot" },
  { kind: "counts-changing" },
];
function portDetail(c: any) {
  const f = rowFixture(c);
  // Getter experiments belong to direct formatting; supported ports carry valid owned values.
  return json({ ...detail, subagents: f.run.subagents, pendingQuestions: f.run.pendingQuestions });
}
export async function consumer(c: any, selected = entry, edge?: any, early = false) {
  return clock(async () => {
    const controller = new AbortController(),
      f = executorFixture({}, selected),
      tape: string[] = [];
    const output = portDetail(c);
    let calls = 0,
      formats = 0;
    const fire = (stage: string) => {
      tape.push(stage);
      if (edge?.stage !== stage) return;
      const queue = (n: number) =>
        n === 0
          ? controller.abort("Synthetic activity completion abort")
          : queueMicrotask(() => queue(n - 1));
      queue(edge.depth);
    };
    const port = {
      getRunDetail(this: any, id: string) {
        assert.equal(this, port);
        assert.equal(id, "synthetic-run");
        calls++;
        fire("journal");
        return output;
      },
    };
    f.deps.dynamicWorkflowRunPort = port as any;
    const format = f.entry.formatModelContent!;
    f.entry.formatModelContent = (value: any) => {
      formats++;
      fire("model.begin");
      const text = format(value);
      fire("model.end");
      return text;
    };
    if (early) controller.abort("Synthetic early abort");
    const result = await f.execute({ signal: controller.signal });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.terminal().length, 1);
    assert.equal(
      f.events.filter((e: any) => ["tool_call_result", "tool_call_error"].includes(e.type)).length,
      early ? 0 : 1,
    );
    return {
      observed: normalized(f, result),
      calls,
      formats,
      tape,
      aborted: controller.signal.aborted,
    };
  });
}
export const completionEdges = ["model.begin", "model.end"].flatMap((stage) =>
  [0, 1, 3].map((depth) => ({ stage, depth })),
);
export async function delayed(selected = entry, stale = false) {
  return clock(async () => {
    const a = executorFixture({}, selected),
      b = executorFixture({}, selected),
      entered = gate(),
      release = gate<any>();
    let calls = 0;
    const port = {
      getRunDetail(this: any) {
        assert.equal(this, port);
        calls++;
        if (calls === 1) {
          entered.resolve();
          return release.promise;
        }
        return portDetail({ state: "waiting" });
      },
    };
    a.deps.dynamicWorkflowRunPort = b.deps.dynamicWorkflowRunPort = port as any;
    const first = a.execute();
    await entered.promise;
    if (stale) a.d.controller.abort("Synthetic stale activity completion");
    const second = await b.execute();
    if (!stale) release.resolve(portDetail({ state: "executing" }));
    const result = await first;
    if (stale) release.resolve(portDetail({ state: "executing" }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(a.terminal().length, 1);
    assert.equal(b.terminal().length, 1);
    return { calls, first: normalized(a, result), second: normalized(b, second) };
  });
}
