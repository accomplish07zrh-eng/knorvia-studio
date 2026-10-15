// SPDX-License-Identifier: Apache-2.0
// 关键元素几何：按 data-testid 取包围盒，比较时偏差不得超过约定的像素阈值。
// 只用像素比较会被字体抗锯齿误报，只用几何会漏掉颜色变动，两者都必须看。

export const DEFAULT_BOX_TOLERANCE_PX = 2;

function round(value) {
  return Math.round(value * 100) / 100;
}

/**
 * 在页面里取每个 testid 的包围盒。返回 Promise 供 page.evaluate 调用。
 * 同名元素命中多个时取 DOM 顺序里第一个可见元素，并记录命中数量。
 */
function collectGeometryInPage(testIds) {
  const wanted = new Set(testIds);
  const entries = new Map();
  for (const element of document.querySelectorAll("[data-testid]")) {
    const id = element.getAttribute("data-testid");
    if (id === null || !wanted.has(id)) continue;
    const box = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const visible =
      box.width > 0 &&
      box.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      style.opacity !== "0";
    const round2 = (value) => Math.round(value * 100) / 100;
    const candidate = {
      x: round2(box.x),
      y: round2(box.y),
      width: round2(box.width),
      height: round2(box.height),
      visible,
    };
    const entry = entries.get(id) ?? { matches: 0, visibleMatches: 0, box: null };
    entry.matches += 1;
    if (visible) entry.visibleMatches += 1;
    if (entry.box === null || (visible && !entry.box.visible)) entry.box = candidate;
    entries.set(id, entry);
  }
  const result = {};
  for (const id of wanted) {
    result[id] = entries.get(id) ?? { matches: 0, visibleMatches: 0, box: null };
  }
  return result;
}

/** 在页面上下文中采集几何。 */
export async function collectGeometry(page, testIds) {
  return page.evaluate(collectGeometryInPage, testIds);
}

function boxDelta(baseline, current) {
  return {
    x: round(current.x - baseline.x),
    y: round(current.y - baseline.y),
    width: round(current.width - baseline.width),
    height: round(current.height - baseline.height),
  };
}

function withinTolerance(delta, tolerancePx) {
  return (
    Math.abs(delta.x) <= tolerancePx &&
    Math.abs(delta.y) <= tolerancePx &&
    Math.abs(delta.width) <= tolerancePx &&
    Math.abs(delta.height) <= tolerancePx
  );
}

/**
 * 比较两份几何快照。返回逐项结果与失败项列表（供退出码与报告使用）。
 * 失败条件：元素出现/消失、命中数量变化、任一包围盒分量偏差超过阈值。
 */
export function compareGeometry(baseline, current, tolerancePx = DEFAULT_BOX_TOLERANCE_PX) {
  const ids = [...new Set([...Object.keys(baseline ?? {}), ...Object.keys(current ?? {})])].sort();
  const entries = [];
  const failures = [];
  for (const id of ids) {
    const before = baseline?.[id] ?? { matches: 0, visibleMatches: 0, box: null };
    const after = current?.[id] ?? { matches: 0, visibleMatches: 0, box: null };
    if (before.matches === 0 && after.matches === 0) {
      entries.push({ testId: id, status: "absent-both" });
      failures.push({ testId: id, reason: "missing" });
      continue;
    }
    if (before.matches === 0) {
      entries.push({ testId: id, status: "appeared", current: after });
      failures.push({ testId: id, reason: "appeared" });
      continue;
    }
    if (after.matches === 0) {
      entries.push({ testId: id, status: "disappeared", baseline: before });
      failures.push({ testId: id, reason: "disappeared" });
      continue;
    }
    if (before.matches !== after.matches) {
      entries.push({
        testId: id,
        status: "match-count-changed",
        baselineMatches: before.matches,
        currentMatches: after.matches,
      });
      failures.push({
        testId: id,
        reason: "match-count-changed",
        baselineMatches: before.matches,
        currentMatches: after.matches,
      });
      continue;
    }
    const beforeBox = before.box;
    const afterBox = after.box;
    if (!beforeBox || !afterBox) {
      entries.push({
        testId: id,
        status: "visibility-changed",
        baselineBox: beforeBox,
        currentBox: afterBox,
      });
      failures.push({ testId: id, reason: "visibility-changed" });
      continue;
    }
    const delta = boxDelta(beforeBox, afterBox);
    const ok = withinTolerance(delta, tolerancePx);
    entries.push({ testId: id, status: ok ? "within-tolerance" : "out-of-tolerance", delta });
    if (!ok) failures.push({ testId: id, reason: "out-of-tolerance", delta, tolerancePx });
  }
  return { tolerancePx, entries, failures, passed: failures.length === 0 };
}
