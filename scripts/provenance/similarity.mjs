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
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { extractDeclarationNames } from "./similarity-declarations.mjs";
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
  --old-rev <rev>           旧文件取自该 git 提交，而不是工作区
  --upstream-dir <dir>      上游固定提交的完整树（仓库外缓存目录，必需）
  --upstream-rev <rev>      上游固定提交号，只用于报告

声明文件：
  --interface <file>        interface.md，可重复；从中提取兼容名字
  --declaration             候选按纯声明文件处理：先剔除含兼容名字的行，再算两道门槛

其他：
  --repo <dir>              仓库根，默认当前目录
  --gates <all|line|structural>  默认 all
  --json <file>             输出 JSON 报告
  --calibrate               校准模式：打印（并写入报告）由候选集合推导的结构门槛
  --explain                 逐文件列出命中的归一化行（行号 + 文本）与最长连续段位置，
                            便于按行改写；不改变任何判定结果
  --help
`;

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
    "upstream-dir": { type: "string" },
    "upstream-rev": { type: "string" },
    interface: { type: "string", multiple: true },
    declaration: { type: "boolean" },
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

const declarationNames = (values.interface ?? []).flatMap((file) =>
  extractDeclarationNames(readFileSync(resolve(file), "utf8")),
);
if (values.declaration && declarationNames.length === 0)
  usageError("--declaration requires --interface with at least one name");

const oxfmtOptions = loadOxfmtOptions(repo);
const oldPathArgs = [
  ...(values.old ?? []),
  ...(values["old-list"] ? readPathList(values["old-list"]) : []),
].filter((givenPath) => pathExistsInRev(repo, values["old-rev"], givenPath));
const oldFiles = await Promise.all(
  oldPathArgs.map((givenPath) =>
    readOldFile({ repo, givenPath, revision: values["old-rev"], oxfmtOptions }),
  ),
);

const upstream = await loadUpstream(upstreamRoot, { oxfmtOptions });
const candidates = await Promise.all(
  candidatePaths.map((givenPath) =>
    loadCandidate({
      repo,
      givenPath,
      declarationNames: values.declaration ? declarationNames : [],
      oxfmtOptions,
    }),
  ),
);
const results = [];
for (const candidate of candidates) results.push(await evaluateLines(candidate));
if (gates !== "line") applyStructural(results);
for (const result of results) result.pass = result.violations.length === 0;

const failed = results.filter((result) => !result.pass);
for (const result of results) process.stdout.write(`${describe(result)}\n`);
if (values.explain) explainResults(candidates, results);
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
  const linesBeforeStrip = candidate.binary ? 0 : candidate.linesBeforeStrip;
  const base = {
    path: candidate.givenPath,
    kind: candidate.kind,
    lines: residualLines,
    binary: candidate.binary,
    declaration: candidate.declaration ?? false,
    linesBeforeStrip,
    strippedLines: linesBeforeStrip - residualLines,
    residualLines,
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
  const verdict = result.violations.length ? ` -> ${result.violations.join("; ")}` : "";
  return `${result.pass ? "PASS " : "FAIL "} ${result.path} lines=${result.lines}${declaration}${formatNote}${line}${structural}${verdict}${traced}`;
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
