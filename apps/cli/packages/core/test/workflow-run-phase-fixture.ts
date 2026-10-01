// Owned synthetic phase fixtures; prior archive/prose and source exposure remain disclosed.
import assert from "node:assert/strict";
import {
  old,
  current,
  oldEntry,
  entry,
  declaration,
  archive,
} from "./workflow-run-activity-fixture.js";
import {
  detail,
  clock,
  json,
  sha,
  errorShape,
  executorFixture,
  normalized,
} from "./workflow-run-summary-fixture.js";
export { old, current, oldEntry, entry, declaration, archive, sha };
export const cases: any[] = [
  ...[
    "current",
    "ahead",
    "done",
    "terminal",
    "missing",
    "empty",
    "null",
    "nonarray",
    "sparse",
    "long",
    "no-entered",
    "zero-exit",
    "negative",
    "rounds-symbol",
    "running-symbol",
    "exit-symbol",
    "changing-rounds",
    "changing-counts",
    "changing-state",
    "changing-time",
    "entered-coercion",
  ].map((kind) => ({ kind })),
  ...[
    ["phase.name", 1],
    ["phase.state", 2],
    ["phase.rounds", 2],
    ["phase.nodesRunning", 1],
    ["phase.nodesSettled", 2],
    ["run.generatedAt", 1],
    ["phase.enteredAt", 1],
    ["phase.exitedAt", 2],
  ].map(([target, at]) => ({ kind: "throw", target, at })),
];
export const widthCases = ["width-infinite", "width-nan", "width-coercion"];
export function phaseRows(c: any = {}) {
  const tape: any[] = [],
    counts = new Map<string, number>(),
    failure = new Error("Synthetic phase failure");
  const read = (key: string, value: any) => {
    tape.push(key);
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    if (c.target === key && c.at === n) throw failure;
    if (c.kind === "changing-rounds" && key === "phase.rounds") return [1, 2, 1][n - 1];
    if (c.kind === "changing-counts" && key === "phase.nodesSettled") return [1, 2, 1][n - 1];
    if (c.kind === "changing-state" && key === "phase.state")
      return n === 1 ? "x".repeat(40) : "current";
    if (c.kind === "changing-time" && key === "run.generatedAt") return n * 60000;
    return value;
  };
  const watch = (v: any, prefix: string) =>
    new Proxy(v, {
      get(t, k, receiver) {
        return read(`${prefix}.${String(k)}`, Reflect.get(t, k, receiver));
      },
    });
  const phase: any = {
    name: "Synthetic <&> phase",
    state: "current",
    rounds: 1,
    nodesSettled: 2,
    nodesRunning: 0,
    enteredAt: 0,
    exitedAt: 45000,
  };
  if (c.kind === "current") {
    phase.nodesRunning = 1;
    delete phase.exitedAt;
  }
  if (c.kind === "ahead") {
    phase.state = "ahead";
    phase.rounds = phase.nodesSettled = 0;
    delete phase.enteredAt;
    delete phase.exitedAt;
  }
  if (c.kind === "done") {
    phase.state = "done";
    phase.rounds = 2;
  }
  if (c.kind === "terminal") {
    phase.state = "unfinished";
    phase.nodesRunning = 1;
    delete phase.exitedAt;
  }
  if (c.kind === "long") phase.name = "Synthetic<&>".repeat(5);
  if (c.kind === "no-entered") delete phase.enteredAt;
  if (c.kind === "zero-exit") phase.exitedAt = 0;
  if (c.kind === "negative") phase.exitedAt = -100;
  if (c.kind === "rounds-symbol") phase.rounds = Symbol("synthetic-rounds");
  if (c.kind === "running-symbol") phase.nodesRunning = Symbol("synthetic-running");
  if (c.kind === "exit-symbol") phase.exitedAt = Symbol("synthetic-exit");
  if (widthCases.includes(c.kind))
    phase.state = {
      get length() {
        return read(
          "state.length",
          c.kind === "width-infinite"
            ? Infinity
            : c.kind === "width-nan"
              ? NaN
              : {
                  [Symbol.toPrimitive](hint: string) {
                    tape.push(["length.coerce", hint]);
                    throw failure;
                  },
                },
        );
      },
      [Symbol.toPrimitive](hint: string) {
        tape.push(["state.coerce", hint]);
        return "synthetic-state";
      },
    };
  if (c.kind === "entered-coercion")
    phase.enteredAt = {
      [Symbol.toPrimitive](hint: string) {
        tape.push(["entered.coerce", hint]);
        throw failure;
      },
    };
  const array: any[] = [
    watch(phase, "phase"),
    watch({ name: "Next", state: "ahead", rounds: 0, nodesSettled: 0, nodesRunning: 0 }, "next"),
  ];
  if (c.kind === "sparse") delete array[1];
  let phases: any,
    maps = 0;
  phases = new Proxy(array, {
    get(t, k, receiver) {
      read(`phases.${String(k)}`, undefined);
      if (k !== "map") return Reflect.get(t, k, receiver);
      return function (this: any, callback: any) {
        assert.equal(this, phases);
        assert.equal(arguments.length, 1);
        tape.push(["map", ++maps, callback.length]);
        return Array.prototype.map.call(this, callback);
      };
    },
  });
  if (c.kind === "missing") phases = undefined;
  if (c.kind === "empty") phases = [];
  if (c.kind === "null") phases = null;
  if (c.kind === "nonarray") phases = {};
  return {
    run: watch({ generatedAt: 90000, phases }, "run"),
    terminal: c.kind === "terminal",
    tape,
    failure,
  };
}
export function observe(c: any, selected = current) {
  const f = phaseRows(c);
  try {
    return { text: selected.formatWorkflowRunPhasesBlock(f.run, f.terminal), tape: f.tape };
  } catch (error) {
    return { error: errorShape(error), sameFailure: error === f.failure, tape: f.tape };
  }
}
export const consumerCases = ["current", "terminal", "empty"];
export async function consumer(
  kind: string,
  selected = entry,
  edge?: { stage: string; depth: number },
  early = false,
) {
  return clock(async () => {
    const controller = new AbortController(),
      f = executorFixture({}, selected),
      tape: string[] = [];
    const phase = phaseRows({ kind }),
      output = json({
        ...detail,
        phases: phase.run.phases,
        ...(kind === "terminal" ? { status: "completed" } : {}),
      });
    let calls = 0,
      formats = 0;
    const fire = (stage: string) => {
      tape.push(stage);
      if (edge?.stage !== stage) return;
      const queue = (n: number) =>
        n === 0
          ? controller.abort("Synthetic phase completion abort")
          : queueMicrotask(() => queue(n - 1));
      queue(edge.depth);
    };
    const port = {
      getRunDetail(this: any, id: string) {
        assert.equal(this, port);
        assert.equal(id, "synthetic-run");
        calls++;
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
    if (early) controller.abort("Synthetic early phase abort");
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
export const edges = [
  { stage: "model.begin", depth: 0 },
  { stage: "model.end", depth: 1 },
];
