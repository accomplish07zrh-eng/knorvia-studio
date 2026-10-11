// SPDX-License-Identifier: Apache-2.0
// M0-8 校准：structural 门槛用已登记的 independent-replacement 文件与
// 「只改名的 upstream-modified 副本」两批语料复核，结果写进 docs/knorvia-similarity-calibration-20261011.md。
// 校准只在仓库外缓存的上游树与主仓提交上跑，不参与 pnpm test:studio，因此放在 scripts/provenance 下。
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { promisify } from "node:util";
import ts from "typescript";
import {
  createCorpusBuilder,
  createFingerprintIndex,
  loadGitCorpus,
  STRUCTURAL_KGRAM,
  STRUCTURAL_LIMIT,
  structuralFingerprints,
  structuralMetrics,
  tokenSequence,
} from "./similarity.mjs";
import { BASELINE_COMMIT } from "./model.mjs";

const run = promisify(execFile);

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

// 会以 Identifier 形态出现在 AST 里的关键字与内建类型名；
// 改写它们等于改 token 序列而不是改名，会把「改名照搬」误当成独立写法。
const NON_RENAMEABLE_NAMES = new Set([
  "abstract",
  "accessor",
  "any",
  "as",
  "asserts",
  "async",
  "await",
  "bigint",
  "boolean",
  "declare",
  "exports",
  "false",
  "from",
  "global",
  "in",
  "infer",
  "interface",
  "is",
  "keyof",
  "module",
  "namespace",
  "never",
  "null",
  "number",
  "object",
  "of",
  "out",
  "override",
  "readonly",
  "require",
  "satisfies",
  "string",
  "super",
  "symbol",
  "this",
  "true",
  "type",
  "undefined",
  "unique",
  "unknown",
  "using",
  "void",
  "yield",
]);

export function renameIdentifiers(text, path) {
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    SCRIPT_KINDS.get(extname(path).toLowerCase()) ?? ts.ScriptKind.TS,
  );
  const spans = [];
  const visit = (node) => {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
      if (!NON_RENAMEABLE_NAMES.has(node.getText(source)))
        spans.push([node.getStart(source, false), node.getEnd()]);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  spans.sort((left, right) => left[0] - right[0]);
  let out = "";
  let cursor = 0;
  for (const [start, end] of spans) {
    if (start < cursor) continue;
    out += `${text.slice(cursor, start)}renamedSymbol`;
    cursor = end;
  }
  return out + text.slice(cursor);
}

function bucketOf(score) {
  // 先 round 再乘：0.05 / 0.05 在浮点下等于 0.9999999999999999，直接 floor 会把 0.05 归到 0。
  return (Math.round(score / 0.05) * 0.05 || 0).toFixed(2);
}

export function summarizeStructural(scores) {
  const buckets = new Map();
  for (const score of scores) buckets.set(bucketOf(score), (buckets.get(bucketOf(score)) ?? 0) + 1);
  const sorted = [...scores].sort((left, right) => left - right);
  return {
    count: sorted.length,
    maximum: sorted.length ? sorted[sorted.length - 1] : 0,
    buckets: [...buckets.entries()]
      .map(([bucket, count]) => ({ bucket: Number(bucket), count }))
      .sort((left, right) => left.bucket - right.bucket),
  };
}

async function readRegistered(repo, decision) {
  const reviews = JSON.parse(await readFile(join(repo, "licensing/reviews.json"), "utf8"));
  return reviews.files
    .filter((entry) => entry.decision === decision)
    .map((entry) => entry.path)
    .sort();
}

async function calibrateRegistered({ repo, upstream, upstreamCommit, decision }) {
  const paths = await readRegistered(repo, decision);
  const corpus = createCorpusBuilder();
  const loaded = await loadGitCorpus(upstream, upstreamCommit, "upstream");
  for (const file of loaded.files) corpus.add(file.text, file.path);
  const { fingerprintIndex } = corpus.finish();
  const rows = [];
  let skipped = 0;
  for (const path of paths) {
    let text;
    try {
      text = await readFile(join(repo, ...path.split("/")), "utf8");
    } catch {
      skipped += 1;
      continue;
    }
    const fingerprints = structuralFingerprints(tokenSequence(text, path));
    const metric = structuralMetrics(fingerprintIndex, fingerprints);
    rows.push({
      path,
      tokens: tokenSequence(text, path).length,
      fingerprints: fingerprints.length,
      score: metric.score,
      match: metric.path,
    });
  }
  rows.sort((left, right) => right.score - left.score);
  return {
    upstream: { files: loaded.text, commit: upstreamCommit },
    registered: paths.length,
    scored: rows.length,
    skipped,
    overLimit: rows.filter((row) => row.score > STRUCTURAL_LIMIT),
    summary: summarizeStructural(rows.map((row) => row.score)),
    rows,
  };
}

async function verifyRenamedCopies({ repo, upstream, upstreamCommit }) {
  const current = JSON.parse(await readFile(join(repo, "licensing/current-files.json"), "utf8"));
  const candidates = current.files
    .filter((file) => file.classification === "upstream-modified" && file.upstream?.path)
    .filter((file) => SCRIPT_KINDS.has(extname(file.path).toLowerCase()))
    .map((file) => ({ path: file.path, upstreamPath: file.upstream.path }));
  const caught = [];
  const leaked = [];
  const unscored = [];
  for (const candidate of candidates) {
    let upstreamText;
    try {
      const { stdout } = await run(
        "git",
        [`--git-dir=${upstream}`, "show", `${upstreamCommit}:${candidate.upstreamPath}`],
        { maxBuffer: 64 * 1024 * 1024 },
      );
      upstreamText = stdout;
    } catch {
      continue;
    }
    const renamed = renameIdentifiers(upstreamText, candidate.path);
    const tokens = tokenSequence(renamed, candidate.path);
    const fingerprints = structuralFingerprints(tokens);
    if (!fingerprints.length) {
      // 不足一个 k-gram+窗口的字面量窗口不产生指纹，结构门槛对这类文件不可判定。
      unscored.push({ path: candidate.path, tokens: tokens.length });
      continue;
    }
    const index = createFingerprintIndex([
      {
        path: `replaced:${candidate.path}`,
        fingerprints: structuralFingerprints(tokenSequence(upstreamText, candidate.path)),
      },
    ]);
    const metric = structuralMetrics(index, fingerprints);
    (metric.score > STRUCTURAL_LIMIT ? caught : leaked).push({
      path: candidate.path,
      tokens: tokens.length,
      score: metric.score,
    });
  }
  return { candidates: candidates.length, caught, leaked, unscored };
}

export async function runCalibration({ repo, upstream, upstreamCommit }) {
  return {
    schemaVersion: 1,
    limits: { structural: STRUCTURAL_LIMIT, kgram: STRUCTURAL_KGRAM },
    upstreamCommit,
    registered: await calibrateRegistered({
      repo,
      upstream,
      upstreamCommit,
      decision: "independent-replacement",
    }),
    renamedCopies: await verifyRenamedCopies({ repo, upstream, upstreamCommit }),
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      repo: { type: "string" },
      "upstream-repo": { type: "string" },
      "upstream-commit": { type: "string" },
      out: { type: "string" },
    },
  });
  const repo = resolve(values.repo ?? fileURLToPath(new URL("../..", import.meta.url)));
  if (!values["upstream-repo"])
    throw new Error("Pass --upstream-repo pointing at the external upstream cache");
  const report = await runCalibration({
    repo,
    upstream: resolve(values["upstream-repo"]),
    upstreamCommit: values["upstream-commit"] ?? BASELINE_COMMIT,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (values.out) await writeFile(resolve(values.out), serialized);
  process.stdout.write(serialized);
  // 门槛之外的文件是校准结论的一部分，不算工具失败。
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  runCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`similarity calibration failed: ${error.message}`);
      process.exitCode = 1;
    });
}
