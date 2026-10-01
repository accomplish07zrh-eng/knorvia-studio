import assert from "node:assert/strict";
import { test } from "node:test";
import { diffResultFixture, result } from "./git-diff-result-fixture-fast-20261001.js";
const f = await diffResultFixture(),
  path = "owned synthetic diff/文";
for (const timedOut of [false, true])
  for (const outputTruncated of [false, true])
    for (const exitCode of [0, 1, null])
      test(`priority timeout=${timedOut} truncated=${outputTruncated} exit=${exitCode}`, () => {
        const v = result({
          timedOut,
          outputTruncated,
          exitCode,
          stdout: "GIT binary patch",
          stderr: " owned failure ",
        });
        assert.deepEqual(f.toDiff(path, v), f.legacyDiff(path, v));
        assert.equal(
          f.toDiff(path, v).availability,
          timedOut
            ? "unavailable"
            : outputTruncated
              ? "truncated"
              : exitCode !== 0
                ? "unavailable"
                : "binary",
        );
      });
for (const stdout of [
  "",
  " \t\r\n\u00a0",
  "owned patch\n",
  "前文GIT binary patch尾",
  "Binary files owned differ",
  "binary files owned",
  "GIT binary Patch",
  "Binary files",
  "GIT binary\npatch",
  "\0owned",
  "\u2028patch\u2029",
])
  test(`literal output ${JSON.stringify(stdout)}`, () => {
    const r = result({ stdout });
    assert.deepEqual(f.toDiff(path, r), f.legacyDiff(path, r));
    assert.deepEqual(Object.keys(f.toDiff(path, r)), [
      "path",
      "availability",
      "patch",
      "beforeContent",
      "afterContent",
      "summary",
    ]);
  });
for (const allowedExitCodes of [[0], [0, 1], [], [Number.NaN]])
  for (const exitCode of [0, 1, null])
    test(`allowed codes ${allowedExitCodes} exit=${exitCode}`, () => {
      const v = result({ exitCode, stdout: "owned patch" }),
        o = { allowedExitCodes };
      assert.deepEqual(f.toDiff(path, v, o), f.legacyDiff(path, v, o));
    });
for (const summary of [undefined, null, "", "owned 文"])
  test(`nullish summaries ${JSON.stringify(summary)}`, () => {
    for (const stdout of ["", "GIT binary patch"]) {
      const r = result({ stdout }),
        o = { emptySummary: summary, binarySummary: summary } as Parameters<typeof f.toDiff>[2];
      assert.deepEqual(f.toDiff(path, r, o), f.legacyDiff(path, r, o));
    }
  });
for (const [stderr, stdout, exitCode] of [
  [" owned stderr ", "owned stdout", 2],
  [" \n", " owned stdout ", 2],
  ["", "", null],
] as const)
  test(`error prose fallback ${JSON.stringify([stderr, stdout, exitCode])}`, () => {
    const r = result({ stderr, stdout, exitCode });
    assert.deepEqual(f.toDiff(path, r), f.legacyDiff(path, r));
  });
function observe(legacy: boolean, outcome: string, failAt?: string) {
  const trace: string[] = [],
    failure = new Error("owned getter failure");
  let reads = 0;
  const r = new Proxy(
    result({
      timedOut: outcome === "timeout",
      outputTruncated: outcome === "truncated",
      exitCode: outcome === "failure" ? 2 : 0,
      stdout: outcome === "empty" ? "" : outcome === "binary" ? "GIT binary patch" : "owned patch",
      stderr: "owned failure",
    }),
    {
      get(t, k) {
        trace.push(String(k));
        if (k === failAt) throw failure;
        if (k === "stdout" && outcome === "changing")
          return ["nonblank", "ordinary", "last raw\n"][reads++];
        return Reflect.get(t, k);
      },
    },
  );
  const o = new Proxy(
    { allowedExitCodes: [0], emptySummary: "owned empty", binarySummary: "owned binary" },
    {
      get(t, k) {
        trace.push(`options.${String(k)}`);
        if (`options.${String(k)}` === failAt) throw failure;
        return Reflect.get(t, k);
      },
    },
  );
  try {
    return { trace, value: (legacy ? f.legacyDiff : f.toDiff)(path, r, o) };
  } catch (error) {
    assert.equal(error, failure);
    return { trace, error: (error as Error).message };
  }
}
for (const outcome of ["timeout", "truncated", "failure", "empty", "binary", "patch", "changing"])
  test(`exact lazy getter/read order ${outcome}`, () =>
    assert.deepEqual(observe(false, outcome), observe(true, outcome)));
for (const [outcome, key] of [
  ["patch", "timedOut"],
  ["patch", "outputTruncated"],
  ["patch", "options.allowedExitCodes"],
  ["patch", "exitCode"],
  ["failure", "stderr"],
  ["empty", "options.emptySummary"],
  ["binary", "options.binarySummary"],
  ["patch", "stdout"],
])
  test(`throws before lower priority ${outcome}/${key}`, () =>
    assert.deepEqual(observe(false, outcome!, key), observe(true, outcome!, key)));
test("caller inputs unchanged, output fresh and raw patch retained", () => {
  const v = result({ stdout: "  owned raw patch\r\n" }),
    before = { ...v },
    a = f.toDiff(path, v),
    b = f.toDiff(path, v);
  assert.deepEqual(v, before);
  assert.notEqual(a, b);
  assert.equal(a.patch, v.stdout);
  assert.equal(a.summary, null);
});
test("reentrant classification owns independent verdict/output", () => {
  function observe(legacy: boolean) {
    const classify = legacy ? f.legacyDiff : f.toDiff;
    let nested: unknown;
    const input = result({ stdout: "owned patch" });
    Object.defineProperty(input, "timedOut", {
      get() {
        nested = classify("owned nested", result({ timedOut: true }));
        return false;
      },
    });
    return { outer: classify(path, input), nested };
  }
  assert.deepEqual(observe(false), observe(true));
});
