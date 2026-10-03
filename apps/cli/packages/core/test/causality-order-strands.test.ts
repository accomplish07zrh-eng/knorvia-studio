import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import {
  actual,
  analyze,
  archive,
  baseline,
  consumer,
  current,
  loadBaseline,
  loadCurrent,
  oldAnalyze,
  operand,
  pins,
  record,
  scripts,
  sha,
  state,
} from "./causality-order-strands-fixture.js";

test("strand admission preserves phase order, certainty, references and repeated joins", () => {
  for (const selected of [baseline, current]) {
    const input = state(),
      symbol = {},
      root = input.frames[0];
    const records = [
      record("pre", 0, ["c"]),
      record("maybe", 1, ["m"]),
      record("mixed", 2, ["m", "c"]),
      record("bound", 3),
      record("spawn", 4, [], false),
    ];
    input.strands.push(...records);
    input.checker.getSymbolAtLocation = () => symbol;
    const binding = new Set(["bound", "spawn"]);
    input.strandsBySymbol.set(symbol, binding);
    const first = selected.joinStrands(input, ["c"], ["m"], { mark: 4, operand: operand("held") });
    assert.deepEqual(first, { certain: ["spawn", "bound", "pre", "mixed"], maybe: ["maybe"] });
    assert.deepEqual([...input.joined], ["spawn", "bound", "pre", "maybe", "mixed"]);
    const second = selected.joinStrands(input, ["c"], ["m"], undefined);
    assert.deepEqual(second, { certain: [], maybe: [] });
    assert.notEqual(first.certain, second.certain);
    assert.notEqual(first.maybe, second.maybe);
    assert.equal(input.frames[0], root);
    assert.equal(input.strandsBySymbol.get(symbol), binding);
    records.forEach((item, index) => assert.equal(input.strands[index], item));
  }
});

function positions(selected: any, text: string, shadow = false) {
  const input = state(),
    log: string[] = [],
    symbols = new Map<string, object>();
  const lib = { fileName: "lib.es2015.promise.d.ts" };
  const global = { name: "Promise", flags: 0, declarations: [{ getSourceFile: () => lib }] };
  const alias = { flags: ts.SymbolFlags.Alias };
  input.program.isSourceFileDefaultLibrary = function (file: unknown) {
    assert.equal(this, input.program);
    assert.equal(file, lib);
    log.push("lib");
    return true;
  };
  input.checker.getAliasedSymbol = function (symbol: unknown) {
    assert.equal(this, input.checker);
    assert.equal(symbol, alias);
    log.push("alias");
    return global;
  };
  input.checker.getSymbolAtLocation = function (node: ts.Identifier) {
    assert.equal(this, input.checker);
    log.push(node.text);
    if (node.text === "Promise") return shadow ? { name: "OwnedShadow", flags: 0 } : global;
    if (node.text === "P") return alias;
    let symbol = symbols.get(node.text);
    if (!symbol) {
      symbol = {};
      symbols.set(node.text, symbol);
    }
    input.strandsBySymbol.set(symbol, new Set([node.text]));
    return symbol;
  };
  return { result: selected.joinStrands(input, [], [], { mark: 0, operand: operand(text) }), log };
}
test("await positions complete the global-combinator scan before binding reads", () => {
  const examples: [string, string[], string[], boolean?][] = [
    [
      "Promise.all([a, ...((b as unknown)!), Promise.race([c]), a])",
      ["a", "b", "c"],
      ["Promise", "lib", "Promise", "lib", "a", "b", "c", "a"],
    ],
    ["P.allSettled([a, b])", ["a", "b"], ["P", "alias", "lib", "a", "b"]],
    ["Promise.any([a])", ["a"], ["Promise", "lib", "a"]],
    ["([a, b] satisfies unknown[])", ["a", "b"], ["a", "b"]],
    ["Promise.all([a])", [], ["Promise"], true],
    ["unknownCall(a.value, [b])", [], []],
  ];
  for (const selected of [baseline, current])
    for (const [text, certain, log, shadow] of examples)
      assert.deepEqual(
        positions(selected, text, shadow),
        { result: { certain, maybe: [] }, log },
        text,
      );
});

test("activation frames and destructured symbol bindings retain existing set identity", () => {
  for (const selected of [baseline, current]) {
    const input = state(),
      root = input.frames[0];
    root.settled.add("root-step");
    const opened = selected.openStrand(input, "activation"),
      frame = selected.currentFrame(input);
    assert.equal(selected.innermostOpenStrand(input), opened);
    assert.equal(opened.at, 0);
    assert.equal(selected.strandMark(input), 1);
    frame.settled.add("inner-step");
    assert.equal(selected.isVisiblySettled(input, "root-step"), true);
    selected.closeStrand(input, opened);
    assert.equal(opened.summary, frame.settled);
    assert.equal(opened.closed, true);
    assert.equal(selected.currentFrame(input), root);
    assert.equal(selected.isVisiblySettled(input, "inner-step"), false);
    assert.equal(selected.innermostOpenStrand(input), undefined);
    const file = ts.createSourceFile(
      "owned.ts",
      "const [a, , {b}] = held;",
      ts.ScriptTarget.Latest,
      true,
    );
    const name = (file.statements[0] as ts.VariableStatement).declarationList.declarations[0]!.name;
    const symbol = {},
      binding = new Set(["old"]),
      reads: string[] = [];
    input.strandsBySymbol.set(symbol, binding);
    input.checker.getSymbolAtLocation = (node: ts.Identifier) => {
      reads.push(node.text);
      return node.text === "a" ? symbol : undefined;
    };
    selected.bindStrands(input, name, ["activation", "activation"]);
    selected.bindStrands(input, name, []);
    assert.deepEqual(reads, ["a", "b"]);
    assert.equal(input.strandsBySymbol.get(symbol), binding);
    assert.deepEqual([...binding], ["old", "activation"]);
  }
});

test("scan, binding and lifted failures preserve exception identity and partial joins", () => {
  for (const selected of [baseline, current]) {
    const error = new Error("Owned join failure"),
      input = state(),
      symbol = {};
    input.strands.push(record("spawn", 0));
    input.checker.getSymbolAtLocation = () => {
      throw error;
    };
    assert.throws(
      () =>
        selected.joinStrands(input, [], [], {
          mark: 0,
          operand: operand("Promise.all([held])"),
        }),
      (e) => e === error,
    );
    assert.deepEqual([...input.joined], ["spawn"]);
    const next = state();
    next.strandsBySymbol.set(symbol, new Set(["bound"]));
    next.checker.getSymbolAtLocation = (node: ts.Identifier) => {
      if (node.text === "a") return symbol;
      throw error;
    };
    assert.throws(
      () =>
        selected.joinStrands(next, [], [], {
          mark: 0,
          operand: operand("[a, b]"),
        }),
      (e) => e === error,
    );
    assert.deepEqual([...next.joined], ["bound"]);
    const lifted = state();
    lifted.strands.push(record("first", 0, ["c"]), record("later", 1));
    lifted.strands[1].issued.has = () => {
      throw error;
    };
    assert.throws(
      () => selected.joinStrands(lifted, ["c"], [], undefined),
      (e) => e === error,
    );
    assert.deepEqual([...lifted.joined], ["first"]);
  }
});

test("historical oracle and actual current selectors fail closed, including private imports", async () => {
  assert.equal(current.joinStrands, actual.joinStrands);
  assert.notEqual(current.joinStrands, baseline.joinStrands);
  assert.equal((await loadCurrent()).joinStrands, actual.joinStrands);
  assert.equal(sha(archive.declaration), archive.declarationSha256);
  for (const path of Object.keys(pins.files)) {
    await assert.rejects(
      loadCurrent(async (url) =>
        url.pathname.endsWith(path) ? "wrong artifact" : readFile(url, "utf8"),
      ),
      assert.AssertionError,
    );
    await assert.rejects(
      loadCurrent(async (url) => {
        if (url.pathname.endsWith(path)) throw new Error("Owned missing artifact");
        return readFile(url, "utf8");
      }),
      /Owned missing artifact/u,
    );
  }
  await assert.rejects(
    loadBaseline(async () => "wrong archive"),
    assert.AssertionError,
  );
  await assert.rejects(
    loadBaseline(async () => {
      throw new Error("Owned missing archive");
    }),
    /Owned missing archive/u,
  );
});

test("actual await, for-await and deferred-call consumers preserve trace and graph bytes", async () => {
  const gold = JSON.parse(
    await readFile(new URL("./causality-order-strands-contract.json", import.meta.url), "utf8"),
  );
  for (const [index, script] of scripts.entries()) {
    const old = consumer(oldAnalyze, script);
    assert.equal(sha(JSON.stringify(old)), gold.consumers[index], `historical graph ${index}`);
    assert.deepEqual(consumer(analyze, script), old, `current graph ${index}`);
  }
});
