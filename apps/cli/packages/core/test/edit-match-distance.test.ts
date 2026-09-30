// Exact-distance reference contracts; repository transition licence retained.
import assert from "node:assert/strict";
import test from "node:test";
import { editLineDistance as sourceDistance } from "../src/tool/edit-match-distance.js";
import { editLineDistance as emittedDistance } from "../dist/tool/edit-match-distance.js";
function reference(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[a.length]![b.length]!;
}
for (const [mode, editLineDistance] of [
  ["source", sourceDistance],
  ["emitted", emittedDistance],
] as const) {
  test(
    mode + " Edit exact distance agrees with full UTF-16 matrices, including shared affixes",
    () => {
      const words = [""];
      let layer = [""];
      for (let i = 0; i < 4; i++) {
        layer = layer.flatMap((s) => ["a", "中", "😀"].map((c) => s + c));
        words.push(...layer);
      }
      let cases = 0;
      for (const a of words)
        for (const b of words) {
          assert.equal(editLineDistance(a, b), reference(a, b), JSON.stringify({ a, b }));
          cases++;
        }
      assert.equal(cases, 14641);
    },
  );
  test(
    mode + " Edit distance trims large shared affixes but does not treat transposition as one edit",
    () => {
      const prefix = "x".repeat(100_000),
        suffix = "z".repeat(100_000);
      assert.equal(editLineDistance(prefix + "a" + suffix, prefix + "b" + suffix), 1);
      assert.equal(editLineDistance("ab", "ba"), 2);
      assert.equal(editLineDistance("abc", "axbc"), 1);
      assert.equal(editLineDistance("aba", "ba"), 1);
    },
  );
}
