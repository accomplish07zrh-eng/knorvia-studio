// SPDX-License-Identifier: Apache-2.0
// M0-8 独立替换门槛：对被替换的旧文件与固定上游提交做行相似度与结构相似度检查。
// 门槛与规范化规则见 ./similarity-text.mjs，各指标实现见 ./similarity-lines.mjs 与 ./similarity-structure.mjs。
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { git } from "./git.mjs";
import { BASELINE_COMMIT } from "./model.mjs";
import {
  assertRelativePath,
  decodeText,
  kindOf,
  LINE_CONTAINMENT_LIMIT,
  LINE_MIN_LINES,
  LINE_RUN_LIMIT,
  normalizeLines,
  STRUCTURAL_KGRAM,
  STRUCTURAL_LIMIT,
  STRUCTURAL_WINDOW,
} from "./similarity-text.mjs";
import {
  addLineFileToSet,
  createLineGroupSet,
  createLineIndex,
  lineMetrics,
  linePasses,
} from "./similarity-lines.mjs";
import {
  createFingerprintIndex,
  structuralFingerprints,
  structuralMetrics,
  tokenSequence,
} from "./similarity-structure.mjs";

export {
  assertRelativePath,
  decodeText,
  LINE_CONTAINMENT_LIMIT,
  LINE_MIN_LINES,
  LINE_RUN_LIMIT,
  normalizeLines,
  kindOf,
  STRUCTURAL_KGRAM,
  STRUCTURAL_LIMIT,
  STRUCTURAL_WINDOW,
  createFingerprintIndex,
  createLineIndex,
  lineMetrics,
  linePasses,
  structuralFingerprints,
  structuralMetrics,
  tokenSequence,
};

const MAX_BATCH_BYTES = 64 * 1024 * 1024;

// 语料按文件流式喂入：上游树约 7 千个文本文件，不能先全部留在内存里再建索引。
export function createCorpusBuilder() {
  const lineGroups = createLineGroupSet();
  const fingerprintIndex = createFingerprintIndex();
  return {
    add(text, path) {
      addLineFileToSet(lineGroups, path, normalizeLines(text));
      fingerprintIndex.addFile(path, structuralFingerprints(tokenSequence(text, path)));
    },
    finish() {
      for (const group of lineGroups.values()) {
        group.uniqueFiles = group.occFiles.map((list) => Int32Array.from(new Set(list)));
        group.occFiles = group.occFiles.map((list) => Int32Array.from(list));
        group.occLines = group.occLines.map((list) => Int32Array.from(list));
      }
      return { lineIndex: { groups: lineGroups, kindCount: lineGroups.size }, fingerprintIndex };
    },
  };
}

export function findRelativePath(repo, path) {
  return resolve(repo, ...assertRelativePath(path).split("/"));
}

async function readTreeEntries(directory, commit) {
  const listing = (await git(directory, ["ls-tree", "-rlz", "--full-tree", commit])).toString();
  return listing
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const tab = entry.indexOf("\t");
      const [mode, type, blob, size] = entry.slice(0, tab).split(/\s+/);
      return { mode, type, blob, size: Number(size), path: entry.slice(tab + 1) };
    })
    .filter((entry) => entry.type === "blob" && entry.mode !== "120000");
}

async function readBlobs(directory, entries) {
  const contents = new Map();
  let batch = [];
  let bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    const output = await git(
      directory,
      ["cat-file", "--batch"],
      `${batch.map((entry) => entry.blob).join("\n")}\n`,
    );
    let cursor = 0;
    for (const entry of batch) {
      const lineEnd = output.indexOf(10, cursor);
      const [actual, type, length] = output.toString("utf8", cursor, lineEnd).split(" ");
      const size = Number(length);
      if (
        lineEnd < 0 ||
        actual !== entry.blob ||
        type !== "blob" ||
        !Number.isSafeInteger(size) ||
        size < 0 ||
        lineEnd + size + 1 > output.length
      ) {
        throw new Error(`Invalid upstream object stream: ${entry.blob}`);
      }
      contents.set(entry.blob, output.subarray(lineEnd + 1, lineEnd + 1 + size));
      cursor = lineEnd + size + 2;
    }
    batch = [];
    bytes = 0;
  };
  for (const entry of entries) {
    batch.push(entry);
    bytes += entry.size;
    if (bytes >= MAX_BATCH_BYTES) await flush();
  }
  await flush();
  return contents;
}

export async function loadGitCorpus(directory, commit, label) {
  const entries = await readTreeEntries(directory, commit);
  const blobs = await readBlobs(directory, entries);
  const files = [];
  for (const entry of entries) {
    const text = decodeText(blobs.get(entry.blob));
    if (text === null) continue;
    files.push({ path: `${label}:${entry.path}`, text });
  }
  return { files, total: entries.length, text: files.length };
}

async function readReplacedFiles(repo, commit, paths) {
  const files = [];
  for (const path of paths) {
    assertRelativePath(path);
    const bytes = await git(repo, ["show", `${commit}:${path}`]);
    const text = decodeText(bytes);
    if (text === null) continue;
    files.push({ path: `replaced:${path}`, text });
  }
  return files;
}

export async function evaluateTargets({ repo, targets, upstream, upstreamCommit, oldCommit }) {
  const replacedPaths = [...new Set(targets.flatMap((target) => target.replaced ?? []))];
  const replaced = await readReplacedFiles(repo, oldCommit, replacedPaths);
  const corpus = createCorpusBuilder();
  for (const file of replaced) corpus.add(file.text, file.path);
  let upstreamFiles = 0;
  if (upstream) {
    const loaded = await loadGitCorpus(upstream, upstreamCommit, "upstream");
    upstreamFiles = loaded.files.length;
    for (const file of loaded.files) corpus.add(file.text, file.path);
  }
  const { lineIndex, fingerprintIndex } = corpus.finish();

  const reportTargets = [];
  for (const target of targets) {
    const absolute = findRelativePath(repo, target.path);
    let bytes;
    try {
      bytes = await readFile(absolute);
    } catch (error) {
      reportTargets.push({
        path: target.path,
        kind: "missing",
        passed: false,
        // 文件不存在与读取失败要分开写，否则「未登记的新文件」看起来像权限问题。
        error:
          error.code === "ENOENT"
            ? "target file is missing from the working tree"
            : `target file could not be read: ${error.message}`,
      });
      continue;
    }
    const text = decodeText(bytes);
    if (text === null) {
      reportTargets.push({
        path: target.path,
        kind: "binary",
        passed: true,
        reason: "binary content skipped",
      });
      continue;
    }
    const compatNames = target.compatNames ?? [];
    const lines = normalizeLines(text, { compatNames });
    const tokens = tokenSequence(text, target.path);
    const fingerprints = structuralFingerprints(tokens);
    const line = lineMetrics(lineIndex, lines, kindOf(target.path));
    const structural = structuralMetrics(fingerprintIndex, fingerprints);
    const lineResult = {
      ...line,
      lines: lines.length,
      passed: linePasses({ ...line, lines: lines.length }),
    };
    const structuralResult = { ...structural, passed: structural.score <= STRUCTURAL_LIMIT };
    reportTargets.push({
      path: target.path,
      kind: "text",
      replaced: target.replaced ?? [],
      compatNames,
      normalizedLines: lines.length,
      tokens: tokens.length,
      line: lineResult,
      structural: structuralResult,
      passed: lineResult.passed && structuralResult.passed,
    });
  }
  return {
    schemaVersion: 1,
    repo,
    oldCommit,
    upstream: upstream ? { repo: upstream, commit: upstreamCommit } : null,
    limits: {
      lineContainment: LINE_CONTAINMENT_LIMIT,
      lineRun: LINE_RUN_LIMIT,
      lineMinLines: LINE_MIN_LINES,
      structural: STRUCTURAL_LIMIT,
      structuralKgram: STRUCTURAL_KGRAM,
      structuralWindow: STRUCTURAL_WINDOW,
    },
    corpus: { replaced: replaced.length, upstream: upstreamFiles },
    summary: {
      targets: reportTargets.length,
      passed: reportTargets.filter((target) => target.passed).length,
      failed: reportTargets.filter((target) => !target.passed).length,
    },
    targets: reportTargets,
  };
}

function loadManifest(value) {
  const targets = Array.isArray(value) ? value : value?.targets;
  if (!Array.isArray(targets) || targets.length === 0)
    throw new Error("Target manifest must contain a non-empty targets array");
  return targets.map((target) => {
    if (typeof target !== "object" || target === null) throw new Error("Invalid target entry");
    assertRelativePath(target.path);
    const replaced = target.replaced ?? [];
    if (!Array.isArray(replaced)) throw new Error(`Invalid replaced list for ${target.path}`);
    replaced.forEach(assertRelativePath);
    const compatNames = target.compatNames ?? [];
    if (
      !Array.isArray(compatNames) ||
      compatNames.some((name) => typeof name !== "string" || !name)
    )
      throw new Error(`Invalid compatNames for ${target.path}`);
    return { path: target.path, replaced, compatNames };
  });
}

export async function runCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      targets: { type: "string" },
      repo: { type: "string" },
      "old-commit": { type: "string" },
      "upstream-repo": { type: "string" },
      "upstream-commit": { type: "string" },
      "no-upstream": { type: "boolean" },
      out: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help || !values.targets) {
    console.log(
      [
        "Similarity gate: node scripts/provenance/similarity.mjs --targets <manifest.json> [options]",
        "  --targets <file>          manifest of { targets: [{ path, replaced, compatNames }] }",
        "  --repo <dir>              repository root (default: this checkout)",
        "  --old-commit <sha>        main-repo commit holding the replaced files (default: HEAD)",
        "  --upstream-repo <dir>     external cache of the pinned upstream tree",
        "  --upstream-commit <sha>   pinned upstream commit (default: provenance pin)",
        "  --no-upstream             compare only against replaced files",
        "  --out <file>              also write the JSON report to a file",
        "Exit code 0 only when every target passes both thresholds.",
      ].join("\n"),
    );
    return values.help ? 0 : 2;
  }
  if (!values["no-upstream"] && !values["upstream-repo"])
    throw new Error("Pass --upstream-repo or --no-upstream");
  const repo = resolve(values.repo ?? fileURLToPath(new URL("../..", import.meta.url)));
  const manifest = JSON.parse(await readFile(resolve(values.targets), "utf8"));
  const report = await evaluateTargets({
    repo,
    targets: loadManifest(manifest),
    upstream: values["no-upstream"] ? null : resolve(values["upstream-repo"]),
    upstreamCommit: values["upstream-commit"] ?? BASELINE_COMMIT,
    oldCommit: values["old-commit"] ?? "HEAD",
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (values.out) await writeFile(resolve(values.out), serialized);
  process.stdout.write(serialized);
  return report.summary.failed === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  runCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`similarity gate failed: ${error.message}`);
      process.exitCode = 1;
    });
}
