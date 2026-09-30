// Frozen synthetic input/output contracts; repository transition licence retained.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as source from "../src/tool/edit-matchers.js";
import * as emitted from "../dist/tool/edit-matchers.js";
const cases = JSON.parse(
  fs.readFileSync(new URL("./fixtures/edit-matchers-contract.json", import.meta.url), "utf8"),
);
for (const [mode, api] of [
  ["source", source],
  ["emitted", emitted],
] as const) {
  const { findEditMatch, preserveQuoteStyle, normalizeLineEndings, normalizeReplacementForMatch } =
    api;
  test(mode + " Edit preserves large sparse escapes", () => {
    const prefix = "x".repeat(100_000),
      suffix = "z".repeat(100_000);
    assert.equal(
      normalizeReplacementForMatch("escape_normalized", prefix + "\\n" + suffix),
      prefix + "\n" + suffix,
    );
    assert.deepEqual(
      findEditMatch({
        content: prefix + "中" + suffix,
        search: prefix + "\\u4e2d" + suffix,
        replaceAll: false,
      }),
      {
        status: "matched",
        actualString: prefix + "中" + suffix,
        strategy: "unicode_escape_normalized",
        candidateCount: 1,
      },
    );
  });
  for (const row of cases.match)
    test(mode + " Edit matcher " + row.label, () =>
      assert.deepEqual(findEditMatch(row.input), row.expected),
    );
  for (const row of cases.quote)
    test(mode + " Edit " + row.label, () =>
      assert.equal(preserveQuoteStyle(row.args[0], row.args[1], row.args[2]), row.expected),
    );
  for (const row of cases.endings)
    test(mode + " Edit " + row.label, () =>
      assert.equal(normalizeLineEndings(row.input), row.expected),
    );
  for (const row of cases.replacement)
    test(mode + " Edit replacement " + row.label, () =>
      assert.equal(normalizeReplacementForMatch(row.strategy, row.input), row.expected),
    );
}
