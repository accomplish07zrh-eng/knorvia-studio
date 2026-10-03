// New synthetic observations of source-exposed interfaces; inherited prose lives in the archive.
import { summary, baselineSummary, errorShape, detail } from "./workflow-run-summary-fixture.js";
export { baselineSummary };
const facts = { ...detail, generatedAt: 60000 };
export const summaryCases: any[] = [
  {},
  ...["pending", "running", "completed", "errored", "stopped", "unknown"].flatMap((status) =>
    [undefined, "user", "provider", "superseded"].map((stopReason) => ({
      patch: { status, stopReason },
    })),
  ),
  ...[
    [],
    [{ state: "executing" }],
    [{ state: "waiting" }, { state: "parked" }],
    [{ state: "executing" }, { state: "waiting" }, { state: "parked" }, { state: "finished" }],
  ].map((subagents) => ({ patch: { subagents } })),
  ...Array.from({ length: 12 }, (_, i) => ({
    patch: { phases: [{ state: "current", name: "z".repeat(300 + i) }] },
  })),
  ...[
    undefined,
    [],
    [{ state: "finished", name: "Synthetic phase" }],
    [
      { state: "finished", name: "Earlier" },
      { state: "unfinished", name: "Later" },
    ],
    [{ state: "current", name: "Current" }],
  ].map((phases) => ({ patch: { phases } })),
  ...[true, false].flatMap((pendingQuestionsKnown) =>
    [[], [1], [1, 2]].map((pendingQuestions) => ({
      patch: { health: { pendingQuestionsKnown }, pendingQuestions },
    })),
  ),
  ...["running", "completed", "stopped"].flatMap((status) =>
    [undefined, 0, 1, 3].map((leftoverRunning) => ({
      patch: { status, health: { pendingQuestionsKnown: false, leftoverRunning } },
    })),
  ),
  ...[undefined, 0, 59000, 60001, NaN].flatMap((lastProgressAt) =>
    [undefined, 1].map((stalledSince) => ({
      patch: { health: { pendingQuestionsKnown: true, lastProgressAt, stalledSince } },
    })),
  ),
  ...[undefined, { code: "synthetic_failure" }, null].flatMap((error) =>
    ["running", "errored"].map((status) => ({ patch: { status, error } })),
  ),
  ...[
    undefined,
    [],
    [{ primary: false, id: "other", kind: "file" }],
    [{ primary: true, id: "synthetic-id", kind: "file" }],
    [
      { primary: true, id: "first", kind: "file", title: "Synthetic <&> title" },
      { primary: true, id: "second", kind: "document" },
    ],
  ].map((artifacts) => ({ patch: { status: "completed", artifacts } })),
  ...Array.from({ length: 33 }, (_, i) => i * 16).flatMap((length) =>
    ["x", "😀"].flatMap((unit) =>
      ["artifact", "phase"].map((kind) => ({
        patch:
          kind === "artifact"
            ? {
                status: "completed",
                artifacts: [{ primary: true, id: "id", kind: "file", title: unit.repeat(length) }],
              }
            : { phases: [{ state: "current", name: unit.repeat(length) }] },
      })),
    ),
  ),
  ...[
    null,
    undefined,
    {},
    { ...facts, usage: null },
    { ...facts, health: null },
    { ...facts, phases: [null] },
    { ...facts, subagents: [null] },
    { ...facts, status: "completed", artifacts: [null] },
    { ...facts, phases: { length: 1, findIndex: 2 } },
    { ...facts, usage: { ...detail.usage, nodesCompleted: Symbol("synthetic") } },
  ].map((value) => ({ value })),
];
export function observeSummary(c: any, selected = summary) {
  const tape: string[] = [],
    counts = new Map<string, number>(),
    cache = new WeakMap<object, any>();
  const failure = new Error("Synthetic summary getter failure");
  const raw = Object.hasOwn(c, "value") ? c.value : { ...facts, ...c.patch };
  const wrap = (value: any, path: string): any => {
    if (value === null || typeof value !== "object") return value;
    if (cache.has(value)) return cache.get(value);
    const proxy = new Proxy(value, {
      get(target, key, receiver) {
        const name = `${path}.${String(key)}`;
        tape.push(name);
        const count = (counts.get(name) ?? 0) + 1;
        counts.set(name, count);
        if (c.target === name && count === (c.throwAt ?? 1)) throw failure;
        return wrap(Reflect.get(target, key, receiver), name);
      },
    });
    cache.set(value, proxy);
    return proxy;
  };
  try {
    return { success: true, text: selected(wrap(raw, "run")), tape };
  } catch (error) {
    return { success: false, error: errorShape(error), sameFailure: error === failure, tape };
  }
}
export const throwingCases = [
  "generatedAt",
  "status",
  "updatedAt",
  "createdAt",
  "phases",
  "usage",
  "health",
  "error",
  "stopReason",
  "pendingQuestions",
  "artifacts",
  "ownedByThisSession",
].flatMap((key) => [1, 2].map((throwAt) => ({ target: `run.${key}`, throwAt })));
export function changing(selected = summary) {
  const tape: string[] = [];
  let reads = 0;
  const input = {
    ...facts,
    status: "completed",
    artifacts: [],
    health: { pendingQuestionsKnown: false },
  };
  Object.defineProperty(input, "usage", {
    get() {
      reads++;
      tape.push("usage");
      return { ...detail.usage, nodesCompleted: reads, nodesFailed: reads, spentTokens: reads };
    },
  });
  Object.defineProperty(input, "ownedByThisSession", {
    get() {
      tape.push("ownership");
      return false;
    },
  });
  return { text: selected(input as any), tape, reads };
}
