// SPDX-License-Identifier: Apache-2.0
// M0-8: line and structural similarity thresholds for the independent-replacement gate.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  createFingerprintIndex,
  createLineIndex,
  LINE_CONTAINMENT_LIMIT,
  LINE_MIN_LINES,
  LINE_RUN_LIMIT,
  lineMetrics,
  normalizeLines,
  STRUCTURAL_LIMIT,
  structuralFingerprints,
  structuralMetrics,
  tokenSequence,
} from "./similarity.mjs";

const run = promisify(execFile);

const filler = (prefix, count, offset = 0) =>
  Array.from(
    { length: count },
    (_, index) => `const ${prefix}${offset + index} = ${offset + index};`,
  );

// 对拍文件按「匹配行 + 唯一哨兵行」交错，保证最长相同段固定为 1，
// 这样包含率边界测试不会被最长段门槛顺带拦下。
const interleaved = (matched) =>
  matched.flatMap((line, index) => [line, `const sentinel${index} = "s${index}";`]);

test("normalizeLines drops blanks, separator-only, import and re-export lines but keeps comments", () => {
  const text = [
    "  import { readFile } from 'node:fs';",
    "",
    "// 注释保留",
    "  export * from './other';",
    "export { a, b };",
    "  {",
    "}",
    "const value = 1;",
    "  ",
  ].join("\n");
  assert.deepEqual(normalizeLines(text), ["// 注释保留", "const value = 1;"]);
});

test("normalizeLines treats CRLF and LF input identically", () => {
  const lf = "const a = 1;\n\nconst b = 2;\n";
  assert.deepEqual(normalizeLines(lf.replace(/\n/g, "\r\n")), normalizeLines(lf));
});

test("line threshold: containment 0.19 passes, 0.20 fails at exactly 100 normalized lines", () => {
  const shared = filler("shared", 25);
  const corpus = [{ path: "old/left.ts", lines: interleaved(shared) }];
  const index = createLineIndex(corpus);
  const nineteen = [...shared.slice(0, 19), ...filler("own", 81)];
  const twenty = [...shared.slice(0, 20), ...filler("own", 80)];
  assert.equal(nineteen.length, 100);
  assert.equal(twenty.length, 100);
  const pass = lineMetrics(index, nineteen);
  assert.equal(Number(pass.containment.toFixed(4)), 0.19);
  assert.ok(pass.longestRun < LINE_RUN_LIMIT);
  assert.ok(pass.containment < LINE_CONTAINMENT_LIMIT);
  const fail = lineMetrics(index, twenty);
  assert.equal(Number(fail.containment.toFixed(4)), 0.2);
  assert.ok(fail.containment >= LINE_CONTAINMENT_LIMIT);
});

test("line threshold: longest identical run 7 passes and 8 fails", () => {
  const shared = filler("shared", 12);
  const corpus = [{ path: "old/run.ts", lines: shared }];
  const index = createLineIndex(corpus);
  const seven = [...shared.slice(0, 7), ...filler("own", 93)];
  const eight = [...shared.slice(0, 8), ...filler("own", 92)];
  const pass = lineMetrics(index, seven);
  assert.equal(pass.longestRun, 7);
  assert.ok(pass.containment < LINE_CONTAINMENT_LIMIT);
  const fail = lineMetrics(index, eight);
  assert.equal(fail.longestRun, 8);
  assert.ok(fail.longestRun >= LINE_RUN_LIMIT);
});

test("line threshold: exactly 10 normalized lines counts as the >= 10 branch", () => {
  assert.equal(LINE_MIN_LINES, 10);
  const shared = filler("shared", 25);
  const index = createLineIndex([{ path: "old/ten.ts", lines: interleaved(shared) }]);
  const ten = [...shared.slice(0, 2), ...filler("own", 8)];
  assert.equal(ten.length, 10);
  const metric = lineMetrics(index, ten);
  assert.equal(Number(metric.containment.toFixed(2)), 0.2);
  assert.ok(metric.longestRun < LINE_RUN_LIMIT);
});

test("line threshold: fewer than 10 normalized lines requires zero containment", () => {
  const index = createLineIndex([{ path: "old/short.ts", lines: ["const shared = 1;"] }]);
  const leaking = ["const shared = 1;", ...filler("own", 8)];
  assert.equal(leaking.length, 9);
  assert.ok(lineMetrics(index, leaking).containment > 0);
  const clean = filler("own", 9);
  assert.equal(lineMetrics(index, clean).containment, 0);
  assert.equal(LINE_MIN_LINES, 10);
});

test("normalizeLines removes compatibility lines named by interface.md entries", () => {
  const text = [
    "export declare function readFlow(id: string): Promise<void>;",
    "export interface FlowReader { read(id: string): string; }",
    "const internalCounter = 3;",
  ].join("\n");
  assert.deepEqual(normalizeLines(text, { compatNames: ["readFlow", "FlowReader"] }), [
    "const internalCounter = 3;",
  ]);
});

test("declaration stripping turns an over-threshold declaration file into a pass", () => {
  const lines = [
    "export interface ToolExecutor {",
    "  execute(name: string): Promise<void>;",
    "}",
    "export declare function createToolExecutor(): ToolExecutor;",
    "export type ToolResult = { ok: boolean };",
  ];
  // 语料与候选都先按同一套规范化规则处理，与 createCorpusBuilder 的产出一致。
  const normalized = normalizeLines(lines.join("\n"));
  const index = createLineIndex([{ path: "old/tool.ts", lines: normalized }]);
  assert.ok(lineMetrics(index, normalized).containment >= LINE_CONTAINMENT_LIMIT);
  // 兼容文件只剩 interface.md 列出的名字时，逐行剔除后候选为空，包含率必须为 0。
  const allNames = ["ToolExecutor", "ToolResult", "execute"];
  const stripped = normalizeLines(lines.join("\n"), { compatNames: allNames });
  assert.deepEqual(stripped, []);
  assert.equal(lineMetrics(index, stripped).containment, 0);
  // 只剔除一部分名字时，剩下的兼容行仍会被算进包含率。
  const partial = normalizeLines(lines.join("\n"), { compatNames: ["ToolResult"] });
  assert.ok(lineMetrics(index, partial).containment >= LINE_CONTAINMENT_LIMIT);
});

test("kindOf groups the JavaScript family and keeps other extensions separate", () => {
  const createLineIndexFiles = createLineIndex([
    { path: "a/one.ts", lines: ["const a = 1;"] },
    { path: "a/two.jsx", lines: ["const b = 1;"] },
    { path: "a/three.py", lines: ["b = 1"] },
  ]);
  assert.equal(createLineIndexFiles.kindCount, 2);
  const metric = lineMetrics(createLineIndexFiles, ["const a = 1;"]);
  assert.equal(metric.path, "a/one.ts");
});

test("tokenSequence replaces identifiers and literals but keeps keywords and punctuation", () => {
  assert.deepEqual(tokenSequence("const alpha = 42;", "a.ts"), ["const", "ID", "=", "NUM", ";"]);
  assert.deepEqual(tokenSequence('let name = "text";', "a.ts"), ["let", "ID", "=", "STR", ";"]);
  assert.deepEqual(tokenSequence("return `a${value}b`;", "a.ts"), ["return", "TPL", ";"]);
  const withComment = tokenSequence("// 注释\nconst value = 1;", "a.ts");
  assert.deepEqual(withComment, tokenSequence("const value = 1;", "a.ts"));
  const withImport = tokenSequence(
    "import {\n  readFile,\n} from 'node:fs';\nconst value = 1;",
    "a.ts",
  );
  assert.deepEqual(withImport, tokenSequence("const value = 1;", "a.ts"));
});

test("structural threshold catches an identifier-renamed copy", () => {
  const source = [
    "export function computeTotal(items: number[]): number {",
    "  return items.reduce((sum, item) => sum + item, 0);",
    "}",
  ].join("\n");
  const renamed = [
    "export function calculateAggregate(entries: number[]): number {",
    "  return entries.reduce((accumulator, entry) => accumulator + entry, 0);",
    "}",
  ].join("\n");
  const index = createFingerprintIndex([
    { path: "old/total.ts", fingerprints: structuralFingerprints(tokenSequence(source, "a.ts")) },
  ]);
  const metric = structuralMetrics(index, structuralFingerprints(tokenSequence(renamed, "a.ts")));
  assert.equal(metric.score, 1);
  assert.ok(metric.score > STRUCTURAL_LIMIT);
});

test("structural threshold lets an independent implementation pass", () => {
  const source = [
    "export function computeTotal(items: number[]): number {",
    "  return items.reduce((sum, item) => sum + item, 0);",
    "}",
  ].join("\n");
  const independent = [
    "export function sumPrices(prices: readonly number[]): number {",
    "  let total = 0;",
    "  for (const price of prices) {",
    "    total += price;",
    "  }",
    "  return total;",
    "}",
  ].join("\n");
  const index = createFingerprintIndex([
    { path: "old/total.ts", fingerprints: structuralFingerprints(tokenSequence(source, "a.ts")) },
  ]);
  const metric = structuralMetrics(
    index,
    structuralFingerprints(tokenSequence(independent, "a.ts")),
  );
  assert.ok(metric.score <= STRUCTURAL_LIMIT);
});

test("structural fingerprints follow winnowing parameters and stay deterministic", () => {
  const tokens = Array.from({ length: 400 }, (_, index) => `token${index % 7}`);
  assert.deepEqual(structuralFingerprints(tokens), structuralFingerprints(tokens));
  assert.ok(structuralFingerprints(tokens).length > 0);
  assert.ok(structuralFingerprints(tokens).length < 400 - 25 + 1);
  assert.deepEqual(structuralFingerprints(tokens.slice(0, 24)), []);
});

test("structural similarity is zero when no window survives the corpus", () => {
  const index = createFingerprintIndex([
    {
      path: "old/other.ts",
      fingerprints: structuralFingerprints(tokenSequence("const a = 1;", "a.ts")),
    },
  ]);
  const target = structuralFingerprints(
    tokenSequence(
      [
        "export function unrelated(input: string[]): string {",
        "  return input.filter(Boolean).join('|');",
        "}",
      ].join("\n"),
      "a.ts",
    ),
  );
  assert.equal(structuralMetrics(index, target).score, 0);
  assert.equal(structuralMetrics(index, target).path, null);
});

test("CLI reports per-file metrics, skips binaries and fails the over-threshold target", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-similarity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  const upstream = join(root, "upstream");
  await mkdir(repo, { recursive: true });
  await mkdir(upstream, { recursive: true });
  const git = async (cwd, args) =>
    (await run("git", ["-C", cwd, ...args], { windowsHide: true })).stdout;
  const commit = async (cwd, message) =>
    (
      await run(
        "git",
        [
          "-C",
          cwd,
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.invalid",
          "-c",
          "commit.gpgSign=false",
          "commit",
          "-qm",
          message,
        ],
        { windowsHide: true },
      )
    ).stdout;

  await git(repo, ["init", "-q"]);
  await git(upstream, ["init", "-q"]);
  const original = [
    "export function computeTotal(items: number[]): number {",
    "  return items.reduce((sum, item) => sum + item, 0);",
    "}",
  ].join("\n");
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(join(repo, "src/total.ts"), `${original}\n`);
  await git(repo, ["add", "."]);
  await commit(repo, "old implementation");
  const oldCommit = (await git(repo, ["rev-parse", "HEAD"])).trim();

  await writeFile(join(upstream, "total.ts"), `${original}\n`);
  await writeFile(join(upstream, "notes.md"), "# upstream\n");
  await git(upstream, ["add", "."]);
  await commit(upstream, "upstream fixture");
  const upstreamCommit = (await git(upstream, ["rev-parse", "HEAD"])).trim();

  const renamed = [
    "export function calculateAggregate(entries: number[]): number {",
    "  return entries.reduce((accumulator, entry) => accumulator + entry, 0);",
    "}",
  ].join("\n");
  await writeFile(join(repo, "src/aggregate.ts"), `${renamed}\n`);
  await writeFile(join(repo, "src/blob.bin"), Buffer.from([0, 1, 2, 3, 0]));
  const manifest = join(root, "targets.json");
  await writeFile(
    manifest,
    `${JSON.stringify(
      {
        targets: [
          { path: "src/aggregate.ts", replaced: ["src/total.ts"] },
          { path: "src/blob.bin", replaced: [] },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const args = [
    join(import.meta.dirname, "similarity.mjs"),
    "--targets",
    manifest,
    "--repo",
    repo,
    "--old-commit",
    oldCommit,
    "--upstream-repo",
    upstream,
    "--upstream-commit",
    upstreamCommit,
    "--out",
    join(root, "report.json"),
  ];
  const failed = await run(process.execPath, args, { windowsHide: true }).catch((error) => error);
  assert.notEqual(failed.code, 0);
  const report = JSON.parse(await readFile(join(root, "report.json"), "utf8"));
  const renamedEntry = report.targets.find((entry) => entry.path === "src/aggregate.ts");
  assert.equal(renamedEntry.passed, false);
  assert.ok(renamedEntry.structural.score > STRUCTURAL_LIMIT);
  assert.equal(renamedEntry.structural.path, "replaced:src/total.ts");
  const binaryEntry = report.targets.find((entry) => entry.path === "src/blob.bin");
  assert.equal(binaryEntry.kind, "binary");
  assert.equal(binaryEntry.passed, true);
});

test("CLI fails a target that is missing from the working tree", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-similarity-missing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  const upstream = join(root, "upstream");
  await mkdir(repo, { recursive: true });
  await mkdir(upstream, { recursive: true });
  await writeFile(join(upstream, "other.ts"), "export const other = 1;\n");
  const manifest = join(root, "targets.json");
  await writeFile(
    manifest,
    `${JSON.stringify({ targets: [{ path: "src/absent.ts", replaced: [] }] }, null, 2)}\n`,
  );
  const failed = await run(
    process.execPath,
    [
      join(import.meta.dirname, "similarity.mjs"),
      "--targets",
      manifest,
      "--repo",
      repo,
      "--upstream-repo",
      upstream,
      "--no-upstream",
    ],
    { windowsHide: true },
  ).catch((error) => error);
  assert.notEqual(failed.code, 0);
  const report = JSON.parse(failed.stdout);
  assert.equal(report.targets[0].kind, "missing");
  assert.equal(report.targets[0].passed, false);
  assert.match(report.targets[0].error, /missing from the working tree/);
});

test("CLI rejects a target manifest whose path is not repository-relative", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-similarity-manifest-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = join(root, "targets.json");
  await writeFile(
    manifest,
    `${JSON.stringify({ targets: [{ path: "..\\escape.ts", replaced: [] }] }, null, 2)}\n`,
  );
  const failed = await run(
    process.execPath,
    [join(import.meta.dirname, "similarity.mjs"), "--targets", manifest, "--no-upstream"],
    { windowsHide: true },
  ).catch((error) => error);
  assert.notEqual(failed.code, 0);
  assert.match(failed.stderr, /Invalid repository-relative path/);
});

test("renameIdentifiers leaves keywords alone so a renamed copy keeps its fingerprints", async () => {
  const { renameIdentifiers, summarizeStructural } = await import("./similarity-calibrate.mjs");
  const source = [
    "declare global {",
    "  interface Window { readonly knorvia: number; }",
    "}",
    "export function readValue(input: string): number {",
    "  const total = input.length;",
    "  return total;",
    "}",
  ].join("\n");
  const renamed = renameIdentifiers(source, "globals.d.ts");
  assert.match(renamed, /declare global \{/);
  assert.doesNotMatch(renamed, /function readValue/);
  const before = structuralFingerprints(tokenSequence(source, "globals.d.ts"));
  const after = structuralFingerprints(tokenSequence(renamed, "globals.d.ts"));
  const index = createFingerprintIndex([{ path: "replaced:globals.d.ts", fingerprints: before }]);
  assert.equal(structuralMetrics(index, after).score, 1);
  // 分桶按最接近的 0.05 归档：0.24 归 0.25，0.05 归 0.05。
  assert.deepEqual(summarizeStructural([0, 0.05, 0.2, 0.24, 1]).buckets, [
    { bucket: 0, count: 1 },
    { bucket: 0.05, count: 1 },
    { bucket: 0.2, count: 1 },
    { bucket: 0.25, count: 1 },
    { bucket: 1, count: 1 },
  ]);
});
