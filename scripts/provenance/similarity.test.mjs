// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 相似度工具（scripts/provenance/similarity.mjs）的契约测试：
// 行门槛边界、结构门槛（改名副本被拦、独立写法通过）、声明剔除、二进制跳过、Windows 换行、JSON 字段与退出码。
// 行门槛用例用 --gates line、结构用例用 --gates all，两道门槛各自独立验证（验收用默认 all）。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { THRESHOLDS, containment, longestRun, normalizeLines } from "./similarity-lines.mjs";
import { structuralFingerprints, structuralOverlap } from "./similarity-structural.mjs";

const tool = fileURLToPath(new URL("./similarity.mjs", import.meta.url));

function withTree(files, run) {
  const root = mkdtempSync(join(tmpdir(), "knorvia-similarity-"));
  try {
    for (const [path, contents] of Object.entries(files)) {
      const target = join(root, path);
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, contents);
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runTool(args) {
  try {
    return {
      status: 0,
      stdout: execFileSync(process.execPath, [tool, ...args], { encoding: "utf8" }),
    };
  } catch (error) {
    return { status: error.status, stdout: error.stdout ?? "" };
  }
}

/** 候选写到 upstream 树之外，避免与自身比较；返回候选绝对路径。 */
function writeCandidate(root, name, contents) {
  const path = join(root, "candidates", name);
  mkdirSync(join(root, "candidates"), { recursive: true });
  writeFileSync(path, contents);
  return path;
}

const upstreamLines = (count) =>
  Array.from({ length: count }, (_, index) => `const upstreamSymbol${index} = ${index};`).join(
    "\n",
  );

// 结构与上游行完全不同（含 =>、字符串、括号），避免 25 token 指纹偶然命中。
const fillerLines = (prefix, count) =>
  Array.from(
    { length: count },
    (_, index) =>
      `export const ${prefix}Filler${index} = (value: number): string => String(value) + '#' + '#${index}';`,
  ).join("\n");

test("normalization drops blank, bracket-only, import and re-export lines but keeps comments", () => {
  const lines = normalizeLines(
    [
      "  const value = 1;  ",
      "",
      "   ",
      "{",
      "  },",
      "()",
      "import { thing } from './thing.js';",
      "export * from './other.js';",
      "export { a, b };",
      "// 保留注释行",
      "/* 多行注释的一行 */",
    ].join("\r\n"),
  );
  assert.deepEqual(lines, ["const value = 1;", "// 保留注释行", "/* 多行注释的一行 */"]);
});

test("containment and longest run use the bookkeeping diagonal algorithm", () => {
  const upstream = normalizeLines(upstreamLines(20));
  const candidate = normalizeLines(
    [
      "const upstreamSymbol0 = 0;",
      "const upstreamSymbol1 = 1;",
      "const upstreamSymbol2 = 2;",
      "const localA = 1;",
      "const localB = 2;",
      "const upstreamSymbol7 = 7;",
      "const upstreamSymbol8 = 8;",
    ].join("\n"),
  );
  assert.equal(containment(candidate, upstream), 5 / 7);
  assert.equal(longestRun(candidate, upstream), 3);
});

test("exactly ten normalized lines uses the containment 0.1 / 0.2 boundary", () => {
  withTree({ "upstream/a.ts": upstreamLines(100) }, (root) => {
    const pass = runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--gates",
      "line",
      "--candidate",
      writeCandidate(root, "pass.ts", candidateOf(upstreamLines(1), { prefix: "pass", count: 9 })),
    ]);
    assert.equal(pass.status, 0, pass.stdout);
    const fail = runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--gates",
      "line",
      "--candidate",
      writeCandidate(root, "fail.ts", candidateOf(upstreamLines(2), { prefix: "fail", count: 8 })),
    ]);
    assert.equal(fail.status, 1, fail.stdout);
    assert.match(fail.stdout, /containment=0\.200/);
  });
});

test("containment 0.19 passes and 0.20 fails on a long candidate", () => {
  withTree({ "upstream/a.ts": upstreamLines(200) }, (root) => {
    const pass = runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--gates",
      "line",
      "--candidate",
      writeCandidate(
        root,
        "nineteen.ts",
        candidateOf(scatter(19), { prefix: "nineteen", count: 81 }),
      ),
    ]);
    assert.equal(pass.status, 0, pass.stdout);
    const fail = runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--gates",
      "line",
      "--candidate",
      writeCandidate(root, "twenty.ts", candidateOf(scatter(20), { prefix: "twenty", count: 80 })),
    ]);
    assert.equal(fail.status, 1, fail.stdout);
  });
});

test("longest identical run 7 passes and 8 fails", () => {
  withTree({ "upstream/a.ts": upstreamLines(200) }, (root) => {
    const pass = runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--gates",
      "line",
      "--candidate",
      writeCandidate(
        root,
        "run7.ts",
        candidateOf(upstreamLines(7), { prefix: "seven", count: 93 }),
      ),
    ]);
    assert.equal(pass.status, 0, pass.stdout);
    const fail = runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--gates",
      "line",
      "--candidate",
      writeCandidate(
        root,
        "run8.ts",
        candidateOf(upstreamLines(8), { prefix: "eight", count: 92 }),
      ),
    ]);
    assert.equal(fail.status, 1, fail.stdout);
    assert.match(fail.stdout, /run=8/);
  });
});

test("fewer than ten normalized lines must have zero containment", () => {
  withTree({ "upstream/a.ts": upstreamLines(50) }, (root) => {
    const result = runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--gates",
      "line",
      "--candidate",
      writeCandidate(root, "tiny.ts", candidateOf(upstreamLines(1), { prefix: "tiny", count: 8 })),
    ]);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /lines=9/);
  });
});

test("a renamed copy is blocked by structural similarity", () => {
  const source = [
    "import { readFileSync } from 'node:fs';",
    "export function collectWorkspaceSnapshot(rootDirectory: string) {",
    "  const entries = readDirectoryEntries(rootDirectory);",
    "  const snapshot = new Map<string, number>();",
    "  for (const entry of entries) {",
    "    const size = measureEntrySize(entry);",
    "    if (size > 0) {",
    "      snapshot.set(entry.name, size);",
    "    }",
    "  }",
    "  return { root: rootDirectory, total: snapshot.size, snapshot };",
    "}",
    "function readDirectoryEntries(directory: string) {",
    "  return [{ name: directory, size: 1 }, { name: directory + '/nested', size: 2 }];",
    "}",
    "function measureEntrySize(entry: { size: number }) {",
    "  return entry.size;",
    "}",
  ].join("\n");
  const renamed = source.replace(
    /\b(collectWorkspaceSnapshot|readDirectoryEntries|measureEntrySize|Map|rootDirectory|entries|snapshot|entry|size|directory|name|total)\b/g,
    (name) => `renamed${name.length}`,
  );
  withTree({ "upstream/original.ts": source }, (root) => {
    const result = runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--candidate",
      writeCandidate(root, "renamed.ts", renamed),
    ]);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /structural=1\.000/);
  });
});

test("an independently structured implementation passes both gates", () => {
  withTree({ "upstream/original.ts": upstreamLines(200) }, (root) => {
    const independent = Array.from(
      { length: 40 },
      (_, index) =>
        `export const compute${index} = (input${index}: number) => input${index} * ${index + 1} + Math.round(input${index} / 2);`,
    ).join("\n");
    const result = runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--candidate",
      writeCandidate(root, "independent.ts", independent),
    ]);
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /structural=0\.000/);
  });
});

test("declaration compatibility lines are stripped using interface.md names", () => {
  const compatibility = [
    "export interface WorkspaceSnapshot {",
    "  root: string;",
    "  total: number;",
    "  entries: readonly string[];",
    "}",
    "export declare function collectWorkspaceSnapshot(root: string): WorkspaceSnapshot;",
    "export type WorkspaceSnapshotKey = keyof WorkspaceSnapshot;",
    "export declare function measureEntrySize(entry: string): number;",
    "export declare function readDirectoryEntries(path: string): string[];",
  ].join("\n");
  withTree(
    {
      // 上游文件含有同名兼容声明 + 一条不属于兼容名字的声明。
      "upstream/collect.ts": `${compatibility}\nexport declare const legacyOnlySymbol = 1;`,
      "contract/interface.md": [
        "# interface",
        "",
        "- 模块：`collectWorkspaceSnapshot`、`measureEntrySize`、`readDirectoryEntries`、`WorkspaceSnapshot`",
        "- 类型：`WorkspaceSnapshotKey`",
        "- 字段：`root`、`total`、`entries`",
        "",
        "```ts",
        "export declare function collectWorkspaceSnapshot(root: string): WorkspaceSnapshot;",
        "```",
      ].join("\n"),
    },
    (root) => {
      const upstreamDir = join(root, "upstream");
      const candidate = writeCandidate(root, "collect.d.ts", compatibility);
      const withoutDeclaration = runTool(["--upstream-dir", upstreamDir, "--candidate", candidate]);
      assert.equal(withoutDeclaration.status, 1, withoutDeclaration.stdout);
      const withDeclaration = runTool([
        "--upstream-dir",
        upstreamDir,
        "--candidate",
        candidate,
        "--declaration",
        "--interface",
        join(root, "contract/interface.md"),
      ]);
      assert.equal(withDeclaration.status, 0, withDeclaration.stdout);
      assert.match(withDeclaration.stdout, /declaration-lines=\d+/);
      assert.match(withDeclaration.stdout, /lines=0/);
      // 不在兼容名字里的行仍然参与比较：只有它被留下时依然不通过。
      const leftover = writeCandidate(
        root,
        "leftover.d.ts",
        `${compatibility}\nexport declare const legacyOnlySymbol = 1;`,
      );
      const stillFailing = runTool([
        "--upstream-dir",
        upstreamDir,
        "--candidate",
        leftover,
        "--declaration",
        "--interface",
        join(root, "contract/interface.md"),
      ]);
      assert.equal(stillFailing.status, 1, stillFailing.stdout);
      assert.match(stillFailing.stdout, /declaration-lines=\d+/);
      assert.match(stillFailing.stdout, /lines=1/);
    },
  );
});

test("binary candidates are skipped instead of compared as text", () => {
  withTree({ "upstream/a.ts": upstreamLines(30) }, (root) => {
    const binary = join(root, "candidates", "logo.bin");
    mkdirSync(join(root, "candidates"), { recursive: true });
    writeFileSync(binary, Buffer.from([0, 1, 2, 3, 0, 255, 254]));
    const json = join(root, "out.json");
    const result = runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--candidate",
      binary,
      "--json",
      json,
    ]);
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /binary/);
    const report = JSON.parse(readFileSync(json, "utf8"));
    assert.equal(report.candidates[0].binary, true);
    assert.equal(report.candidates[0].maxContainment, null);
    assert.equal(report.candidates[0].structural, null);
  });
});

test("Windows line endings normalize to the same metrics as LF", () => {
  const source = upstreamLines(30);
  withTree({ "upstream/a.ts": source }, (root) => {
    const upstreamDir = join(root, "upstream");
    const crlf = runTool([
      "--upstream-dir",
      upstreamDir,
      "--candidate",
      writeCandidate(root, "copy-crlf.ts", `${source.replace(/\n/g, "\r\n")}\r\n`),
    ]);
    const lf = runTool([
      "--upstream-dir",
      upstreamDir,
      "--candidate",
      writeCandidate(root, "copy-lf.ts", `${source}\n`),
    ]);
    assert.equal(crlf.status, 1, crlf.stdout);
    assert.equal(lf.status, 1, lf.stdout);
    assert.match(crlf.stdout, /containment=1\.000/);
    assert.match(lf.stdout, /containment=1\.000/);
    assert.match(crlf.stdout, /structural=1\.000/);
    assert.match(lf.stdout, /structural=1\.000/);
    const independent = writeCandidate(
      root,
      "independent-crlf.ts",
      `${fillerLines("crlf", 30).replace(/\n/g, "\r\n")}\r\n`,
    );
    assert.equal(runTool(["--upstream-dir", upstreamDir, "--candidate", independent]).status, 0);
  });
});

test("old files are compared alongside the upstream tree", () => {
  const oldSource = [
    "export function legacyHandler(request: string) {",
    "  const normalized = request.trim().toLowerCase();",
    "  return { accepted: normalized.length > 0, normalized };",
    "}",
  ].join("\n");
  withTree({ "upstream/unrelated.ts": upstreamLines(50) }, (root) => {
    const upstreamDir = join(root, "upstream");
    mkdirSync(join(root, "repo/legacy"), { recursive: true });
    writeFileSync(join(root, "repo/legacy/handler.ts"), oldSource);
    const candidate = join(root, "repo/legacy/handler-new.ts");
    writeFileSync(
      candidate,
      oldSource.replace(
        /\b(request|normalized|accepted|legacyHandler)\b/g,
        (name) => `x${name.length}`,
      ),
    );
    const result = runTool([
      "--repo",
      join(root, "repo"),
      "--upstream-dir",
      upstreamDir,
      "--candidate",
      candidate,
      "--old",
      "legacy/handler.ts",
    ]);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /structural=1\.000/);
    assert.match(result.stdout, /\(legacy\/handler\.ts\)/);
  });
});

test("the JSON report carries lines, containment, run and structural fields", () => {
  withTree({ "upstream/a.ts": upstreamLines(200) }, (root) => {
    const json = join(root, "report.json");
    const candidate = writeCandidate(
      root,
      "reported.ts",
      candidateOf(scatter(19), { prefix: "reported", count: 81 }),
    );
    const result = runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--candidate",
      candidate,
      "--json",
      json,
    ]);
    assert.equal(result.status, 0, result.stdout);
    const report = JSON.parse(readFileSync(json, "utf8"));
    assert.equal(report.schemaVersion, 1);
    assert.deepEqual(report.thresholds, THRESHOLDS);
    const [entry] = report.candidates;
    assert.equal(entry.path, candidate);
    assert.equal(entry.lines, 100);
    assert.equal(entry.binary, false);
    assert.equal(entry.declaration, false);
    assert.equal(entry.linesBeforeStrip, 100);
    assert.equal(entry.strippedLines, 0);
    assert.equal(entry.residualLines, 100);
    assert.equal(entry.maxContainment.value, 0.19);
    assert.equal(entry.maxContainment.file, "a.ts");
    assert.equal(entry.longestRun.value, 1);
    assert.equal(entry.longestRun.file, "a.ts");
    assert.equal(typeof entry.structural.value, "number");
    assert.equal(entry.pass, true);
    assert.deepEqual(entry.violations, []);
    assert.equal(report.summary.candidates, 1);
    assert.equal(report.summary.failed, 0);
    assert.equal(report.pass, true);
  });
});

test("a candidate inside the upstream tree is not compared against itself", () => {
  withTree({ "upstream/a.ts": upstreamLines(100) }, (root) => {
    const self = join(root, "upstream", "self.ts");
    writeFileSync(self, fillerLines("self", 100));
    const result = runTool(["--upstream-dir", join(root, "upstream"), "--candidate", self]);
    assert.equal(result.status, 0, result.stdout);
    // 除自身外没有其他同类上游文件，因此包含率与最长段都必须是 0。
    assert.match(result.stdout, /containment=0\.000/);
    assert.match(result.stdout, /run=0/);
  });
});

test("structural fingerprints use 25-token grams with a 20-window", () => {
  assert.equal(structuralFingerprints(Array.from({ length: 25 }, () => "I")).size, 1);
  const longer = Array.from({ length: 60 }, (_, index) =>
    index % 3 === 0 ? "I" : index % 3 === 1 ? "N" : ";",
  );
  assert.ok(structuralFingerprints(longer).size > 0);
  assert.equal(structuralOverlap(new Set(["a", "b"]), new Set(["a", "b", "c"])), 1);
  assert.equal(structuralOverlap(new Set(["a", "b"]), new Set(["c"])), 0);
  assert.equal(structuralOverlap(new Set(), new Set(["a"])), 0);
});

test("threshold constants are the calibrated values", () => {
  assert.deepEqual(THRESHOLDS, { minLines: 10, containment: 0.2, longestRun: 8, structural: 0.4 });
});

test("usage errors exit with code 2", () => {
  assert.equal(runTool(["--candidate", "missing.ts"]).status, 2);
});

function candidateOf(matchedLines, filler) {
  return `${matchedLines}\n${fillerLines(filler.prefix, filler.count)}`;
}

function scatter(count) {
  const lines = normalizeLines(upstreamLines(200));
  return Array.from({ length: count }, (_, index) => lines[index * 7]).join("\n");
}
test("声明模式：具名导出类型整块剔除，普通模式数值不变", () => {
  const declaration = [
    "export interface WorkspaceHookTelemetryFields {",
    "  workspaceIdentity?: string;",
    "  sessionCount: number;",
    "  enabled: boolean;",
    "}",
  ].join("\n");
  withTree(
    {
      "upstream/hook-fields.ts": declaration,
      "contract/interface.md": "# interface\n\n- 类型：`WorkspaceHookTelemetryFields`\n",
    },
    (root) => {
      const upstreamDir = join(root, "upstream");
      const candidate = writeCandidate(root, "hook-fields.ts", declaration);
      // 普通模式：与改动前一致（4 行、包含率 1.000、最长段 4），不带 --declaration。
      const normal = runTool(["--upstream-dir", upstreamDir, "--candidate", candidate]);
      assert.equal(normal.status, 1, normal.stdout);
      assert.match(normal.stdout, /declaration=false/);
      assert.match(normal.stdout, /lines=4/);
      assert.match(normal.stdout, /containment=1\.000/);
      assert.match(normal.stdout, /run=4/);
      // 声明模式：整块剔除，残留行 0。
      const stripped = runTool([
        "--upstream-dir",
        upstreamDir,
        "--candidate",
        candidate,
        "--declaration",
        "--interface",
        join(root, "contract/interface.md"),
      ]);
      assert.equal(stripped.status, 0, stripped.stdout);
      assert.match(stripped.stdout, /declaration=true/);
      assert.match(stripped.stdout, /declaration-lines=4/);
      assert.match(stripped.stdout, /residual-lines=0/);
      assert.match(stripped.stdout, /stripped-blocks=1/);
    },
  );
});

test("声明模式：成员名不在 interface.md 的声明块不被剔除", () => {
  const notListed = ["export interface NotListedShape {", "  alpha: string;", "}"].join("\n");
  withTree(
    {
      "upstream/not-listed.ts": notListed,
      "contract/interface.md": "# interface\n\n- 类型：`SomeOtherShape`\n",
    },
    (root) => {
      const result = runTool([
        "--upstream-dir",
        join(root, "upstream"),
        "--candidate",
        writeCandidate(root, "not-listed.ts", notListed),
        "--declaration",
        "--interface",
        join(root, "contract/interface.md"),
      ]);
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stdout, /stripped-blocks=0/);
      assert.match(result.stdout, /residual-lines=2/);
      assert.match(result.stdout, /containment=1\.000/);
    },
  );
});

test("声明模式：嵌套声明整块剔除且不吞掉后面的实现代码", () => {
  const mixed = [
    "export interface ListedShape {",
    "  nested: { value: string };",
    '  union: "a" | "b";',
    "}",
    "export function afterTheBlock(value: string): string {",
    "  return value.trim();",
    "}",
  ].join("\n");
  withTree(
    {
      "upstream/mixed.ts": mixed,
      "contract/interface.md": "# interface\n\n- 类型：`ListedShape`\n",
    },
    (root) => {
      const result = runTool([
        "--upstream-dir",
        join(root, "upstream"),
        "--candidate",
        writeCandidate(root, "mixed.ts", mixed),
        "--declaration",
        "--interface",
        join(root, "contract/interface.md"),
      ]);
      // 整块 4 行被剔除；后面的函数保留 2 个规范化行（`}` 是纯括号行，本来就不计）。
      assert.match(result.stdout, /stripped-blocks=1/);
      assert.match(result.stdout, /residual-lines=2/);
      assert.match(result.stdout, /lines=2/);
    },
  );
});
test("SPDX/许可头行不参与行相似度（桶文件可过、两侧同头不计入、无头文件不变）", () => {
  // ① 只有 SPDX 头 + 一行正文的桶文件：剔除头行后 <10 行且包含率为 0，可以通过。
  const bucket = [
    "// SPDX-License-Identifier: Apache-2.0",
    "// Copyright (c) 2026 Knorvia Studio contributors",
    "export {};",
  ].join("\n");
  withTree(
    {
      "upstream/bucket.ts": "export {};",
    },
    (root) => {
      const result = runTool([
        "--upstream-dir",
        join(root, "upstream"),
        "--candidate",
        writeCandidate(root, "bucket.ts", bucket),
      ]);
      assert.equal(result.status, 0, result.stdout);
      assert.match(result.stdout, /lines=0/);
      assert.match(result.stdout, /containment=0\.000/);
    },
  );

  // ② 两侧带同一 SPDX 头时，该行不参与包含率：正文不同 → 包含率 0。
  const header =
    "// SPDX-License-Identifier: Apache-2.0\n// Copyright (c) 2026 Knorvia Studio contributors\n";
  withTree({ "upstream/other.ts": `${header}${fillerLines("other", 12)}` }, (root) => {
    const result = runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--gates",
      "line",
      "--candidate",
      writeCandidate(root, "same-header.ts", `${header}${fillerLines("mine", 12)}`),
    ]);
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /lines=12/);
    assert.match(result.stdout, /containment=0\.000/);
  });

  // ③ 不含 SPDX 的文件：规范化结果与既有规则一致（注释保留、空行/分隔符/import 丢弃）。
  assert.deepEqual(normalizeLines("// 注释\n\nconst value = 1;\nimport { a } from 'b';\n}\n"), [
    "// 注释",
    "const value = 1;",
  ]);
});
