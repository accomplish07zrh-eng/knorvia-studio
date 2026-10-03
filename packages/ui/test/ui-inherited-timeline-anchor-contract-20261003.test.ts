// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  distanceToBottom,
  isAtBottom,
  resolveFollowingAfterScroll,
  reconcileFollowingForContentAnchor,
  prependVirtualAnchorAdjustment,
  prependScrollAdjustment,
  historyPrefetchTriggerPx,
  shouldTriggerLoadOlder,
  timelineKeyboardScrollIntent,
  timelineWheelScrollIntent,
  timelineTouchScrollIntent,
  anchorActionAfterContentChange,
  shouldAdjustVirtualizerForItemSizeChange,
} from "../src/v4/timelineScrollAnchor.js";
const far = { scrollTop: 100, viewportHeight: 200, contentHeight: 600 };
const bottom = { scrollTop: 400, viewportHeight: 200, contentHeight: 600 };

test("only user scroll events change following; layout and programmatic events preserve control", () => {
  for (const following of [false, true])
    for (const metrics of [far, bottom]) {
      for (const source of ["layout", "programmatic"] as const)
        assert.equal(resolveFollowingAfterScroll({ following, metrics, source }), following);
      assert.equal(
        resolveFollowingAfterScroll({ following, metrics: bottom, source: "user" }),
        true,
      );
      assert.equal(resolveFollowingAfterScroll({ following, metrics: far, source: "user" }), false);
    }
  assert.equal(distanceToBottom({ scrollTop: 0, viewportHeight: 300, contentHeight: 100 }), 0);
  assert.equal(isAtBottom({ ...bottom, scrollTop: 352 }), true);
  assert.equal(isAtBottom({ ...bottom, scrollTop: 351.9 }), false);
  assert.equal(
    resolveFollowingAfterScroll({ following: true, metrics: far, source: "user", epsilonPx: 300 }),
    true,
  );
});

test("content commits honor explicit departure and no-input hold before geometric evidence", () => {
  for (const following of [false, true])
    for (const metrics of [far, bottom]) {
      assert.equal(
        reconcileFollowingForContentAnchor({
          following,
          metrics,
          lastObservedScrollTop: 400,
          userScrollIntent: "awayFromBottom",
        }),
        false,
      );
      assert.equal(
        reconcileFollowingForContentAnchor({
          following,
          metrics,
          lastObservedScrollTop: 400,
          userScrollIntent: "none",
        }),
        following,
      );
    }
  for (const userScrollIntent of ["unknown", "towardBottom"] as const) {
    assert.equal(
      reconcileFollowingForContentAnchor({
        following: false,
        metrics: bottom,
        lastObservedScrollTop: 500,
        userScrollIntent,
      }),
      true,
    );
    assert.equal(
      reconcileFollowingForContentAnchor({
        following: true,
        metrics: { ...far, scrollTop: 98 },
        lastObservedScrollTop: 100,
        userScrollIntent,
      }),
      true,
    );
    assert.equal(
      reconcileFollowingForContentAnchor({
        following: true,
        metrics: { ...far, scrollTop: 97.9 },
        lastObservedScrollTop: 100,
        userScrollIntent,
      }),
      false,
    );
    assert.equal(
      reconcileFollowingForContentAnchor({
        following: false,
        metrics: far,
        lastObservedScrollTop: 100,
        userScrollIntent,
      }),
      false,
    );
  }
  assert.equal(
    reconcileFollowingForContentAnchor({
      following: true,
      metrics: { ...far, scrollTop: 95 },
      lastObservedScrollTop: 100,
      scrollEpsilonPx: 10,
    }),
    true,
  );
});

test("stable-key prepend restores saved viewport offset using the live scroll position", () => {
  const previous = { key: "turn-a", offsetTop: 20, start: 100 };
  const next = { key: "turn-a", offsetTop: 999, start: 280 };
  assert.equal(prependVirtualAnchorAdjustment(previous, next, 160), 100);
  assert.equal(prependVirtualAnchorAdjustment(previous, next, 260), 0);
  assert.equal(prependVirtualAnchorAdjustment(previous, next, 300), -40);
  assert.equal(prependVirtualAnchorAdjustment(previous, { ...next, key: "other" }, 160), null);
  assert.equal(prependVirtualAnchorAdjustment({ ...previous, start: Infinity }, next, 160), 100);
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(
      prependVirtualAnchorAdjustment({ ...previous, offsetTop: value }, next, 160),
      null,
    );
    assert.equal(prependVirtualAnchorAdjustment(previous, { ...next, start: value }, 160), null);
    assert.equal(prependVirtualAnchorAdjustment(previous, next, value), null);
  }
});

test("row prepend compensates only established earlier rows with positive total growth", () => {
  const input = { prevFirstRowId: 20, nextFirstRowId: 10, prevTotalSize: 200, nextTotalSize: 320 };
  assert.equal(prependScrollAdjustment(input), 120);
  for (const nextFirstRowId of [20, 30, null])
    assert.equal(prependScrollAdjustment({ ...input, nextFirstRowId }), null);
  assert.equal(prependScrollAdjustment({ ...input, prevFirstRowId: null }), null);
  for (const nextTotalSize of [100, 200, NaN])
    assert.equal(prependScrollAdjustment({ ...input, nextTotalSize }), null);
  // 这些纯数值 helper 未引入数据校验；保留原 Infinity/NaN 比较结果。
  assert.equal(prependScrollAdjustment({ ...input, nextTotalSize: Infinity }), Infinity);
  assert.equal(prependScrollAdjustment({ ...input, prevFirstRowId: NaN }), 120);
});

test("wheel, touch and keyboard mappings retain keys, shifted space and editable exclusions", () => {
  assert.deepEqual([-1, 0, 1].map(timelineWheelScrollIntent), [
    "awayFromBottom",
    "none",
    "towardBottom",
  ]);
  assert.deepEqual(
    [99, 100, 101].map((y) => timelineTouchScrollIntent(100, y)),
    ["towardBottom", "none", "awayFromBottom"],
  );
  for (const key of ["ArrowUp", "PageUp", "Home"])
    assert.equal(
      timelineKeyboardScrollIntent({ key, shiftKey: false, editableTarget: false }),
      "awayFromBottom",
    );
  for (const key of ["ArrowDown", "PageDown", "End", " "])
    assert.equal(
      timelineKeyboardScrollIntent({ key, shiftKey: false, editableTarget: false }),
      "towardBottom",
    );
  assert.equal(
    timelineKeyboardScrollIntent({ key: " ", shiftKey: true, editableTarget: false }),
    "awayFromBottom",
  );
  assert.equal(
    timelineKeyboardScrollIntent({ key: "Home", shiftKey: false, editableTarget: true }),
    "none",
  );
  assert.equal(
    timelineKeyboardScrollIntent({ key: "Enter", shiftKey: false, editableTarget: false }),
    "none",
  );
});

test("history thresholds and content/measurement actions retain their original boundaries", () => {
  assert.deepEqual(
    [0, -1, NaN, Infinity, 20, 40, 300].map(historyPrefetchTriggerPx),
    [64, 64, 64, 64, 64, 80, 600],
  );
  assert.equal(
    shouldTriggerLoadOlder({ scrollTop: 64, canLoadOlder: true, loadingOlder: false }),
    true,
  );
  assert.equal(
    shouldTriggerLoadOlder({ scrollTop: 64.1, canLoadOlder: true, loadingOlder: false }),
    false,
  );
  assert.equal(
    shouldTriggerLoadOlder({ scrollTop: 0, canLoadOlder: true, loadingOlder: true }),
    false,
  );
  assert.equal(
    shouldTriggerLoadOlder({ scrollTop: 0, canLoadOlder: false, loadingOlder: false }),
    false,
  );
  assert.equal(anchorActionAfterContentChange(true, true), "hold");
  assert.equal(anchorActionAfterContentChange(true), "stickToBottom");
  assert.equal(
    shouldAdjustVirtualizerForItemSizeChange({
      following: false,
      suppressAdjustment: false,
      contentWidthChanging: false,
      itemEnd: 100,
      scrollTop: 100,
    }),
    true,
  );
  assert.equal(
    shouldAdjustVirtualizerForItemSizeChange({
      following: true,
      suppressAdjustment: false,
      contentWidthChanging: false,
      itemEnd: 100,
      scrollTop: 100,
    }),
    false,
  );
});
