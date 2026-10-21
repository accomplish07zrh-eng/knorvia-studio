#!/usr/bin/env node
/* eslint-disable max-lines -- 相似度 CLI 入口：行/结构门槛与再导出追踪同文件便于审计。 */
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 相似度工具：行相似度 + 结构相似度。
//
// 比较对象：被替换的旧文件（--old，可来自指定提交）与整个上游固定提交（--upstream-dir，
// 仓库外缓存目录）。行比较前两侧都先用仓库配置的 oxfmt 统一格式化并去掉注释（只计代码行），
// 见 similarity-normalize.mjs；结构相似度本来就忽略空白与注释。
// 两道门槛的算法与校准见 scripts/provenance/similarity-lines.mjs、
// similarity-structural.mjs 与 docs/knorvia-similarity-calibration-20261011.md；
// 门槛写入常量后不再调整。
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  extractContractNames,
  extractDeclarationNames,
  isTooGenericName,
} from "./similarity-declarations.mjs";
import { loadCandidate, loadUpstream, readOldFile, readPathList } from "./similarity-inputs.mjs";
import { appendSiblingOldFiles, pathExistsInRev } from "./similarity-reexport.mjs";
import {
  THRESHOLDS,
  containment,
  explainContainment,
  format,
  lineViolations,
  longestRun,
  longestRunDetail,
} from "./similarity-lines.mjs";
import { loadOxfmtOptions } from "./similarity-normalize.mjs";
import { packedLiteralSplits } from "./similarity-packed-literal.mjs";
import {
  structuralFingerprints,
  structuralOverlap,
  structuralTokens,
} from "./similarity-structural.mjs";

const HELP = `用法: node scripts/provenance/similarity.mjs [选项]

候选（新实现文件）：
  --candidate <path>        候选文件，可重复；相对路径按 --repo 解析
  --candidate-list <file>   每行一个候选路径
  --classification <name>   取 <repo>/licensing/current-files.json 中该分类的全部文件
                             （例如 independent-replacement，用于校准与全量复跑）

比较对象：
  --old <path>              被替换的旧文件，可重复；相对路径按 --repo（或 --old-rev）解析
  --old-list <file>         每行一个旧文件路径
  --old-rev <rev>           旧文件取自该 git 提交（默认 beff12b5，计划执行基线）
  --source-map <file>       来源映射：拆分/移动产生的文件与其来源文件的对应关系
                            （默认 licensing/beff12b5-source-map.json；多来源取最高值）
  --dump-residual           打印剔除契约行后残留的行原文（含原始行号），供验收文档逐字贴出
  --dump-residual-limit <n> 限制每次打印的行数，默认 50；超出时提示总行数
  --dump-stripped           打印被剔掉的契约行原文，便于核对「是否剔得过宽」
  --allow-upstream-only     显式接受「只与上游比较」。默认不给 --old 会报错：
                            计划书要求同时对被替换的旧文件与上游检查，少一侧结果会偏低。
  --upstream-dir <dir>      上游固定提交的完整树（仓库外缓存目录，必需）
  --upstream-rev <rev>      上游固定提交号，只用于报告

声明文件：
  --interface <file>        interface.md，可重复；从中提取兼容名字
  --declaration             候选按纯声明文件处理：先剔除含兼容名字的行，再算两道门槛
  --contract-lines          契约行剔除：只剔除含 interface.md 逐条列出的完整名字（含带点号的
                            事件名/错误码）的行，再按原门槛计分；与 --declaration 互斥。
                            报告同时给出剔除前后两组行数与完整名字清单。
  --contract-module <path>  配合 --contract-lines：只取 interface.md 表格中模块列匹配该路径的
                            行。整包 interface.md 有数百条导出名，不过滤会剔掉邻居文件的契约行；
                            匹配不到时直接报错，不退化成整包清单。

其他：
  --repo <dir>              仓库根，默认当前目录
  --gates <all|line|structural>  默认 all
  --json <file>             输出 JSON 报告
  --calibrate               校准模式：打印（并写入报告）由候选集合推导的结构门槛
  --explain                 逐文件列出命中的归一化行（行号 + 文本）与最长连续段位置，
                            便于按行改写；不改变任何判定结果
  --help
`;

/**
 * 计划执行基线：M6 相似度比对统一固定到这个提交。
 *
 * 用户裁决（2026-10-21）：基线不按「上一次返工前」，而固定为计划执行基线，
 * 以防止多轮返工接力比较 —— 若每轮只与上一轮比，返工十轮后「与最初旧实现的相似度」
 * 从未被检查过。固定基线保证「无论返工几轮，最终必须与最初的旧实现不同」。
 */
const BASELINE_REV = "beff12b5";

/** 默认的来源映射文件（相对仓库根）；不存在时视为空映射。 */
const DEFAULT_SOURCE_MAP = "licensing/beff12b5-source-map.json";

function usageError(message) {
  process.stderr.write(`similarity: ${message}\n`);
  process.exit(2);
}

const { values } = parseArgs({
  options: {
    repo: { type: "string" },
    candidate: { type: "string", multiple: true },
    "candidate-list": { type: "string" },
    classification: { type: "string" },
    old: { type: "string", multiple: true },
    "old-list": { type: "string" },
    "old-rev": { type: "string" },
    "source-map": { type: "string" },
    "allow-upstream-only": { type: "boolean" },
    "dump-residual": { type: "boolean" },
    "dump-residual-limit": { type: "string" },
    "dump-stripped": { type: "boolean" },
    "upstream-dir": { type: "string" },
    "upstream-rev": { type: "string" },
    interface: { type: "string", multiple: true },
    declaration: { type: "boolean" },
    "contract-lines": { type: "boolean" },
    "contract-module": { type: "string" },
    gates: { type: "string" },
    json: { type: "string" },
    calibrate: { type: "boolean" },
    explain: { type: "boolean" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

const repo = resolve(values.repo ?? process.cwd());
const gates = values.gates ?? "all";
if (!["all", "line", "structural"].includes(gates)) usageError(`unknown --gates ${gates}`);
if (!values["upstream-dir"]) usageError("--upstream-dir is required");
const upstreamRoot = resolve(values["upstream-dir"]);

const candidatePaths = [...(values.candidate ?? [])];
if (values["candidate-list"]) candidatePaths.push(...readPathList(values["candidate-list"]));
if (values.classification) {
  const report = JSON.parse(readFileSync(join(repo, "licensing/current-files.json"), "utf8"));
  candidatePaths.push(
    ...report.files
      .filter((file) => file.classification === values.classification)
      .map((file) => file.path),
  );
}
if (!candidatePaths.length)
  usageError("no candidates: pass --candidate, --candidate-list or --classification");

// 契约行剔除与声明模式语义不同（剔单行 vs 剥整块），同时给会让报告无法解释，
// 因此在读取任何 interface.md 之前先拒绝。
if (values.declaration && values["contract-lines"])
  usageError("--declaration and --contract-lines are mutually exclusive");

const declarationNames = (values.interface ?? []).flatMap((file) =>
  extractDeclarationNames(readFileSync(resolve(file), "utf8")),
);
if (values.declaration && declarationNames.length === 0)
  usageError("--declaration requires --interface with at least one name");

// 契约行剔除：只认 interface.md 表格「导出名列」里逐条列出的名字（含带点号的事件名/错误码）。
// --contract-module 进一步把范围限到某一个模块行：整包 interface.md 有数百条导出名，
// 不按模块过滤会剔掉邻居文件的契约行。
const contractModule = values["contract-module"] ?? null;
if (contractModule && !values["contract-lines"])
  usageError("--contract-module requires --contract-lines");
const contractNames = values["contract-lines"]
  ? [
      ...new Set(
        (values.interface ?? []).flatMap((file) =>
          extractContractNames(readFileSync(resolve(file), "utf8"), contractModule),
        ),
      ),
    ]
  : [];
if (values["contract-lines"]) {
  if (contractNames.length === 0)
    usageError(
      contractModule
        ? `--contract-module ${contractModule} matched no row in the given --interface; add a row for this module or drop the flag`
        : "--contract-lines requires --interface with at least one name",
    );
  // 通用短名会把几乎每一行都剔掉，剔除将失去意义。这里跳过它们并显式告警：
  // interface.md 里出现 `event` / `code` 这类词是正常的，整体报错会让该模式无法使用。
  const generic = contractNames.filter((name) => isTooGenericName(name));
  if (generic.length > 0) {
    process.stderr.write(
      `similarity: --contract-lines skips over-generic names (would strip almost every line): ${generic.join(", ")}\n`,
    );
    for (const name of generic) contractNames.splice(contractNames.indexOf(name), 1);
  }
  if (contractNames.length === 0)
    usageError("--contract-lines: every extracted name was over-generic; nothing to strip");
}

const oxfmtOptions = loadOxfmtOptions(repo);

/**
 * 读取来源映射：`新路径 → [来源路径...]`。
 *
 * 用户裁决（2026-10-21）第 2 条：本计划中拆分或移动产生的文件，
 * 与其在基线上的来源文件比（多个来源取最高值）。映射值为数组正是为了「取最高」。
 * 文件不存在时返回空映射 —— 这是合法状态（当前 112 个待返工文件在 beff12b5 上全部同路径存在）。
 */
function loadSourceMap(repoRoot) {
  const mapPath = resolve(repoRoot, values["source-map"] ?? DEFAULT_SOURCE_MAP);
  if (!existsSync(mapPath)) return new Map();
  const parsed = JSON.parse(readFileSync(mapPath, "utf8"));
  const entries = Object.entries(parsed.files ?? {});
  const normalized = new Map();
  for (const [target, sources] of entries)
    normalized.set(target, Array.isArray(sources) ? sources : [sources]);
  return normalized;
}

/** 取某个候选在基线上的全部比较对象：同路径（若存在）+ 来源映射给出的路径。 */
function baselinePathsFor(candidatePath, sourceMap) {
  const paths = new Set();
  if (pathExistsInRev(repo, baselineRev, candidatePath)) paths.add(candidatePath);
  for (const source of sourceMap.get(candidatePath) ?? [])
    if (pathExistsInRev(repo, baselineRev, source)) paths.add(source);
  return [...paths];
}

const sourceMap = loadSourceMap(repo);
const givenOldPaths = [
  ...(values.old ?? []),
  ...(values["old-list"] ? readPathList(values["old-list"]) : []),
];

// 自动解析：显式 --old 优先；否则按基线规则为每个候选算出比较对象。
//   规则 1：基线同路径存在 → 与它比；
//   规则 2：来源映射给出 → 与各来源比（多来源取最高）；
//   规则 3：两者都没有 → 报错（除非显式 --allow-upstream-only）。
//
// 但基线 rev 本身可能不存在（测试夹具用临时仓库、或外部仓库没有该提交）——
// 此时基线规则无从谈起，跳过自动解析，仍由下面的「不传 --old 报错」兜住。
// `--old-rev` 未显式给出时：自动解析用计划基线；显式 `--old` 则取工作区。
const explicitOldRev = values["old-rev"];
const baselineRev = explicitOldRev ?? BASELINE_REV;

const baselineAvailable = (() => {
  try {
    execFileSync("git", ["cat-file", "-e", `${explicitOldRev ?? "HEAD"}^{commit}`], {
      cwd: repo,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
})();
const autoBaseline = givenOldPaths.length === 0 && baselineAvailable;
const resolvedOldPaths = autoBaseline
  ? [...new Set(candidatePaths.flatMap((path) => baselinePathsFor(path, sourceMap)))]
  : givenOldPaths;

// 规则 3：哪些候选在基线上完全找不到比较对象。
if (autoBaseline && !values["allow-upstream-only"]) {
  const orphaned = candidatePaths.filter((path) => baselinePathsFor(path, sourceMap).length === 0);
  if (orphaned.length > 0) {
    usageError(
      `${orphaned.length} 个候选在基线 ${baselineRev} 上既无同路径文件、也不在来源映射里：\n` +
        orphaned.map((path) => `  · ${path}`).join("\n") +
        "\n  按裁决第 3 条，这类文件只比上游，但必须显式声明 --allow-upstream-only。",
    );
  }
}
if (autoBaseline && values["allow-upstream-only"]) {
  const orphaned = candidatePaths.filter((path) => baselinePathsFor(path, sourceMap).length === 0);
  for (const path of orphaned)
    process.stdout.write(`similarity: ${path} — no-baseline-source → 只比上游\n`);
}
// 静默过滤是危险的：全部 `--old` 都失效时，门禁会退化成「只比上游」，
// 而计划书 L509 要求「对被替换的旧文件与上游固定提交都通过」——
// 少了旧文件那一侧，报出的数字会偏低，看起来更容易达标。
// 因此这里把「给了但解析不到」变成显式错误。
// 显式 --old 且未给 --old-rev → 用工作区（revision=undefined）；自动解析 → 用基线。
const oldRevision = autoBaseline ? baselineRev : explicitOldRev;
const oldPathArgs = resolvedOldPaths.filter((givenPath) =>
  pathExistsInRev(repo, oldRevision, givenPath),
);
const missingOldPaths = resolvedOldPaths.filter((givenPath) => !oldPathArgs.includes(givenPath));
if (missingOldPaths.length > 0) {
  usageError(
    `--old path(s) not found in ${oldRevision ?? "the worktree"}: ${missingOldPaths.join(", ")}\n` +
      "  拒绝静默退化为「只比上游」：旧文件那一侧缺席会让结果偏低。\n" +
      "  请确认路径与 --old-rev（例如旧文件所在的历史提交）。",
  );
}
if (resolvedOldPaths.length === 0 && !values["allow-upstream-only"]) {
  usageError(
    "no --old given: the gate requires comparing against the replaced old file as well as upstream " +
      "(plan L509).\n" +
      "  Pass --old/--old-list, or --allow-upstream-only to explicitly accept a upstream-only measurement.",
  );
}
const oldFiles = await Promise.all(
  oldPathArgs.map((givenPath) =>
    readOldFile({
      repo,
      givenPath,
      oxfmtOptions,
      revision: oldRevision,
      // 两侧对称剔除：旧文件用与候选相同的清单
      // （--contract-lines 用契约名，--declaration 用声明名）。
      stripNames: values["contract-lines"]
        ? contractNames
        : values.declaration
          ? declarationNames
          : [],
    }),
  ),
);
if (values["allow-upstream-only"] && resolvedOldPaths.length === 0) {
  process.stdout.write(
    "similarity: --allow-upstream-only — 只与上游比较；结果不含「与旧文件」那一侧，不能作为 L509 的达标依据\n",
  );
}

const upstream = await loadUpstream(upstreamRoot, { oxfmtOptions });
const candidates = await Promise.all(
  candidatePaths.map((givenPath) =>
    loadCandidate({
      repo,
      givenPath,
      declarationNames: values.declaration ? declarationNames : [],
      contractNames,
      oxfmtOptions,
    }),
  ),
);
const results = [];
for (const candidate of candidates) results.push(await evaluateLines(candidate));
if (gates !== "line") applyStructural(results);
// 压行拆分是独立 gate：与行/结构门槛分开计数，任一命中即 FAIL。
applyPackedLiteralGate(results, candidates);
for (const result of results) result.pass = result.violations.length === 0;
const failed = results.filter((result) => !result.pass);
for (const result of results) process.stdout.write(`${describe(result)}\n`);
if (values.explain) explainResults(candidates, results);
// 验收文档要求「逐字贴出残留代码」—— 「剔除多少行」不够，还要知道「剩下哪几行」。
if (values["dump-residual"] || values["dump-stripped"]) dumpContractLines(candidates, results);
const summary = {
  candidates: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  binary: results.filter((result) => result.binary).length,
  structuralSkipped: results.filter((result) => result.structuralSkipped).length,
};
const calibration = values.calibrate ? calibrate(results) : null;
process.stdout.write(
  `similarity: ${summary.candidates} candidate(s), ${summary.passed} passed, ${summary.failed} failed; upstream ${upstreamRoot} (${upstream.files.length} files, ${upstream.binary} binary) gates=${gates}\n`,
);
const comparedFallbacks =
  upstream.formatFallbacks + oldFiles.filter((file) => !file.binary && !file.formatted).length;
if (comparedFallbacks > 0)
  process.stdout.write(
    `format-fallback: ${upstream.formatFallbacks} upstream + ${comparedFallbacks - upstream.formatFallbacks} old file(s) kept original text\n`,
  );

if (values.json) {
  writeFileSync(
    resolve(values.json),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        thresholds: THRESHOLDS,
        gates,
        upstream: {
          root: upstreamRoot,
          revision: values["upstream-rev"] ?? null,
          files: upstream.files.length,
          binary: upstream.binary,
          formatFallbacks: upstream.formatFallbacks,
          kinds: upstream.kindCounts,
        },
        candidates: results,
        summary,
        ...(calibration ? { calibration } : {}),
        pass: failed.length === 0,
      },
      null,
      2,
    )}\n`,
  );
}
process.exit(failed.length === 0 ? 0 : 1);

async function evaluateLines(candidate) {
  const structuralSkipped = !candidate.binary && candidate.kind !== "script";
  const residualLines = candidate.binary ? 0 : candidate.lines.length;
  // 剔除行数由两个口径不同的量相减得来，必须夹住下界：
  //   linesBeforeStrip 取自格式化文本的归一化行数，residualLines 取自候选 lines；
  //   纯 re-export 文件格式化后 import/re-export 全被丢弃 → 前者为 0，而后者是展开追踪得到的名字行，
  //   相减就成了负数（实测 result-content-projection.ts 得到 -7）。这不是真实剔除，是口径差。
  const linesBeforeStrip = candidate.binary
    ? 0
    : Math.max(candidate.linesBeforeStrip, residualLines);
  const base = {
    path: candidate.givenPath,
    kind: candidate.kind,
    lines: residualLines,
    binary: candidate.binary,
    declaration: candidate.declaration ?? false,
    // 契约行剔除的完整记录：名字清单（审查重点）、剔除行数、剔除前后行数。
    contractExclusion: candidate.contractBaseline
      ? {
          names: candidate.contractBaseline.names,
          strippedLines: candidate.contractBaseline.strippedLines,
          suspiciousRatio: candidate.contractBaseline.suspiciousRatio,
          tooManyNames: candidate.contractBaseline.tooManyNames,
          ...(values["dump-residual"]
            ? { residualLines: candidate.contractBaseline.residual }
            : {}),
          ...(values["dump-stripped"]
            ? { strippedLinesText: candidate.contractBaseline.stripped }
            : {}),
          before: { residualLines: candidate.contractBaseline.totalLines },
          after: { residualLines },
        }
      : null,
    linesBeforeStrip,
    strippedLines: linesBeforeStrip - residualLines,
    residualLines,
    // 剩余行为 0 表示「没有可比对的实现行」，与「比出来的 0.000」是两件事：
    // 前者不构成达标依据（纯 re-export / 全剥空的纯声明），下游不得据此判为已完成。
    noComparableLines: residualLines === 0,
    // 没有任何上游文件参与比较（lineMetrics 的 maxContainment.file 为 null）：
    // 此时 PASS 只说明「没超标」，不说明「与上游对比后不雷同」—— 因为根本没得比。
    // 上游无同名文件（拆分产物/新增文件）或同目录无兄弟文件时会落到这一档。
    noUpstreamCounterpart: false,
    strippedBlocks: candidate.strippedBlocks ?? 0,
    formatted: candidate.formatted,
    formatError: candidate.formatError,
    maxContainment: null,
    longestRun: null,
    structural: null,
    structuralSkipped,
    checks: { line: null, structural: null },
    violations: [],
    pass: true,
  };
  if (candidate.reexportUnresolved) {
    return {
      ...base,
      tracedFrom: candidate.tracedFrom ?? null,
      reexportUnresolved: candidate.reexportUnresolved,
      violations: [`pure-reexport-unresolved: ${candidate.reexportUnresolved}`],
      pass: false,
    };
  }
  if (candidate.binary || gates === "structural") {
    return { ...base, tracedFrom: candidate.tracedFrom ?? null };
  }
  let comparedOld = oldFiles.filter((file) => !file.binary && file.kind === candidate.kind);
  comparedOld = await appendSiblingOldFiles({
    repo,
    oldRev: values["old-rev"],
    candidatePath: candidate.givenPath,
    candidateKind: candidate.kind,
    comparedOld,
    oxfmtOptions,
    readOldFile,
  });
  if (candidate.tracedLeaves?.length) {
    let worst = { maxContainment: { value: -1 }, longestRun: { value: -1 }, lines: 0 };
    for (const leaf of candidate.tracedLeaves) {
      const metrics = lineMetrics(leaf, upstream.byKind.get(leaf.kind), comparedOld);
      if (metrics.maxContainment.value > worst.maxContainment.value) {
        worst = { ...metrics, lines: leaf.lines.length };
      }
    }
    const violations = lineViolations(worst.lines, worst);
    return {
      ...base,
      lines: worst.lines,
      residualLines: worst.lines,
      tracedFrom: candidate.tracedFrom ?? null,
      maxContainment: worst.maxContainment,
      longestRun: worst.longestRun,
      checks: { ...base.checks, line: violations.length === 0 },
      violations: [...violations],
    };
  }
  const metrics = lineMetrics(candidate, upstream.byKind.get(candidate.kind), comparedOld);
  const violations = lineViolations(candidate.lines.length, metrics);
  return {
    ...base,
    tracedFrom: candidate.tracedFrom ?? null,
    // 没有任何上游文件参与比较：PASS 只说明「没超标」，不说明「不雷同」。
    noUpstreamCounterpart: metrics.maxContainment.file === null && candidate.lines.length > 0,
    maxContainment: metrics.maxContainment,
    longestRun: metrics.longestRun,
    checks: { ...base.checks, line: violations.length === 0 },
    violations: [...violations],
  };
}

function lineMetrics(candidate, group, comparedOld) {
  const candidateLines = candidate.lines;
  let maxContainment = { value: 0, file: null };
  let longest = { value: 0, file: null };
  if (group) {
    const counts = new Map();
    for (const line of candidateLines) {
      for (const groupIndex of group.index.get(line) ?? [])
        counts.set(groupIndex, (counts.get(groupIndex) ?? 0) + 1);
    }
    for (const [groupIndex, count] of counts) {
      const file = upstream.files[group.files[groupIndex]];
      // 候选文件本身若落在上游树里，不与自己比较。
      if (file.absolutePath === candidate.path) continue;
      const value = candidateLines.length === 0 ? 0 : count / candidateLines.length;
      if (value > maxContainment.value) maxContainment = { value, file: file.path };
      const run = longestRun(candidateLines, file.lines);
      if (run > longest.value) longest = { value: run, file: file.path };
    }
  }
  for (const file of comparedOld) {
    const value = containment(candidateLines, file.lines);
    if (value > maxContainment.value) maxContainment = { value, file: file.path };
    const run = longestRun(candidateLines, file.lines);
    if (run > longest.value) longest = { value: run, file: file.path };
  }
  return { maxContainment, longestRun: longest };
}

/**
 * 压行拆分独立 gate：扫描候选里写死的空白分隔字面量在运行时拆成列表的写法，
 * 命中即 FAIL。只对脚本生效；不随 --gates 关闭，因为它是单独的 gate。
 */
function applyPackedLiteralGate(results, candidates) {
  results.forEach((result, index) => {
    const candidate = candidates[index];
    if (candidate.binary || candidate.kind !== "script") return;
    const texts = candidate.tracedLeaves?.length
      ? candidate.tracedLeaves.map((leaf) => leaf.text)
      : [candidate.text];
    const hits = texts.flatMap((text) => packedLiteralSplits(candidate.path, text));
    result.packedLiteralSplits = hits;
    if (hits.length === 0) return;
    result.violations.push(
      `packed-literal-split: ${hits.length} 处写死字面量按空白拆分（首个 ${hits[0].line}:${hits[0].column} ${hits[0].via}）`,
    );
  });
}

/**
 * 结构门槛：候选指纹落在同一个比较文件里的比例取最大值。
 * 逐候选比对全部上游同类文件太慢，这里用「指纹 → 候选」倒排索引，
 * 扫一遍上游同类文件即可得到每个候选的最大值。
 */
function applyStructural(results) {
  const fingerprints = new Map();
  for (const [index, result] of results.entries()) {
    const candidate = candidates[index];
    if (candidate.binary || candidate.kind !== "script") continue;
    const computed = structuralFingerprints(structuralTokens(candidate.path, candidate.text));
    // 少于 25 个 token（例如声明行全部被剔除）没有指纹，结构相似度按 0 计。
    if (computed.size === 0) {
      result.structural = { value: 0, file: null };
      result.checks.structural = true;
      continue;
    }
    fingerprints.set(index, computed);
  }
  const kinds = new Map();
  for (const [index] of fingerprints) {
    const list = kinds.get(results[index].kind) ?? [];
    list.push(index);
    kinds.set(results[index].kind, list);
  }
  for (const [kind, indexes] of kinds) {
    const group = upstream.byKind.get(kind);
    const reverse = new Map();
    for (const index of indexes) {
      for (const fingerprint of fingerprints.get(index)) {
        const list = reverse.get(fingerprint);
        if (list) list.push(index);
        else reverse.set(fingerprint, [index]);
      }
    }
    const best = new Map(indexes.map((index) => [index, { value: 0, file: null }]));
    if (group) {
      for (const fileIndex of group.files) {
        const file = upstream.files[fileIndex];
        const compared = structuralFingerprints(structuralTokens(file.path, file.text));
        if (compared.size === 0) continue;
        const counts = new Map();
        for (const fingerprint of compared) {
          for (const index of reverse.get(fingerprint) ?? []) {
            // 候选文件本身若落在上游树里，不与自己比较。
            if (candidates[index].path === file.absolutePath) continue;
            counts.set(index, (counts.get(index) ?? 0) + 1);
          }
        }
        for (const [index, count] of counts) {
          const value = count / fingerprints.get(index).size;
          if (value > best.get(index).value) best.set(index, { value, file: file.path });
        }
      }
    }
    for (const index of indexes) {
      let entry = best.get(index);
      for (const file of oldFiles) {
        if (file.binary || file.kind !== kind) continue;
        const value = structuralOverlap(
          fingerprints.get(index),
          structuralFingerprints(structuralTokens(file.path, file.text)),
        );
        if (value > entry.value) entry = { value, file: file.path };
      }
      results[index].structural = entry;
      results[index].checks.structural = entry.value < THRESHOLDS.structural;
      if (entry.value >= THRESHOLDS.structural)
        results[index].violations.push(
          `structural ${format(entry.value)} >= ${THRESHOLDS.structural}`,
        );
    }
  }
}

/**
 * --explain：逐文件列出「命中的归一化行」与「最长连续段位置」，让改写可以按行进行。
 * 只输出诊断信息，不参与任何判定。
 */
function explainResults(candidates, results) {
  const comparedLinesByPath = new Map();
  for (const file of oldFiles) comparedLinesByPath.set(file.path, file.lines);
  for (const file of upstream.files) {
    if (!comparedLinesByPath.has(file.path)) comparedLinesByPath.set(file.path, file.lines);
  }
  results.forEach((result, index) => {
    if (result.binary || !result.maxContainment?.file) return;
    const candidateLines = candidates[index]?.lines ?? [];
    const comparedLines = comparedLinesByPath.get(result.maxContainment.file) ?? [];
    const matched = explainContainment(candidateLines, comparedLines);
    process.stdout.write(
      `EXPLAIN ${result.path} 命中 ${matched.length}/${candidateLines.length}（containment ${format(result.maxContainment.value)}）比较文件 ${result.maxContainment.file}\n`,
    );
    const shown = matched.slice(0, 30);
    for (const item of shown)
      process.stdout.write(`  #${item.index}  ${item.line.slice(0, 140)}\n`);
    if (matched.length > shown.length) {
      process.stdout.write(`  …（其余 ${matched.length - shown.length} 行略）\n`);
    }
    const run = longestRunDetail(candidateLines, comparedLines);
    if (run.length > 0) {
      process.stdout.write(
        `  最长连续段 ${run.length} 行：候选 #${run.candidateStart}…#${run.candidateStart + run.length - 1} ↔ 比较文件 #${run.comparedStart}…\n`,
      );
      for (let offset = 0; offset < Math.min(run.length, 10); offset += 1) {
        process.stdout.write(
          `    ${(candidateLines[run.candidateStart + offset] ?? "").slice(0, 140)}\n`,
        );
      }
      if (run.length > 10) process.stdout.write(`    …（其余 ${run.length - 10} 行略）\n`);
    }
  });
}

function describe(result) {
  const traced = result.tracedFrom ? ` traced-from=${result.tracedFrom}` : "";
  if (result.binary) return `SKIP  ${result.path} binary`;
  const declaration = result.declaration
    ? ` declaration=true declaration-lines=${result.strippedLines} residual-lines=${result.residualLines} stripped-blocks=${result.strippedBlocks}`
    : " declaration=false";
  const line =
    gates === "structural"
      ? " line=skipped"
      : result.maxContainment == null
        ? " containment=n/a run=n/a"
        : ` containment=${format(result.maxContainment.value)} (${result.maxContainment.file}) run=${result.longestRun.value} (${result.longestRun.file})`;
  const structural = result.structuralSkipped
    ? " structural=not-a-script"
    : gates === "line"
      ? " structural=skipped"
      : ` structural=${format(result.structural.value)} (${result.structural.file})`;
  // 格式化失败（语法错误或格式不支持）时退回原文比较，必须让使用者看得到。
  const formatNote = result.formatted ? "" : " format=fallback";
  // 契约行剔除：名字清单是最终审查的重点项，必须完整打印，不能只报数量。
  const exclusion = result.contractExclusion
    ? ` contract-lines=${result.contractExclusion.strippedLines} contract-names=[${result.contractExclusion.names.join(",")}] residual-lines=${result.contractExclusion.before.residualLines}->${result.contractExclusion.after.residualLines}${result.contractExclusion.suspiciousRatio ? " contract-exclusion-suspicious=residual-below-20%" : ""}${result.contractExclusion.tooManyNames ? " contract-exclusion-suspicious=too-many-names" : ""}`
    : "";
  // 剩余行为 0 时并没有「比出来的低相似度」：那是一份没有可比对实现的文件（纯 re-export 等）。
  // 不标注的话，`containment=0.000` 会被读成「完美达标」，让归零判定失真。
  const noComparableNote = result.residualLines === 0 ? " no-comparable-lines" : "";
  // 没有上游文件参与比较时，containment=0.000 不代表「比过了不雷同」，只代表「没得比」。
  // 上游无同名文件（拆分产物/新增）会落到这一档，审查者必须能一眼看出。
  const counterpartNote = result.noUpstreamCounterpart ? " no-upstream-counterpart" : "";
  const verdict = result.violations.length ? ` -> ${result.violations.join("; ")}` : "";
  return `${result.pass ? "PASS " : "FAIL "} ${result.path} lines=${result.lines}${declaration}${exclusion}${noComparableNote}${counterpartNote}${formatNote}${line}${structural}${verdict}${traced}`;
}

/**
 * 打印契约行剔除的残留行与被剔行原文。
 *
 * `residual` 是剔除后剩下的行（用户验收要求逐字贴出，用于判断「剩余是否还需返工」）；
 * `stripped` 是被剔掉的行（用于人工核对「是否剔得过宽」）。
 * 行号是原始文本里的 1-based 行号，便于回到源码定位。
 */
function dumpContractLines(candidates, results) {
  const limit = Number(values["dump-residual-limit"] ?? 50);
  for (const [index, result] of results.entries()) {
    const baseline = candidates[index]?.contractBaseline;
    if (!baseline) {
      // 静默跳过会让「输出 0 行」看不出原因；明确说是哪一种情况。
      process.stderr.write(
        `similarity: dump 跳过 ${result.path}：未启用 --contract-lines（或该候选无契约名可比）\n`,
      );
      continue;
    }
    if (values["dump-residual"]) {
      const all = baseline.residual ?? [];
      process.stdout.write(`\n--- residual: ${result.path} (${all.length} 行) ---\n`);
      for (const entry of all.slice(0, limit))
        process.stdout.write(`  L${entry.line}  ${entry.text}\n`);
      if (all.length > limit)
        process.stdout.write(
          `  … 共 ${all.length} 行，仅显示前 ${limit} 行（--dump-residual-limit 可调）\n`,
        );
    }
    if (values["dump-stripped"]) {
      const all = baseline.stripped ?? [];
      process.stdout.write(`\n--- stripped: ${result.path} (${all.length} 行) ---\n`);
      for (const entry of all.slice(0, limit))
        process.stdout.write(`  L${entry.line}  ${entry.text}\n`);
      if (all.length > limit)
        process.stdout.write(`  … 共 ${all.length} 行，仅显示前 ${limit} 行\n`);
    }
  }
}

function calibrate(results) {
  const observed = results.map((result) => result.structural?.value ?? 0);
  const observedMax = observed.length ? Math.max(...observed) : 0;
  const step = Math.floor(observedMax / 0.05 + 1e-9);
  const derivedThreshold = Math.min(0.4, (step + 1) * 0.05);
  const overCap = results
    .filter((result) => (result.structural?.value ?? 0) > 0.4)
    .map((result) => `${result.path} ${format(result.structural.value)}`);
  const buckets = {};
  for (const value of observed) {
    const floor = Math.floor(value / 0.05) * 0.05;
    const key = value === 0 ? "0" : `${floor.toFixed(2)}-${(floor + 0.05).toFixed(2)}`;
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  process.stdout.write(
    `calibration: candidates=${results.length} observedStructuralMax=${format(observedMax)} derivedThreshold=${format(derivedThreshold)} overCap=${overCap.length}\n`,
  );
  return {
    candidates: results.length,
    observedStructuralMax: observedMax,
    derivedThreshold,
    overCap,
    distribution: buckets,
  };
}
