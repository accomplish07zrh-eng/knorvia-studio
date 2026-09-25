import assert from "node:assert/strict";
import { test } from "node:test";
import type { StudioRun } from "@knorvia/services";
import {
  STUDIO_RUN_HISTORY_ACTIVE_STATES,
  STUDIO_RUN_HISTORY_COMPACT_WINDOW,
  STUDIO_RUN_HISTORY_WINDOW,
  studioRunHistoryWindow,
} from "../src/studio/runtime/studioRunHistoryWindow.js";

/** 服务端投影是时间倒序（最新在前），夹具必须保持同样顺序。 */
function history(count: number, state: StudioRun["state"] = "succeeded"): StudioRun[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `run-${index}`,
    targetId: "target",
    kind: "workflow",
    state,
    input: "",
    createdAt: 1000 - index,
    updatedAt: 1000 - index,
    attempt: 1,
    checkpoint: { steps: {}, values: {}, completedRounds: 0 },
  }));
}

test("the full panel renders only the newest window and reports the remainder", () => {
  const runs = history(100);
  const window = studioRunHistoryWindow({ runs, initial: STUDIO_RUN_HISTORY_WINDOW });
  assert.equal(window.visible.length, STUDIO_RUN_HISTORY_WINDOW);
  assert.deepEqual(
    window.visible.map((run) => run.id),
    runs.slice(0, STUDIO_RUN_HISTORY_WINDOW).map((run) => run.id),
  );
  assert.equal(window.hiddenCount, 100 - STUDIO_RUN_HISTORY_WINDOW);
  assert.equal(window.nextPageCount, STUDIO_RUN_HISTORY_WINDOW);
});

test("the compact window keeps exactly the previous three-run behaviour without paging", () => {
  const runs = history(100);
  const window = studioRunHistoryWindow({
    runs,
    initial: STUDIO_RUN_HISTORY_COMPACT_WINDOW,
    extra: 0,
    pinned: [],
  });
  assert.deepEqual(
    window.visible.map((run) => run.id),
    ["run-0", "run-1", "run-2"],
  );
  assert.equal(window.hiddenCount, 97);
  // compact 调用方不渲染分页控件，因此这里只断言窗口本身与旧 slice(0, 3) 等价。
  assert.deepEqual(
    window.visible.map((run) => run.id),
    runs.slice(0, 3).map((run) => run.id),
  );
});

test("paging reveals the whole history in order without losing or duplicating a run", () => {
  const runs = history(100);
  let pages = 0;
  let window = studioRunHistoryWindow({ runs, initial: STUDIO_RUN_HISTORY_WINDOW, extra: 0 });
  assert.equal(window.visible.length, STUDIO_RUN_HISTORY_WINDOW);
  while (window.hiddenCount > 0) {
    const before = window.visible.length;
    pages += 1;
    assert.ok(pages <= 10, "paging must terminate");
    window = studioRunHistoryWindow({
      runs,
      initial: STUDIO_RUN_HISTORY_WINDOW,
      extra: pages * STUDIO_RUN_HISTORY_WINDOW,
    });
    // 每次点击最多再展开一页，且持续推进到全部可见。
    assert.equal(window.visible.length, Math.min(runs.length, before + STUDIO_RUN_HISTORY_WINDOW));
    assert.deepEqual(
      window.visible.map((run) => run.id),
      runs.slice(0, window.visible.length).map((run) => run.id),
    );
  }
  assert.equal(pages, 4);
  assert.equal(window.visible.length, runs.length);
  assert.deepEqual(
    window.visible.map((run) => run.id),
    runs.map((run) => run.id),
  );
  assert.equal(new Set(window.visible.map((run) => run.id)).size, runs.length);
  assert.equal(window.hiddenCount, 0);
  assert.equal(window.nextPageCount, 0);
});

test("an active run outside the window stays rendered so its controls remain reachable", () => {
  const runs = history(100);
  runs[40] = { ...runs[40]!, state: "waiting" };
  const window = studioRunHistoryWindow({
    runs,
    initial: STUDIO_RUN_HISTORY_WINDOW,
    pinned: runs
      .filter((run) => STUDIO_RUN_HISTORY_ACTIVE_STATES.includes(run.state))
      .map((run) => run.id),
  });
  assert.equal(window.visible.length, 41);
  assert.equal(window.visible.at(-1)!.id, "run-40");
  assert.equal(window.hiddenCount, 59);
  assert.ok(window.visible.some((run) => run.state === "waiting"));
});

test("the run under review stays rendered when newer runs push it past the window", () => {
  const runs = history(100);
  const window = studioRunHistoryWindow({
    runs,
    initial: STUDIO_RUN_HISTORY_WINDOW,
    pinned: ["run-35"],
  });
  assert.equal(window.visible.at(-1)!.id, "run-35");
  assert.ok(window.visible.some((run) => run.id === "run-35"));
});

test("pinned ids that are not in this history leave the window untouched", () => {
  const runs = history(30);
  const plain = studioRunHistoryWindow({ runs, initial: STUDIO_RUN_HISTORY_WINDOW });
  const withUnknownPin = studioRunHistoryWindow({
    runs,
    initial: STUDIO_RUN_HISTORY_WINDOW,
    pinned: ["missing-run", undefined],
  });
  assert.deepEqual(withUnknownPin, plain);
});

test("empty, short and degenerate windows stay bounded and never fabricate runs", () => {
  assert.deepEqual(studioRunHistoryWindow({ runs: [], initial: STUDIO_RUN_HISTORY_WINDOW }), {
    visible: [],
    hiddenCount: 0,
    nextPageCount: 0,
  });
  const short = history(3);
  const window = studioRunHistoryWindow({ runs: short, initial: STUDIO_RUN_HISTORY_WINDOW });
  assert.equal(window.visible.length, 3);
  assert.equal(window.hiddenCount, 0);
  assert.equal(window.nextPageCount, 0);
  // 非法窗口大小按 0 处理，宁可少渲染也不能越界读取。
  const degenerate = studioRunHistoryWindow({
    runs: short,
    initial: Number.NaN,
    extra: -5,
  });
  assert.equal(degenerate.visible.length, 0);
  assert.equal(degenerate.hiddenCount, 3);
});
