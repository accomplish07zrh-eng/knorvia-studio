// Owned synthetic AST/state records. No workflow is executed.
import assert from "node:assert/strict";
import ts from "typescript";

export const occurrence = (site: string, exact = true) => ({ site, exact });
export function state(text = "await seed; sendA(); sendB();") {
  const scriptFile = ts.createSourceFile("owned.ts", text, ts.ScriptTarget.Latest, true);
  assert.equal(
    (scriptFile as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics
      .length,
    0,
  );
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(scriptFile);
  const awaitNode = nodes.find(ts.isAwaitExpression)!;
  const calls = nodes.filter(ts.isCallExpression);
  return {
    scriptFile,
    awaitNode,
    nodes,
    oracle: { awaitSettles: new Map(), guardReads: new Map(), applications: new Map() },
    realSteps: new Set(["a", "b", "c"]),
    issued: new Set<string>(),
    callByStep: new Map(calls.map((call, i) => [String.fromCharCode(97 + i), call])),
    iterationAncestorCache: new Map<ts.Node, Set<ts.Node>>(),
    candByCallback: new Map(),
    eachCallbackFns: new Set(),
    frames: [{ region: "root", settled: new Set<string>() }],
    strands: [] as any[],
    joined: new Set<string>(),
    strandsBySymbol: new Map(),
    stepsBySymbol: new Map(),
    checker: { getSymbolAtLocation: () => undefined },
    events: [] as any[],
    controls: [] as any[],
  };
}
export const claimCases = [
  { name: "empty", make: () => state() },
  {
    name: "phantom-filtered-before-singleton",
    make: () => {
      const s = state();
      s.issued.add("a");
      s.oracle.awaitSettles.set(0, [occurrence("a"), occurrence("b"), occurrence("relay")]);
      return s;
    },
  },
  {
    name: "duplicate-exactness-and-order",
    make: () => {
      const s = state();
      s.issued = new Set(["a", "b"]);
      s.oracle.awaitSettles.set(0, [occurrence("b", false), occurrence("a"), occurrence("b")]);
      return s;
    },
  },
  {
    name: "single-duplicate-exactness",
    make: () => {
      const s = state();
      s.issued.add("a");
      const shared = occurrence("a", false);
      s.oracle.awaitSettles.set(0, [shared, shared, occurrence("a")]);
      return s;
    },
  },
  ...[
    "for (let i=0;i<2;i++) { await seed; sendA(); }",
    "while (flag) { await seed; sendA(); }",
    "const callback = async () => { await seed; sendA(); };",
  ].map((text, index) => ({
    name: `repetition-${index}`,
    make: () => {
      const s = state(text);
      if (index === 2) s.eachCallbackFns.add(s.nodes.find(ts.isArrowFunction)!);
      s.oracle.awaitSettles.set(0, [occurrence("a")]);
      return s;
    },
  })),
];
export function observeClaim(selected: any, s: ReturnType<typeof state>) {
  const records = s.oracle.awaitSettles.get(0);
  const before = JSON.stringify(records);
  const result = selected.settlesAt(s, s.awaitNode, 0);
  const cached = [...s.iterationAncestorCache];
  assert.deepEqual(selected.settlesAt(s, s.awaitNode, 0), result);
  for (const [node, ancestors] of cached)
    assert.equal(s.iterationAncestorCache.get(node), ancestors);
  assert.equal(JSON.stringify(records), before);
  return {
    result,
    cache: cached.map(([node, ancestors]) => [
      node.kind,
      node.pos,
      [...ancestors].map((n) => [n.kind, n.pos]),
    ]),
  };
}
const strand = (region: string, issued: string[], summary: string[]) => ({
  at: 0,
  closed: true,
  region,
  issued: new Set(issued),
  summary: new Set(summary),
});
export const barrierCases = [
  {
    name: "widen-issued-order",
    make: () => ({
      s: Object.assign(state(), { issued: new Set(["b", "a", "c"]) }),
      certain: [],
      maybe: [],
    }),
  },
  {
    name: "certainty-precedence-and-parent-visibility",
    make: () => {
      const s = state();
      s.frames[0]!.settled.add("a");
      s.frames.push({ region: "child", settled: new Set() });
      return { s, certain: ["b", "a", "b"], maybe: ["b", "c", "c"] };
    },
  },
  {
    name: "resolved-already-settled-does-not-widen",
    make: () => {
      const s = state();
      s.issued = new Set(["a", "b"]);
      s.frames[0]!.settled.add("a");
      return { s, certain: ["a"], maybe: [] };
    },
  },
  {
    name: "joined-summary-order-and-unique-first-event",
    make: () => {
      const s = state();
      s.strands = [strand("one", ["a"], ["x", "y"]), strand("two", ["b"], ["y", "z"])];
      return { s, certain: ["a"], maybe: ["b", "a"] };
    },
  },
  {
    name: "join-only",
    make: () => {
      const s = state();
      s.frames[0]!.settled.add("a");
      s.strands = [strand("one", ["a"], [])];
      return { s, certain: ["a"], maybe: [] };
    },
  },
  {
    name: "empty-summary-join-widens",
    make: () => {
      const s = state();
      s.issued.add("a");
      s.strands = [strand("one", [], [])];
      return {
        s,
        certain: [],
        maybe: [],
        awaited: { mark: 0, operand: ts.factory.createNumericLiteral(0) },
      };
    },
  },
];
export function snapshot(s: ReturnType<typeof state>, chain: readonly string[]) {
  return {
    events: [...s.events],
    eventKeys: s.events.map(Object.keys),
    chainIdentity: s.events.map((event) => event.regions === chain),
    settled: s.frames.map((frame) => [...frame.settled]),
    joined: [...s.joined],
  };
}
export function observeBarrier(
  selected: any,
  input: ReturnType<(typeof barrierCases)[number]["make"]>,
) {
  const { s, certain, maybe } = input;
  const chain = ["root", "owned-region"];
  const before = JSON.stringify([certain, maybe]);
  selected.barrier(s, certain, maybe, chain, "awaited" in input ? input.awaited : undefined);
  assert.equal(JSON.stringify([certain, maybe]), before);
  const first = structuredClone(snapshot(s, chain));
  selected.barrier(s, certain, maybe, chain, "awaited" in input ? input.awaited : undefined);
  return { first, repeated: snapshot(s, chain) };
}
export function failures(selected: any) {
  const output = [];
  for (const phase of ["oracle", "admission", "maybe-visibility", "summary", "event"]) {
    const s = state(),
      chain = ["root"],
      calls: string[] = [];
    const failure = new Error(`Owned ${phase} failure`);
    s.issued.add("a");
    s.oracle.awaitSettles.set(0, [occurrence("a"), occurrence("relay")]);
    if (phase === "oracle")
      s.oracle.awaitSettles.get = () => {
        throw failure;
      };
    if (phase === "admission") {
      s.realSteps.has = (site) => {
        calls.push(site);
        return site === "a";
      };
      s.issued.has = () => {
        throw failure;
      };
    }
    if (phase === "maybe-visibility")
      s.frames[0]!.settled.has = (step) => {
        if (step === "b") throw failure;
        return false;
      };
    if (phase === "summary") {
      const record = strand("one", ["a"], []);
      record.summary[Symbol.iterator] = () => {
        throw failure;
      };
      s.strands.push(record);
    }
    if (phase === "event")
      s.events.push = () => {
        throw failure;
      };
    assert.throws(
      () =>
        phase === "oracle" || phase === "admission"
          ? selected.settlesAt(s, s.awaitNode, 0)
          : selected.barrier(s, ["a"], ["b"], chain),
      (error) => error === failure,
    );
    output.push({ phase, calls, ...snapshot(s, chain) });
  }
  return output;
}

export function guardClaims(selected: any) {
  return [[], [occurrence("a")], [occurrence("a"), occurrence("b")]].map((occs) => {
    const s = state("if (flag) sendA();");
    const guard = s.nodes.find(ts.isIfStatement)!.expression;
    const symbol = {} as any;
    s.checker.getSymbolAtLocation = () => symbol;
    s.stepsBySymbol.set(symbol, new Set(["b"]));
    s.oracle.guardReads.set(guard.getStart(s.scriptFile), occs);
    selected.recordControl(s, guard, "owned-region");
    return s.controls;
  });
}
