#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 相似度工具：行相似度 + 结构相似度。
//
// 比较对象：被替换的旧文件（--old，可来自指定提交）与整个上游固定提交（--upstream-dir，
// 仓库外缓存目录）。两道门槛的算法与校准见 scripts/provenance/similarity-lines.mjs、
// similarity-structural.mjs 与 docs/knorvia-similarity-calibration-20261011.md；
// 门槛写入常量后不再调整。
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { extractDeclarationNames } from "./similarity-declarations.mjs";
import { loadCandidate, loadUpstream, readOldFile, readPathList } from "./similarity-inputs.mjs";
import {
  THRESHOLDS,
  containment,
  format,
  lineViolations,
  longestRun,
} from "./similarity-lines.mjs";
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

const oldFiles = [
  ...(values.old ?? []),
  ...(values["old-list"] ? readPathList(values["old-list"]) : []),
].map((givenPath) => readOldFile({ repo, givenPath, revision: values["old-rev"] }));

const upstream = loadUpstream(upstreamRoot);
const candidates = candidatePaths.map((givenPath) =>
  loadCandidate({ repo, givenPath, declarationNames: values.declaration ? declarationNames : [] }),
);
const results = candidates.map((candidate) => evaluateLines(candidate));
if (gates !== "line") applyStructural(results);
for (const result of results) result.pass = result.violations.length === 0;

const failed = results.filter((result) => !result.pass);
for (const result of results) process.stdout.write(`${describe(result)}\n`);
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

function evaluateLines(candidate) {
  const structuralSkipped = !candidate.binary && candidate.kind !== "script";
  const base = {
    path: candidate.givenPath,
    kind: candidate.kind,
    lines: candidate.binary ? 0 : candidate.lines.length,
    binary: candidate.binary,
    declarationLines: candidate.declarationLines,
    maxContainment: null,
    longestRun: null,
    structural: null,
    structuralSkipped,
    checks: { line: null, structural: null },
    violations: [],
    pass: true,
  };
  if (candidate.binary || gates === "structural") return base;
  const comparedOld = oldFiles.filter((file) => !file.binary && file.kind === candidate.kind);
  const metrics = lineMetrics(candidate, upstream.byKind.get(candidate.kind), comparedOld);
  const violations = lineViolations(candidate.lines.length, metrics);
  return {
    ...base,
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

function describe(result) {
  if (result.binary) return `SKIP  ${result.path} binary`;
  const declaration = values.declaration ? ` declaration-lines=${result.declarationLines}` : "";
  const line =
    gates === "structural"
      ? " line=skipped"
      : ` containment=${format(result.maxContainment.value)} (${result.maxContainment.file}) run=${result.longestRun.value} (${result.longestRun.file})`;
  const structural = result.structuralSkipped
    ? " structural=not-a-script"
    : gates === "line"
      ? " structural=skipped"
      : ` structural=${format(result.structural.value)} (${result.structural.file})`;
  const verdict = result.violations.length ? ` -> ${result.violations.join("; ")}` : "";
  return `${result.pass ? "PASS " : "FAIL "} ${result.path} lines=${result.lines}${declaration}${line}${structural}${verdict}`;
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
