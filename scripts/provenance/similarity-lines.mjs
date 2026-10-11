// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 行相似度：与记账（docs/knorvia-provenance-bookkeeping-20261010.md 第 4 节）同一算法。
//
// 门槛常量（M0-8 校准后不再调整）：
// - 行门槛 0.2 / 8 行 / <10 行包含率为 0：任务计划书「工具要求」。
// - 结构门槛 0.4：在 439 个已登记 independent-replacement 文件上实测，最大结构相似度
//   为 1.000；按「能让它们全部通过的最小值、向上取到 0.05 的整数倍、超过 0.4 取 0.4」
//   得到 0.4，超过 0.4 的 23 个文件已列入替换队列。
//   详见 docs/knorvia-similarity-calibration-20261011.md。
export const THRESHOLDS = {
  minLines: 10,
  containment: 0.2,
  longestRun: 8,
  structural: 0.4,
};

const PUNCTUATION_ONLY = /^[{}()[\];,]+$/u;
// 记账口径：丢弃 import 与 re-export 行；注释行保留。
const DROPPED_PREFIXES = ["import ", "export * from", "export {"];

function normalizeLine(raw) {
  const line = raw.trim();
  if (line === "") return null;
  if (PUNCTUATION_ONLY.test(line)) return null;
  if (DROPPED_PREFIXES.some((prefix) => line.startsWith(prefix))) return null;
  return line;
}

export function normalizeLines(text) {
  const lines = [];
  for (const raw of text.split(/\r?\n/u)) {
    const line = normalizeLine(raw);
    if (line !== null) lines.push(line);
  }
  return lines;
}

// 只与同类文件比较：ts/tsx/mts/cts/js/jsx/mjs/cjs 同属一组，其余按扩展名各自成组。
const SCRIPT_EXTENSIONS = new Set(["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"]);

export function fileKind(path) {
  const match = /\.([A-Za-z0-9]+)$/u.exec(path);
  const extension = match ? match[1].toLowerCase() : "(none)";
  return SCRIPT_EXTENSIONS.has(extension) ? "script" : extension;
}

export function isBinary(bytes) {
  return bytes.includes(0);
}

/** 包含率：某比较文件包含的候选行数 ÷ 候选规范化行数。 */
export function containment(candidateLines, comparedLines) {
  if (candidateLines.length === 0) return 0;
  const present = new Set(comparedLines);
  let matched = 0;
  for (const line of candidateLines) if (present.has(line)) matched += 1;
  return matched / candidateLines.length;
}

/**
 * 最长连续相同段：按（比较文件，位置偏移）对角线做种子扩展。
 * 同一对角线只从最先出现的候选位置向前延伸一次，并记录结束位置以避免跳段。
 */
export function longestRun(candidateLines, comparedLines) {
  const positions = new Map();
  comparedLines.forEach((line, index) => {
    const list = positions.get(line);
    if (list) list.push(index);
    else positions.set(line, [index]);
  });
  const diagonals = new Map();
  candidateLines.forEach((line, index) => {
    for (const position of positions.get(line) ?? []) {
      const diagonal = position - index;
      const list = diagonals.get(diagonal);
      if (list) list.push(index, position);
      else diagonals.set(diagonal, [index, position]);
    }
  });
  let longest = 0;
  for (const pairs of diagonals.values()) {
    let covered = -1;
    for (let offset = 0; offset < pairs.length; offset += 2) {
      const index = pairs[offset];
      if (index <= covered) continue;
      let length = 0;
      let candidate = index;
      let compared = pairs[offset + 1];
      while (
        candidate < candidateLines.length &&
        compared < comparedLines.length &&
        candidateLines[candidate] === comparedLines[compared]
      ) {
        length += 1;
        candidate += 1;
        compared += 1;
      }
      covered = candidate - 1;
      if (length > longest) longest = length;
    }
  }
  return longest;
}

/** 行门槛：≥10 行时包含率 < 0.2 且最长段 < 8；<10 行时包含率必须为 0。 */
export function lineViolations(lineCount, metrics) {
  const violations = [];
  if (lineCount < THRESHOLDS.minLines) {
    if (metrics.maxContainment.value !== 0)
      violations.push(
        `containment ${format(metrics.maxContainment.value)} must be 0 below ${THRESHOLDS.minLines} normalized lines`,
      );
    return violations;
  }
  if (metrics.maxContainment.value >= THRESHOLDS.containment)
    violations.push(
      `containment ${format(metrics.maxContainment.value)} >= ${THRESHOLDS.containment}`,
    );
  if (metrics.longestRun.value >= THRESHOLDS.longestRun)
    violations.push(
      `longest identical run ${metrics.longestRun.value} >= ${THRESHOLDS.longestRun}`,
    );
  return violations;
}

export function format(value) {
  return value.toFixed(3);
}
