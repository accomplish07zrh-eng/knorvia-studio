// SPDX-License-Identifier: Apache-2.0
// M0-8 独立替换门槛：对被替换的旧文件与固定上游提交做行相似度与结构相似度检查。
import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import ts from "typescript";
import { git } from "./git.mjs";
import { BASELINE_COMMIT } from "./model.mjs";

export const LINE_CONTAINMENT_LIMIT = 0.2;
export const LINE_RUN_LIMIT = 8;
export const LINE_MIN_LINES = 10;
// M0-8 校准值：439 个已登记 independent-replacement 文件的结构相似度最大值向上取到 0.05 的整数倍。
// 校准过程与分布见 docs/knorvia-similarity-calibration-20261011.md；数值一经写入不再调整。
export const STRUCTURAL_LIMIT = 0.4;
export const STRUCTURAL_KGRAM = 25;
export const STRUCTURAL_WINDOW = 20;

const JS_FAMILY = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const SEPARATOR_ONLY = /^[{}\[\]();,]+$/;
const MAX_RUN = 4096;
const HASH_BASE = 131;
const MAX_BATCH_BYTES = 64 * 1024 * 1024;
const MAX_PATH_LENGTH = 1024;

const SCRIPT_KINDS = new Map([
  [".ts", ts.ScriptKind.TS],
  [".mts", ts.ScriptKind.TS],
  [".cts", ts.ScriptKind.TS],
  [".tsx", ts.ScriptKind.TSX],
  [".js", ts.ScriptKind.JS],
  [".mjs", ts.ScriptKind.JS],
  [".cjs", ts.ScriptKind.JS],
  [".jsx", ts.ScriptKind.JSX],
]);

export function assertRelativePath(path) {
  if (
    typeof path !== "string" ||
    !path ||
    path.length > MAX_PATH_LENGTH ||
    path.includes("\\") ||
    path.includes("\0") ||
    /^[a-z]:/i.test(path) ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`Invalid repository-relative path: ${JSON.stringify(path)}`);
  }
  return path;
}

// 无效 UTF-8 与含 NUL 的内容按二进制跳过，判定与来源清单的指纹逻辑一致。
export function decodeText(bytes) {
  if (bytes.includes(0)) return null;
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    return text.replace(/\r\n/g, "\n");
  } catch {
    return null;
  }
}

export function normalizeLines(text, options = {}) {
  const compatNames = options.compatNames ?? [];
  const lines = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || SEPARATOR_ONLY.test(line)) continue;
    if (
      line.startsWith("import ") ||
      line.startsWith("export * from") ||
      line.startsWith("export {")
    )
      continue;
    // 纯声明文件按 interface.md 列出的名字剔除兼容行，再进入两道门槛。
    if (compatNames.some((name) => line.includes(name))) continue;
    lines.push(line);
  }
  return lines;
}

export function kindOf(path) {
  const extension = extname(path).toLowerCase();
  return JS_FAMILY.has(extension) ? "js-family" : extension || "(none)";
}

function createLineGroup() {
  return { paths: [], lineIds: new Map(), occFiles: [], occLines: [], ids: [] };
}

function addLineFile(group, path, lines) {
  const fileIndex = group.paths.length;
  const ids = new Int32Array(lines.length);
  lines.forEach((line, index) => {
    let id = group.lineIds.get(line);
    if (id === undefined) {
      id = group.lineIds.size;
      group.lineIds.set(line, id);
      group.occFiles.push([]);
      group.occLines.push([]);
    }
    ids[index] = id;
    group.occFiles[id].push(fileIndex);
    group.occLines[id].push(index);
  });
  group.paths.push(path);
  group.ids.push(ids);
}

function finalizeLineGroups(groups) {
  for (const group of groups.values()) {
    group.uniqueFiles = group.occFiles.map((list) => Int32Array.from(new Set(list)));
    group.occFiles = group.occFiles.map((list) => Int32Array.from(list));
    group.occLines = group.occLines.map((list) => Int32Array.from(list));
  }
}

export function createLineIndex(files) {
  const groups = new Map();
  for (const file of files) {
    const kind = kindOf(file.path);
    if (!groups.has(kind)) groups.set(kind, createLineGroup());
    addLineFile(groups.get(kind), file.path, file.lines);
  }
  finalizeLineGroups(groups);
  return { groups, kindCount: groups.size };
}

function groupMetrics(group, lines) {
  const total = lines.length;
  if (!total) return { containment: 0, longestRun: 0, path: null };
  const ids = new Int32Array(total);
  for (let index = 0; index < total; index += 1) {
    ids[index] = group.lineIds.get(lines[index]) ?? -1;
  }
  const counts = new Uint32Array(group.paths.length);
  for (let index = 0; index < total; index += 1) {
    const id = ids[index];
    if (id < 0) continue;
    for (const fileIndex of group.uniqueFiles[id]) counts[fileIndex] += 1;
  }
  let best = 0;
  let topIndex = -1;
  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] > best) {
      best = counts[index];
      topIndex = index;
    }
  }
  let longest = 0;
  for (let index = 0; index < total; index += 1) {
    const id = ids[index];
    if (id < 0) continue;
    const occurrences = group.occFiles[id];
    for (let offset = 0; offset < occurrences.length; offset += 1) {
      const fileIndex = occurrences[offset];
      const position = group.occLines[id][offset];
      const corpus = group.ids[fileIndex];
      // 只从极大对齐起点向后延伸，避免把错位的重复行拼成假长段。
      if (index > 0 && position > 0 && corpus[position - 1] === ids[index - 1]) continue;
      let run = 0;
      while (
        run < MAX_RUN &&
        index + run < total &&
        position + run < corpus.length &&
        corpus[position + run] === ids[index + run]
      ) {
        run += 1;
      }
      if (run > longest) longest = run;
    }
  }
  return {
    containment: best / total,
    longestRun: longest,
    path: topIndex >= 0 ? group.paths[topIndex] : null,
  };
}

export function lineMetrics(index, lines, kind) {
  const groups = kind === undefined ? [...index.groups.values()] : [index.groups.get(kind)];
  const result = { containment: 0, longestRun: 0, path: null };
  for (const group of groups) {
    if (!group) continue;
    const metric = groupMetrics(group, lines);
    // 最长段取全部同组比较文件的最大值（保守），包含率取最高的那个文件。
    if (metric.longestRun > result.longestRun) result.longestRun = metric.longestRun;
    if (
      metric.containment > result.containment ||
      (metric.containment === result.containment && result.path === null && metric.path !== null)
    ) {
      result.containment = metric.containment;
      result.path = metric.path;
    }
  }
  return result;
}

function placeholderFor(kind, text) {
  switch (kind) {
    case ts.SyntaxKind.Identifier:
    case ts.SyntaxKind.PrivateIdentifier:
      return "ID";
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.JsxText:
    case ts.SyntaxKind.JsxTextAllWhiteSpaces:
      return "STR";
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.BigIntLiteral:
      return "NUM";
    case ts.SyntaxKind.RegularExpressionLiteral:
      return "REGEX";
    case ts.SyntaxKind.Unknown:
      return "";
    default:
      return text;
  }
}

// 词法单位取自 AST 的叶子节点，不用 createScanner：扫描器在模板占位符处会切换状态，
// 一次顺序扫描会把模板后面的 token 一起吃掉（实测 `` `a${b}c`; `` 丢掉 `;`）。
// 叶子节点天然跳过注释，模板表达式与无替换模板各合成一个 TPL。
export function tokenSequence(text, path) {
  const scriptKind = SCRIPT_KINDS.get(extname(path).toLowerCase()) ?? ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind);
  const tokens = [];
  const walk = (node) => {
    if (
      ts.isImportDeclaration(node) ||
      ts.isImportEqualsDeclaration(node) ||
      (ts.isExportDeclaration(node) && node.moduleSpecifier)
    ) {
      return;
    }
    if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      // 整个模板字面量合成一个占位符：逐 token 展开会把表达式结构混进相似度。
      tokens.push("TPL");
      return;
    }
    const children = node.getChildren(source);
    if (children.length === 0) {
      if (node.kind === ts.SyntaxKind.EndOfFileToken) return;
      const placeholder = placeholderFor(node.kind, node.getText(source));
      if (placeholder) tokens.push(placeholder);
      return;
    }
    for (const child of children) walk(child);
  };
  walk(source);
  return tokens;
}

export function structuralFingerprints(tokens) {
  const count = tokens.length;
  if (count < STRUCTURAL_KGRAM) return [];
  const ids = new Int32Array(count);
  const seen = new Map();
  let next = 1;
  for (let index = 0; index < count; index += 1) {
    let id = seen.get(tokens[index]);
    if (id === undefined) {
      id = next;
      next += 1;
      seen.set(tokens[index], id);
    }
    ids[index] = id;
  }
  let power = 1;
  for (let index = 1; index < STRUCTURAL_KGRAM; index += 1) {
    power = Math.imul(power, HASH_BASE) >>> 0;
  }
  const grams = new Uint32Array(count - STRUCTURAL_KGRAM + 1);
  let hash = 0;
  for (let index = 0; index < STRUCTURAL_KGRAM; index += 1) {
    hash = (Math.imul(hash, HASH_BASE) + ids[index]) >>> 0;
  }
  grams[0] = hash;
  for (let index = 1; index < grams.length; index += 1) {
    const dropped = Math.imul(ids[index - 1], power);
    hash = (Math.imul((hash - dropped) | 0, HASH_BASE) + ids[index + STRUCTURAL_KGRAM - 1]) >>> 0;
    grams[index] = hash;
  }
  // winnowing：每个长度 20 的窗口取最小哈希（并列取最右），指纹集合即新文件的比较单位。
  const selected = new Set();
  const window = [];
  for (let index = 0; index < grams.length; index += 1) {
    while (window.length && window[window.length - 1].hash >= grams[index]) window.pop();
    window.push({ index, hash: grams[index] });
    while (window[0].index <= index - STRUCTURAL_WINDOW) window.shift();
    if (index >= STRUCTURAL_WINDOW - 1) selected.add(window[0].hash);
  }
  if (selected.size === 0) {
    let minimum = grams[0];
    for (const gram of grams) if (gram < minimum) minimum = gram;
    selected.add(minimum);
  }
  return [...selected].sort((left, right) => left - right);
}

export function createFingerprintIndex(files = []) {
  const paths = [];
  const index = new Map();
  const addFile = (path, fingerprints) => {
    const fileIndex = paths.length;
    paths.push(path);
    for (const hash of fingerprints) {
      const list = index.get(hash);
      if (list) list.push(fileIndex);
      else index.set(hash, [fileIndex]);
    }
  };
  for (const file of files) addFile(file.path, file.fingerprints);
  return { paths, index, addFile };
}

export function structuralMetrics(index, fingerprints) {
  if (!fingerprints.length) return { score: 0, path: null };
  const counts = new Map();
  for (const hash of fingerprints) {
    const list = index.index.get(hash);
    if (!list) continue;
    for (const fileIndex of list) counts.set(fileIndex, (counts.get(fileIndex) ?? 0) + 1);
  }
  let best = 0;
  let topIndex = -1;
  for (const [fileIndex, score] of counts) {
    if (score > best) {
      best = score;
      topIndex = fileIndex;
    }
  }
  return {
    score: best / fingerprints.length,
    path: topIndex >= 0 ? index.paths[topIndex] : null,
  };
}

export function linePasses(metric) {
  if (metric.lines < LINE_MIN_LINES) return metric.containment === 0;
  return metric.containment < LINE_CONTAINMENT_LIMIT && metric.longestRun < LINE_RUN_LIMIT;
}

// 语料按文件流式喂入：上游树约 7 千个文本文件，不能先全部留在内存里再建索引。
export function createCorpusBuilder() {
  const lineGroups = new Map();
  const fingerprintIndex = createFingerprintIndex();
  return {
    add(text, path) {
      const kind = kindOf(path);
      if (!lineGroups.has(kind)) lineGroups.set(kind, createLineGroup());
      addLineFile(lineGroups.get(kind), path, normalizeLines(text));
      fingerprintIndex.addFile(path, structuralFingerprints(tokenSequence(text, path)));
    },
    finish() {
      finalizeLineGroups(lineGroups);
      return { lineIndex: { groups: lineGroups, kindCount: lineGroups.size }, fingerprintIndex };
    },
  };
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

export function findRelativePath(repo, path) {
  return resolve(repo, ...assertRelativePath(path).split("/"));
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
