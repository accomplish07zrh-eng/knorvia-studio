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
// 关键点：一条 import / re-export **语句**常常跨多行（`export type {` + 一串名字 + `} from "x";`），
// 只丢首行会让名字列表与 `} from "…";` 留在比较集里，把包含率抬高。因此按语句整条丢弃。
const DROPPED_PREFIXES = ["import ", "export * from", "export {"];
const IMPORT_STATEMENT = /^import\s/u;
const DYNAMIC_IMPORT = /^import\s*\(/u;
const RE_EXPORT_STATEMENT =
  /^export\s+(?:\*\s*(?:as\s+[A-Za-z_$][\w$]*\s*)?(?:from\s+|\{)|type\s*\{|\{)/u;
// 计划书强制新文件带 SPDX 头，上游也普遍有同一行：它是强制的样板，不是实现或可改写文案，
// 计入「保留表达」没有意义，因此规范化阶段两侧一视同仁地剔除它（以及紧随其后的版权行）。
const LICENSE_HEADER = /SPDX-License-Identifier/u;
const COPYRIGHT_LINE = /copyright/iu;

function isImportOrReExportStart(line) {
  if (DYNAMIC_IMPORT.test(line)) return false; // 动态 import(…) 是表达式，属于实现
  return IMPORT_STATEMENT.test(line) || RE_EXPORT_STATEMENT.test(line);
}

/** 一条 import / re-export 语句覆盖到的最后一行下标（含）。 */
function importStatementEnd(raw, start) {
  let depth = 0;
  for (let index = start; index < raw.length && index - start < 40; index += 1) {
    const text = raw[index];
    for (const char of text) {
      if (char === "{" || char === "(" || char === "[") depth += 1;
      else if (char === "}" || char === ")" || char === "]") depth -= 1;
    }
    if (depth <= 0 && /;\s*(?:\/\/.*)?$/u.test(text)) return index;
    if (index === start && depth <= 0 && /from\s*["'][^"']*["']\s*(?:\/\/.*)?$/u.test(text)) {
      return index; // 无分号风格的单行 import/re-export
    }
  }
  return start;
}

function normalizeLine(raw) {
  const line = raw.trim();
  if (line === "") return null;
  if (PUNCTUATION_ONLY.test(line)) return null;
  if (DROPPED_PREFIXES.some((prefix) => line.startsWith(prefix))) return null;
  return line;
}

/**
 * 记账口径的行规范化：去首尾空白、空行、纯分隔符行与 import/re-export，注释保留。
 * 这里的语义保持不变，供相似度测试与人工抽查使用；相似度门禁的防刷口径（先格式
 * 化再去注释、只计代码行）由 similarity-normalize.mjs 的 gateLines 负责，两者互不影响。
 */
export function normalizeLines(text) {
  const raw = text.split(/\r?\n/u);
  const lines = [];
  for (let index = 0; index < raw.length; index += 1) {
    if (LICENSE_HEADER.test(raw[index])) {
      if (COPYRIGHT_LINE.test(raw[index + 1] ?? "")) index += 1;
      continue;
    }
    if (isImportOrReExportStart(raw[index].trim())) {
      // 整条语句（含多行续行）都不参与比较；它属于接口面，不是实现表达。
      index = importStatementEnd(raw, index);
      continue;
    }
    const line = normalizeLine(raw[index]);
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
  return longestRunDetail(candidateLines, comparedLines).length;
}

/** 与 longestRun 同算法，但返回位置，便于 --explain 指路。 */
export function longestRunDetail(candidateLines, comparedLines) {
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
  let longest = { length: 0, candidateStart: -1, comparedStart: -1 };
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
      if (length > longest.length) {
        longest = { length, candidateStart: index, comparedStart: pairs[offset + 1] };
      }
    }
  }
  return longest;
}

/** 逐行解释：候选里哪些行在比较文件中出现过（0 基下标 + 文本），供 --explain 指路。 */
export function explainContainment(candidateLines, comparedLines) {
  const present = new Set(comparedLines);
  const matched = [];
  candidateLines.forEach((line, index) => {
    if (present.has(line)) matched.push({ index, line });
  });
  return matched;
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
