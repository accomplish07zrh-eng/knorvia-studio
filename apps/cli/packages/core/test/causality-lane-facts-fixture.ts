import assert from "node:assert/strict";
import {
  analyze,
  baseline,
  consumer,
  current,
  oldAnalyze,
  sha,
} from "./may-set-lane-expansion-fixture.js";
export { analyze, baseline, consumer, current, oldAnalyze, sha };

const fact = (from: string, to: string, extra: Record<string, unknown> = {}) => ({
  from,
  to,
  kind: "seq",
  certainty: "always",
  ...extra,
});
export const cases: { name: string; make: () => any[] }[] = [
  { name: "empty", make: () => [] },
  {
    name: "rank-exact-certainty",
    make: () => [
      fact("a", "b", { exact: false, carryOf: "fifo", extra: { owned: 1 } }),
      fact("c", "d", { kind: "fifo" }),
      fact("a", "b", {
        kind: "data",
        exact: true,
        certainty: "maybe",
        carryOf: "data",
        extra: { owned: 2 },
      }),
      fact("a", "b", { kind: "seq", exact: false }),
      fact("a", "b", { kind: "control" }),
    ],
  },
  {
    name: "present-phase-union",
    make: () => [
      fact("a", "b", { toPhases: new Set(["p", "q"]), viaJump: true }),
      fact("a", "b", { toPhases: new Set(["q", "r"]), viaJump: true }),
    ],
  },
  {
    name: "absence-dominates",
    make: () => [
      fact("a", "b", { toPhases: new Set(["p"]), viaJump: true }),
      fact("a", "b"),
      fact("a", "b", { toPhases: new Set(["q"]), viaJump: true }),
      fact("c", "d"),
      fact("c", "d", { toPhases: new Set(["r"]), viaJump: true }),
    ],
  },
  {
    name: "optional-field-presence",
    make: () => [
      fact("a", "b", { exact: undefined, toPhases: undefined, viaJump: undefined }),
      fact("a", "b", { toPhases: new Set(["p"]), viaJump: true }),
      fact("c", "d"),
      fact("c", "d", { exact: false }),
      fact("e", "f", { toPhases: undefined }),
      fact("e", "f"),
    ],
  },
  {
    name: "aliases-and-independent-phase-owners",
    make: () => {
      const phases = new Set(["p"]),
        shared = fact("a", "b", { toPhases: phases });
      return [
        shared,
        fact("c", "d", { toPhases: phases }),
        shared,
        fact("a", "b", { toPhases: new Set(["q"]) }),
      ];
    },
  },
  {
    name: "legacy-key-collision",
    make: () => [fact("a|b", "c"), fact("a", "b|c", { kind: "control" })],
  },
];

const fields = (row: any) =>
  Object.entries(row).map(([key, value]) => [
    key,
    value === undefined ? { ownedUndefined: true } : value instanceof Set ? [...value] : value,
  ]);
export function observe(selected: any, input: any[]) {
  const before = input.map(fields);
  for (const row of input) Object.freeze(row);
  Object.freeze(input);
  const result = selected.dedupeFacts(input);
  assert.deepEqual(input.map(fields), before);
  assert.ok(result.every((row: any) => !input.includes(row)));
  for (const row of result)
    if (row.toPhases !== undefined)
      assert.ok(input.every((original) => row.toPhases !== original.toPhases));
  return {
    fields: result.map(fields),
    extras: result.map((row: any) =>
      input.findIndex((original) => original.extra !== undefined && row.extra === original.extra),
    ),
    phaseAliases: result.map((row: any, index: number) =>
      row.toPhases === undefined
        ? -1
        : result.findIndex((other: any) => other.toPhases === row.toPhases) === index
          ? -1
          : result.findIndex((other: any) => other.toPhases === row.toPhases),
    ),
  };
}

export function traceJoin(selected: any, throwAt?: string) {
  const calls: string[] = [],
    failure = new Error("Owned fact failure");
  const priorPhases = new Set(["p"]);
  const incoming = fact("a", "b", {
    kind: "data",
    exact: true,
    certainty: "maybe",
    toPhases: undefined,
  });
  const values: Record<string, unknown> = { ...incoming, viaJump: undefined };
  const iterable = {
    [Symbol.iterator]() {
      assert.equal(this, iterable);
      calls.push("iterator");
      if (throwAt === "iterator") throw failure;
      return ["q", "r"][Symbol.iterator]();
    },
  };
  values.toPhases = iterable;
  for (const key of ["from", "to", "kind", "exact", "certainty", "viaJump", "toPhases"])
    Object.defineProperty(incoming, key, {
      enumerable: true,
      get() {
        calls.push(key);
        if (key === throwAt) throw failure;
        return values[key];
      },
    });
  try {
    const result = selected.dedupeFacts([
      fact("a", "b", { exact: false, viaJump: true, toPhases: priorPhases }),
      incoming,
    ]);
    assert.deepEqual([...priorPhases], ["p"]);
    return { calls, fields: result.map(fields) };
  } catch (error) {
    assert.equal(error, failure);
    assert.deepEqual([...priorPhases], ["p"]);
    return { calls, error: failure.message, sameError: true };
  }
}

export function weakestPort(selected: any, throws = false) {
  const calls: string[] = [],
    failure = new Error("Owned certainty failure");
  const port = {
    get includes() {
      calls.push("get includes");
      return function (this: unknown, value: string) {
        assert.equal(this, port);
        assert.equal(value, "maybe");
        calls.push("call includes");
        if (throws) throw failure;
        return true;
      };
    },
  };
  try {
    return { value: selected.weakest(port), calls };
  } catch (error) {
    assert.equal(error, failure);
    return { error: failure.message, sameError: true, calls };
  }
}
export const scripts = [
  'const a = agent("Owned worker"); phase("Owned first"); const x = await a.ask("Owned input"); phase("Owned second"); return await a.ask(x);',
  'const a = agent("Owned worker"); let value = "Owned seed"; for (let i=0;i<3;i++) { if (i === 1) { value = await a.ask(value); continue; } value = await a.ask(value); } return value;',
];
export function factConsumer(selected: any, script: string) {
  const result = selected.analyzeWorkflowScript(script);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const { core: _core, ...publicResult } = result;
  return publicResult;
}
