import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitCommandExecutionResult } from "../src/git/providers/gitCommandProvider.js";
import { commandResultFixture, result } from "./git-command-result-fixture-fast-20261001.js";
const f = await commandResultFixture(),
  label = "owned label 文";
const cases: {
  name: string;
  fields: Partial<GitCommandExecutionResult>;
  allowed?: number[];
  message?: string;
}[] = [
  {
    name: "successful signal/stderr/orphan ignored",
    fields: { signal: "SIGTERM", stderr: "ignored", orphaned: true },
  },
  { name: "explicit allowed one", fields: { exitCode: 1 }, allowed: [1] },
  { name: "null admitted by NaN", fields: { exitCode: null }, allowed: [Number.NaN] },
  {
    name: "timeout wins over truncation and allowed",
    fields: {
      timedOut: true,
      outputTruncated: true,
      timeoutMs: 15000,
      durationMs: 17,
      timeoutElapsedMs: 0,
      timeoutCloseDelayMs: 3,
      forceKillAttempted: true,
      orphaned: true,
    },
    message: `${label} timed out after 15000ms (elapsed=17ms, killAt=0ms, cleanup=3ms, forceKill=true, orphaned=true)`,
  },
  {
    name: "timeout nullish/zero/null diagnostics",
    fields: {
      timedOut: true,
      timeoutMs: null as never,
      durationMs: 0,
      timeoutCloseDelayMs: null as never,
    },
    message: `${label} timed out after 0ms (elapsed=0ms, cleanup=nullms)`,
  },
  {
    name: "timeout missing limit",
    fields: { timedOut: true },
    message: `${label} timed out after 7ms (elapsed=7ms)`,
  },
  {
    name: "truncation wins over zero exit",
    fields: { outputTruncated: true },
    message: `${label} output exceeded limit`,
  },
  {
    name: "stderr wins and trims Unicode/newlines",
    fields: { exitCode: -2, stderr: "\u00a0 owned 文\r\n", stdout: "ignored" },
    message: `${label} failed: owned 文`,
  },
  {
    name: "blank stderr selects raw stdout detail",
    fields: { exitCode: 2, stderr: " \t", stdout: " owned\0stdout \r\n" },
    message: `${label} failed: owned\0stdout`,
  },
  { name: "null fallback", fields: { exitCode: null }, message: `${label} failed: exitCode=null` },
  {
    name: "empty allowlist rejects zero",
    fields: {},
    allowed: [],
    message: `${label} failed: exitCode=0`,
  },
  {
    name: "undefined fallback",
    fields: { exitCode: undefined as never },
    message: `${label} failed: exitCode=null`,
  },
];
function outcome(ensure: typeof f.ensure, input: GitCommandExecutionResult, allowed?: number[]) {
  try {
    return { value: ensure(label, input, allowed) };
  } catch (error) {
    assert.ok(error instanceof Error);
    return {
      error: { name: error.name, message: error.message, hasCause: Object.hasOwn(error, "cause") },
    };
  }
}
for (const c of cases)
  test(`command verdict ${c.name}`, () => {
    const input = Object.freeze(result({ stdout: "", ...c.fields })),
      allowed = c.allowed && Object.freeze(c.allowed);
    const actual = outcome(f.ensure, input, allowed as number[] | undefined);
    assert.deepEqual(actual, outcome(f.legacyEnsure, input, allowed as number[] | undefined));
    if (c.message)
      assert.deepEqual(actual, { error: { name: "Error", message: c.message, hasCause: false } });
    else assert.equal(actual.value, input);
  });
function observe(ensure: typeof f.ensure, kind: string, failAt?: string) {
  const trace: string[] = [],
    failure = new Error("owned getter rejection");
  let duration = 0,
    elapsed = 0,
    exits = 0;
  const input = new Proxy(
    result({
      timedOut: kind === "timeout",
      outputTruncated: kind === "truncated",
      exitCode: kind === "accepted" ? 0 : 2,
      stderr: kind === "stderr" ? " owned stderr " : "",
      stdout: kind === "stdout" ? " owned stdout " : "",
    }),
    {
      get(target, key) {
        trace.push(String(key));
        if (String(key) === failAt) throw failure;
        if (key === "durationMs") return ++duration * 11;
        if (key === "timeoutElapsedMs") return 7 + elapsed++;
        if (key === "forceKillAttempted") return true;
        if (key === "exitCode" && kind === "fallback") return exits++ === 0 ? 2 : null;
        if (["signal", "args", "cwd", "binaryPath"].includes(String(key)))
          assert.fail("unrelated metadata read");
        return Reflect.get(target, key);
      },
    },
  );
  const allowed = new Proxy([0], {
    get(target, key) {
      if (key !== "includes") return Reflect.get(target, key);
      trace.push("includes-get");
      if (failAt === "includes") throw failure;
      return function (this: unknown, value: number) {
        assert.equal(this, allowed);
        trace.push(`includes-call:${String(value)}`);
        return target.includes(value);
      };
    },
  });
  let value: unknown;
  try {
    value = ensure(label, input, allowed) === input ? "same-result" : "different-result";
  } catch (error) {
    if (failAt) assert.equal(error, failure);
    value = (error as Error).message;
  }
  return { trace, value };
}
for (const kind of ["timeout", "truncated", "accepted", "stderr", "stdout", "fallback"])
  test(`exact lazy reads/receiver ${kind}`, () => {
    const actual = observe(f.ensure, kind);
    assert.deepEqual(actual, observe(f.legacyEnsure, kind));
    if (kind === "timeout") {
      assert.deepEqual(actual.trace, [
        "timedOut",
        "timeoutMs",
        "durationMs",
        "durationMs",
        "timeoutElapsedMs",
        "timeoutElapsedMs",
        "timeoutCloseDelayMs",
        "forceKillAttempted",
        "orphaned",
      ]);
      assert.equal(
        actual.value,
        `${label} timed out after 11ms (elapsed=22ms, killAt=8ms, forceKill=true)`,
      );
    }
  });
test("getter failures propagate at each priority boundary", () => {
  for (const [kind, keys] of [
    [
      "timeout",
      [
        "timedOut",
        "timeoutMs",
        "durationMs",
        "timeoutElapsedMs",
        "timeoutCloseDelayMs",
        "forceKillAttempted",
        "orphaned",
      ],
    ],
    ["stdout", ["outputTruncated", "includes", "exitCode", "stderr", "stdout"]],
  ] as const)
    for (const key of keys)
      assert.deepEqual(observe(f.ensure, kind, key), observe(f.legacyEnsure, kind, key));
});
test("reentrant verdict has no shared state and keeps the outer result", () => {
  for (const ensure of [f.ensure, f.legacyEnsure]) {
    let nested: unknown;
    const input = result();
    Object.defineProperty(input, "timedOut", {
      get() {
        nested = outcome(ensure, result({ outputTruncated: true }));
        return false;
      },
    });
    assert.equal(ensure(label, input), input);
    assert.deepEqual(nested, {
      error: { name: "Error", message: `${label} output exceeded limit`, hasCause: false },
    });
  }
});
test("malformed owned values retain diagnostic and label coercion order", () => {
  function run(ensure: typeof f.ensure) {
    const trace: string[] = [];
    const text = (name: string) => ({
      [Symbol.toPrimitive](hint: string) {
        trace.push(`${name}:${hint}`);
        return name;
      },
    });
    const input = result({
      timedOut: true,
      timeoutMs: text("limit") as never,
      durationMs: text("elapsed") as never,
      timeoutElapsedMs: text("killAt") as never,
    });
    assert.throws(() => ensure(text("label") as never, input), {
      message: "label timed out after limitms (elapsed=elapsedms, killAt=killAtms)",
    });
    return trace;
  }
  assert.deepEqual(run(f.ensure), [
    "elapsed:string",
    "killAt:string",
    "label:string",
    "limit:string",
  ]);
  assert.deepEqual(run(f.ensure), run(f.legacyEnsure));
});
