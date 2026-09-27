// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { createContext } from "node:vm";
import { IifeContextExecutor } from "../src/repl/executors.js";
import { compileReplCell } from "../src/repl/cell-compiler.js";

function session(globals: Record<string, unknown> = {}) {
  const context = createContext(globals);
  const executor = new IifeContextExecutor();
  return {
    context,
    run: (code: string, signal?: AbortSignal, timeout = 1_000) =>
      executor.run(code, context, signal, timeout),
  };
}

test("REPL returns the final expression, accepts top-level return and preserves semicolonless comments", async () => {
  const repl = session();
  assert.equal(await repl.run("1 + 2"), 3);
  assert.equal(await repl.run("return 19;"), 19);
  assert.equal(await repl.run("const answer = 6\nanswer * 7 // final comment"), 42);
  assert.equal(await repl.run("const quiet = 8;"), undefined);
  assert.equal(await repl.run("// empty cell"), undefined);
});

test("top-level declarations survive later calls, including Unicode, destructuring, function and class", async () => {
  const repl = session();
  await repl.run("const 初始 = 5; let mutable = 2; var [first, ...tail] = [3, 4, 5];");
  await repl.run(
    "const { missing: fallback = 7, ...remaining } = { kept: 11 }; function twice(x) { return x * 2; } class Box { value = 13; }",
  );
  assert.equal(
    await repl.run(
      "初始 + mutable + first + tail[1] + fallback + remaining.kept + twice(4) + new Box().value",
    ),
    54,
  );
  await repl.run("mutable += 3");
  assert.equal(await repl.run("mutable"), 5);
});

test("successful declarations before a throw persist while nested bindings stay local", async () => {
  const repl = session();
  await assert.rejects(
    repl.run("const retained = 41; throw new Error('cell failed');"),
    /cell failed/,
  );
  assert.equal(await repl.run("retained + 1"), 42);
  await repl.run("function local() { const hidden = 7; return hidden; } { const blockOnly = 1; }");
  assert.equal(await repl.run("local()"), 7);
  assert.equal(await repl.run("typeof hidden + ':' + typeof blockOnly"), "undefined:undefined");
});

test("top-level await keeps declaration and expression results", async () => {
  const repl = session();
  assert.equal(
    await repl.run("const value = await Promise.resolve(8); await Promise.resolve(value * 2)"),
    16,
  );
  assert.equal(await repl.run("value"), 8);
});

test("dynamic imports use the supplied loader without rewriting comments, strings or regexp literals", async () => {
  const requests: unknown[] = [];
  const repl = session({
    importModule: async (...args: unknown[]) => {
      requests.push(args);
      return { value: 23 };
    },
  });
  assert.equal(await repl.run("const loaded = await import('local-fixture'); loaded.value"), 23);
  assert.equal(
    await repl.run(
      "const text = `import('literal')`; /* import('comment') */ /import\\(/.test(text)",
    ),
    true,
  );
  assert.equal(
    await repl.run("const call = async () => import('nested'); (await call()).value"),
    23,
  );
  assert.equal(await repl.run("`value:${(await import('template')).value}`"), "value:23");
  assert.deepEqual(requests, [["local-fixture"], ["nested"], ["template"]]);
});

test("syntax errors reject and later valid cells still run", async () => {
  const repl = session();
  await assert.rejects(
    repl.run("const = ;"),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "SyntaxError",
  );
  assert.equal(await repl.run("7 * 6"), 42);
});

test("an already-aborted call cannot execute and a waiting call preserves its cancellation reason", async () => {
  const repl = session({ effect: 0 });
  const before = new AbortController();
  const reason = new DOMException("Stopped by caller", "AbortError");
  before.abort(reason);
  await assert.rejects(repl.run("effect++", before.signal), (error) => error === reason);
  assert.equal(repl.context.effect, 0);
  const during = new AbortController();
  const result = repl.run("await new Promise(() => {})", during.signal);
  during.abort(reason);
  await assert.rejects(result, (error) => error === reason);
});

test("synchronous loops are interrupted by the existing VM execution budget", async () => {
  const repl = session();
  await assert.rejects(repl.run("while (true) {}", undefined, 20), /timed out/);
});

test("parenthesized final expressions and object literals keep their completion value", async () => {
  const repl = session();
  assert.equal(await repl.run("((2 + 3)); // preserved comment"), 5);
  assert.equal(await repl.run("({answer: 42}).answer"), 42);
  assert.equal(await repl.run("(1, 2, 3)"), 3);
  assert.equal(await repl.run("'use strict'; (7 * 6)"), 42);
});

test("compiler context parameter does not collide with declared names or alter import arguments", async () => {
  const requests: unknown[] = [];
  const repl = session({
    importModule: async (...args: unknown[]) => {
      requests.push(args);
      return 21;
    },
  });
  assert.equal(
    await repl.run(
      "const __knorviaCellScope0 = 2; (await import /*gap*/ ('sample')) * __knorviaCellScope0",
    ),
    42,
  );
  assert.equal(await repl.run("await import('with-options', { with: { type: 'json' } })"), 21);
  assert.equal(
    JSON.stringify(requests),
    JSON.stringify([["sample"], ["with-options", { with: { type: "json" } }]]),
  );
});

test("the compiler retains declarations in cells with explicit return and reports only top-level bindings", async () => {
  const repl = session();
  assert.equal(await repl.run("let saved = await Promise.resolve(42); return saved;"), 42);
  assert.equal(await repl.run("saved"), 42);
  assert.deepEqual(
    compileReplCell("const { value: named = 2 } = {}; function f() { let local = 1; } class C {}")
      .topLevelBindings,
    ["named", "f", "C"],
  );
});

test("input cannot terminate the grammar wrapper and append a second compilation unit", () => {
  assert.throws(() => compileReplCell("}\nfunction unrelated() {"), /cell boundary/);
});
