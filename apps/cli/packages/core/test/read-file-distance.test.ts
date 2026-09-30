// Synthetic bounded-distance contracts; transition licence retained.
import assert from "node:assert/strict";
import test from "node:test";
import { withinReadSuggestionDistance } from "../src/tool/handlers/read-file-suggestion.js";

function fullDistance(left: string, right: string): number {
  const d = Array.from({ length: left.length + 1 }, (_, i) =>
    Array.from({ length: right.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= left.length; i++)
    for (let j = 1; j <= right.length; j++)
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
  return d[left.length]![right.length]!;
}
test("bounded edit distance agrees with complete UTF-16 matrices for all short pairs", () => {
  const words = [""];
  let layer = [""];
  for (let size = 1; size <= 4; size++) {
    layer = layer.flatMap((prefix) => ["a", "中", "😀"].map((char) => prefix + char));
    words.push(...layer);
  }
  let cases = 0;
  for (const a of words)
    for (const b of words) {
      assert.equal(
        withinReadSuggestionDistance(a, b),
        fullDistance(a, b) <= 3,
        JSON.stringify({ a, b }),
      );
      cases++;
    }
  assert.equal(cases, 14641);
});
test("long equal-prefix and length-rejection inputs need no unbounded distance matrix", () => {
  const prefix = "x".repeat(250_000);
  assert.equal(withinReadSuggestionDistance(prefix + "a", prefix + "b"), true);
  assert.equal(withinReadSuggestionDistance(prefix, prefix + "yyyy"), false);
  assert.equal(withinReadSuggestionDistance("abcd", "wxyz"), false);
  assert.equal(withinReadSuggestionDistance("ab", "ba"), true);
});
