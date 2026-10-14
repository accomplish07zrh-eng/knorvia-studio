// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { compareGeometry, DEFAULT_BOX_TOLERANCE_PX } from "../lib/geometry.mjs";

function entry(x, y, width, height, matches = 1) {
  return { matches, visibleMatches: matches, box: { x, y, width, height, visible: true } };
}

test("包围盒完全一致时通过", () => {
  const snapshot = { "v4-composer": entry(10, 20, 100, 40) };
  const result = compareGeometry(snapshot, snapshot);
  assert.equal(result.passed, true);
  assert.equal(result.failures.length, 0);
  assert.equal(result.entries[0].status, "within-tolerance");
});

test("恰好 2 像素偏差通过，超出即失败", () => {
  const baseline = { sidebar: entry(0, 0, 200, 900) };
  const exactly = compareGeometry(baseline, { sidebar: entry(2, -2, 202, 902) });
  assert.equal(exactly.passed, true, "边界值 2 像素必须通过");
  const beyond = compareGeometry(baseline, { sidebar: entry(2.01, 0, 200, 900) });
  assert.equal(beyond.passed, false);
  assert.equal(beyond.failures[0].reason, "out-of-tolerance");
  assert.equal(beyond.failures[0].testId, "sidebar");
  assert.equal(beyond.tolerancePx, DEFAULT_BOX_TOLERANCE_PX);
});

test("元素消失、出现与命中数量变化都判失败", () => {
  const baseline = { a: entry(0, 0, 10, 10), b: entry(0, 0, 10, 10), c: entry(0, 0, 10, 10) };
  const current = { a: entry(0, 0, 10, 10), c: entry(0, 0, 10, 10, 2) };
  const result = compareGeometry(baseline, current);
  const reasons = Object.fromEntries(
    result.failures.map((failure) => [failure.testId, failure.reason]),
  );
  assert.deepEqual(reasons, { b: "disappeared", c: "match-count-changed" });
  assert.equal(result.passed, false);
});

test("两侧都缺该 testid 时明确报缺失", () => {
  const result = compareGeometry(
    { x: { matches: 0, box: null } },
    { x: { matches: 0, box: null } },
  );
  assert.equal(result.passed, false);
  assert.equal(result.failures[0].reason, "missing");
});

test("可见性变化单独报告", () => {
  const baseline = { panel: { matches: 1, visibleMatches: 1, box: entry(0, 0, 5, 5).box } };
  const current = { panel: { matches: 1, visibleMatches: 0, box: null } };
  const result = compareGeometry(baseline, current);
  assert.equal(result.failures[0].reason, "visibility-changed");
});

test("比较结果按 testid 排序，便于稳定输出", () => {
  const result = compareGeometry({ b: entry(0, 0, 1, 1), a: entry(0, 0, 1, 1) }, {});
  assert.deepEqual(
    result.entries.map((item) => item.testId),
    ["a", "b"],
  );
});
