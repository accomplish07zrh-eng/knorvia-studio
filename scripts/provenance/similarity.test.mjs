// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 相似度工具（scripts/provenance/similarity.mjs）的契约测试：
// 行门槛边界、结构门槛（改名副本被拦、独立写法通过）、声明剔除、二进制跳过、Windows 换行、JSON 字段与退出码；
// 以及 2026-10-19 防刷口径：压行、拆行、增删注释前后两道指标不变，压行与凑注释不再能稀释包含率。
// 行门槛用例用 --gates line、结构用例用 --gates all，两道门槛各自独立验证（验收用默认 all）。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  THRESHOLDS,
  containment,
  explainContainment,
  longestRun,
  longestRunDetail,
  normalizeLines,
} from "./similarity-lines.mjs";
import { gateLines, loadOxfmtOptions } from "./similarity-normalize.mjs";
import {
  structuralFingerprints,
  structuralOverlap,
  structuralTokens,
} from "./similarity-structural.mjs";

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

async function withTreeAsync(files, run) {
  const root = mkdtempSync(join(tmpdir(), "knorvia-similarity-"));
  try {
    for (const [path, contents] of Object.entries(files)) {
      const target = join(root, path);
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, contents);
    }
    return await run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runTool(args) {
  try {
    return {
      status: 0,
      stderr: "",
      stdout: execFileSync(process.execPath, [tool, ...args], { encoding: "utf8" }),
    };
  } catch (error) {
    // usageError 把原因写到 stderr；契约行剔除的「跳过通用名」告警也在 stderr，
    // 因此这里一并返回，供断言检查。
    return { status: error.status, stderr: error.stderr ?? "", stdout: error.stdout ?? "" };
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

test("contract-lines strips only rows named in the interface table", () => {
  // 契约行剔除认的是 interface.md 表格里逐条列出的名字；这里构造一个实现文件，
  // 前半是与上游同形的契约行（导出、字段、事件名），后半是实现噪声。
  const upstream = [
    "export const TOOL_ERROR_MESSAGE = 'tool failed';",
    "export function reportToolError(kind, detail) {",
    "  return { kind, detail, message: TOOL_ERROR_MESSAGE };",
    "}",
    "export function unrelated(value) {",
    "  return value + 1;",
    "}",
  ].join("\n");
  const candidateText = [
    "const UNRELATED_LOCAL = 1;",
    "export const TOOL_ERROR_MESSAGE = 'tool failed';",
    "export function reportToolError(kind, detail) {",
    "  return { kind, detail, message: TOOL_ERROR_MESSAGE };",
    "}",
    "export function totallyDifferent(payload) {",
    "  const scaled = payload * 2;",
    "  return scaled - UNRELATED_LOCAL;",
    "}",
  ].join("\n");
  withTree(
    {
      "upstream/errors.ts": upstream,
      "contract/interface.md": [
        "# interface",
        "",
        "| 模块 | 导出名 | 种类 |",
        "| --- | --- | --- |",
        "| `errors.ts` | `TOOL_ERROR_MESSAGE` | const |",
        "| `errors.ts` | `reportToolError` | function |",
      ].join("\n"),
    },
    (root) => {
      const upstreamDir = join(root, "upstream");
      const candidate = writeCandidate(root, "errors.ts", candidateText);
      const plain = runTool(["--upstream-dir", upstreamDir, "--candidate", candidate]);
      assert.equal(plain.status, 1, plain.stdout);
      const stripped = runTool([
        "--upstream-dir",
        upstreamDir,
        "--candidate",
        candidate,
        "--contract-lines",
        "--interface",
        join(root, "contract/interface.md"),
      ]);
      assert.equal(stripped.status, 0, stripped.stdout);
      // 剔除前后两组行数都要在报告里可见。
      assert.match(stripped.stdout, /contract-lines=\d+/);
      assert.match(stripped.stdout, /residual-lines=\d+->\d+/);
      // 名字清单是审查重点项，必须完整打印。
      assert.match(stripped.stdout, /contract-names=\[.*TOOL_ERROR_MESSAGE.*\]/);
      assert.match(stripped.stdout, /contract-names=\[.*reportToolError.*\]/);
      // 未列名的实现行仍参与比较，剔除不是万能的。
      const stillFailing = writeCandidate(
        root,
        "still.ts",
        [
          "export const TOOL_ERROR_MESSAGE = 'tool failed';",
          "export function reportToolError(kind, detail) {",
          "  return { kind, detail, message: TOOL_ERROR_MESSAGE };",
          "}",
          "export function sameAsUpstreamToo(value) {",
          "  return value + 1;",
          "}",
        ].join("\n"),
      );
      const failing = runTool([
        "--upstream-dir",
        upstreamDir,
        "--candidate",
        stillFailing,
        "--contract-lines",
        "--interface",
        join(root, "contract/interface.md"),
      ]);
      assert.equal(failing.status, 1, failing.stdout);
    },
  );
});

test("contract-lines keeps dotted event names whole instead of splitting them", () => {
  // `mcp.server.reconnect.failed` 必须整体匹配：拆成 `mcp` 会剔掉所有含 mcp 的行。
  const upstream = [
    "const MCP_KEEP = 'must stay';",
    "export function mcpHelper() {",
    "  return MCP_KEEP;",
    "}",
    "export const event = 'mcp.server.reconnect.failed';",
  ].join("\n");
  withTree(
    {
      "upstream/events.ts": upstream,
      "contract/interface.md": [
        "# interface",
        "",
        "| 模块 | 事件名 |",
        "| --- | --- |",
        "| `events.ts` | `mcp.server.reconnect.failed` |",
      ].join("\n"),
    },
    (root) => {
      const upstreamDir = join(root, "upstream");
      const candidate = writeCandidate(root, "events.ts", upstream);
      const result = runTool([
        "--upstream-dir",
        upstreamDir,
        "--candidate",
        candidate,
        "--contract-lines",
        "--interface",
        join(root, "contract/interface.md"),
      ]);
      // 整体名字只剔除含该事件名的那一行；含 `mcp` 的其它行必须留下。
      assert.match(result.stdout, /contract-lines=1/);
      assert.match(result.stdout, /contract-names=\[[^\]]*mcp\.server\.reconnect\.failed[^\]]*\]/);
      // 关键：含 `mcp` 的其它行没有被连带剔除（若按 `mcp` 拆分会把 mcpHelper 也剔掉）。
      assert.match(result.stdout, /lines=3/);
    },
  );
});

test("contract-lines skips over-generic names instead of stripping the file away", () => {
  withTree(
    {
      "upstream/t.ts": upstreamLines(20),
      "contract/interface.md": [
        "# interface",
        "",
        "| 模块 | 导出名 |",
        "| --- | --- |",
        "| `t.ts` | `event` |",
        "| `t.ts` | `code` |",
        "| `t.ts` | `collectWorkspaceSnapshot` |",
      ].join("\n"),
    },
    (root) => {
      const candidate = writeCandidate(root, "t.ts", upstreamLines(20));
      const result = runTool([
        "--upstream-dir",
        join(root, "upstream"),
        "--candidate",
        candidate,
        "--contract-lines",
        "--interface",
        join(root, "contract/interface.md"),
      ]);
      // 通用短名被跳过并告警，而不是把文件剔空。
      assert.match(result.stderr, /skips over-generic names/);
      assert.match(result.stderr, /event/);
    },
  );
});

test("contract-lines and declaration are mutually exclusive", () => {
  withTree({ "upstream/a.ts": upstreamLines(12) }, (root) => {
    const candidate = writeCandidate(root, "a.ts", upstreamLines(12));
    const result = runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--candidate",
      candidate,
      "--declaration",
      "--contract-lines",
      "--interface",
      join(root, "contract/interface.md"),
    ]);
    assert.equal(result.status, 2, result.stdout);
    assert.match(result.stderr, /mutually exclusive/);
  });
});

test("contract-module narrows the names to one module row", () => {
  // 整包 interface.md 有数百条导出名；不按模块过滤会剔掉邻居文件的契约行。
  const upstream = [
    "export function alphaFromThisModule() {",
    "  return 1;",
    "}",
    "export function betaFromOtherModule() {",
    "  return 2;",
    "}",
    "export function unrelatedImpl(value) {",
    "  return value * 3;",
    "}",
  ].join("\n");
  withTree(
    {
      "upstream/a.ts": upstream,
      "contract/interface.md": [
        "# interface",
        "",
        "| 模块 | 导出名 | 类型 | 是否公开 |",
        "| --- | --- | --- | --- |",
        "| `alpha.ts` | `alphaFromThisModule` | function | 是 |",
        "| `beta.ts` | `betaFromOtherModule` | function | 是 |",
      ].join("\n"),
    },
    (root) => {
      const candidate = writeCandidate(root, "alpha.ts", upstream);
      const scoped = runTool([
        "--upstream-dir",
        join(root, "upstream"),
        "--candidate",
        candidate,
        "--contract-lines",
        "--contract-module",
        "alpha.ts",
        "--interface",
        join(root, "contract/interface.md"),
      ]);
      // 只取 alpha.ts 那一行：betaFromOtherModule 不应出现在名字清单里。
      assert.match(scoped.stdout, /contract-names=\[[^\]]*alphaFromThisModule[^\]]*\]/);
      assert.doesNotMatch(scoped.stdout, /betaFromOtherModule/);
    },
  );
});

test("contract-module fails loudly when the table has no matching row", () => {
  withTree(
    {
      "upstream/a.ts": upstreamLines(12),
      "contract/interface.md": [
        "# interface",
        "",
        "| 模块 | 导出名 |",
        "| --- | --- |",
        "| `other.ts` | `someName` |",
      ].join("\n"),
    },
    (root) => {
      const candidate = writeCandidate(root, "a.ts", upstreamLines(12));
      const result = runTool([
        "--upstream-dir",
        join(root, "upstream"),
        "--candidate",
        candidate,
        "--contract-lines",
        "--contract-module",
        "missing.ts",
        "--interface",
        join(root, "contract/interface.md"),
      ]);
      // 匹配不到就报错，不退化成整包清单。
      assert.equal(result.status, 2, result.stdout);
      assert.match(result.stderr, /matched no row/);
    },
  );
});

test("contract-lines reads only the export column and ignores module paths", () => {
  // 模块列里的 `src/workflow/definition.ts` 若被当成名字，`src` 会剔掉大量无关行。
  const upstream = [
    "export function keepThisWorkingFunction() {",
    "  return 1;",
    "}",
    "const src = 1;",
    "const workflow = 2;",
    "const definition = 3;",
  ].join("\n");
  withTree(
    {
      "upstream/a.ts": upstream,
      "contract/interface.md": [
        "# interface",
        "",
        "| 模块 | 导出名 | 说明 |",
        "| --- | --- | --- |",
        "| `src/workflow/definition.ts` | `keepThisWorkingFunction` | — |",
      ].join("\n"),
    },
    (root) => {
      const candidate = writeCandidate(root, "definition.ts", upstream);
      const result = runTool([
        "--upstream-dir",
        join(root, "upstream"),
        "--candidate",
        candidate,
        "--contract-lines",
        "--interface",
        join(root, "contract/interface.md"),
      ]);
      assert.match(result.stdout, /contract-names=\[keepThisWorkingFunction\]/);
    },
  );
});

test("contract-lines ignores backticked module paths when extracting", () => {
  // 反引号里的路径必须先整段丢弃：否则 `apps/cli/core` 会被切成三个合法标识符般的碎片。
  withTree(
    {
      "upstream/a.ts": "export interface RealContractName {\n  id: string;\n}\n",
      "contract/interface.md": [
        "# interface",
        "",
        "- 模块：`apps/cli/packages/core/src/hooks/runner-plan.ts`",
        "",
        "| 模块 | 导出名 |",
        "| --- | --- |",
        "| `runner-plan.ts` | `apps` |",
        "| `runner-plan.ts` | `RealContractName` |",
      ].join("\n"),
    },
    (root) => {
      const candidate = writeCandidate(
        root,
        "runner-plan.ts",
        "export interface RealContractName {\n  id: string;\n}\n",
      );
      const result = runTool([
        "--upstream-dir",
        join(root, "upstream"),
        "--candidate",
        candidate,
        "--contract-lines",
        "--interface",
        join(root, "contract/interface.md"),
      ]);
      // 表格导出名列里真写了 `apps` 也照常提取（那是逐条列出的，责任在合同），
      // 但正文里的路径不得被切成碎片名。
      assert.doesNotMatch(result.stderr, /apps,|, apps/);
    },
  );
});

test("strip accounting keeps the identity and never reports negative lines", () => {
  // 恒等式：linesBeforeStrip - residualLines === strippedLines，且 strippedLines 不得为负。
  // 纯 re-export 文件曾出现 -7：格式化把 re-export 丢光后 before=0，而 residual 是展开追踪的 7 行。
  withTree(
    {
      "upstream/a.ts": "export const value = 1;\n",
      "contract/interface.md": [
        "# interface",
        "",
        "| 模块 | 导出名 |",
        "| --- | --- |",
        "| `a.ts` | `value` |",
      ].join("\n"),
    },
    (root) => {
      const candidate = writeCandidate(
        root,
        "a.ts",
        ["export { alpha } from './alpha.js';", "export { beta } from './beta.js';"].join("\n"),
      );
      const json = join(root, "out.json");
      const result = runTool([
        "--upstream-dir",
        join(root, "upstream"),
        "--candidate",
        candidate,
        "--declaration",
        "--interface",
        join(root, "contract/interface.md"),
        "--json",
        json,
      ]);
      const report = JSON.parse(readFileSync(json, "utf8"));
      for (const item of report.candidates) {
        assert.ok(item.strippedLines >= 0, `strippedLines 为负: ${item.strippedLines}`);
        assert.equal(
          item.linesBeforeStrip - item.residualLines,
          item.strippedLines,
          "剔除行数不满足恒等式",
        );
      }
      assert.ok(result.status === 0 || result.status === 1);
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

test("多行 import / re-export 整条语句不参与行相似度（只丢首行会留下名字列表与 from 行）", () => {
  // 修复背景：一条 import / re-export 语句常跨多行，只丢首行会把名字列表留在比较集里，
  // 而旧文件往往有同样的名字列表，于是包含率被抬高。整条丢弃才符合「丢弃 import 与 re-export 行」。
  const source = [
    "// SPDX-License-Identifier: Apache-2.0",
    "import {",
    "  alpha,",
    "  beta,",
    '} from "./alpha.js";',
    'import type { Gamma } from "./gamma.js";',
    "export type {",
    "  Delta,",
    "  Epsilon,",
    '} from "./types.js";',
    'export * from "./star.js";',
    'export { Zeta } from "./zeta.js";',
    "export const kept = 41;",
    "export function kept2() {",
    "  return kept;",
    "}",
    'const lazy = () => import("./lazy.js");',
    'import("./direct.js").then(() => {});',
  ].join("\n");
  assert.deepEqual(normalizeLines(source), [
    "export const kept = 41;",
    "export function kept2() {",
    "return kept;",
    'const lazy = () => import("./lazy.js");',
    'import("./direct.js").then(() => {});',
  ]);
});

test("多行 import 语句被整条丢弃后，包含率只反映实现行", () => {
  const oldText = [
    "import {",
    "  alpha,",
    "  beta,",
    '} from "./x.js";',
    "const value = alpha + beta;",
    "export { value };",
  ].join("\n");
  const newText = [
    "import {",
    "  alpha,",
    "  beta,",
    '} from "./x.js";',
    "const value = alpha * 2 + beta;",
    "export { value };",
  ].join("\n");
  const lines = normalizeLines(newText);
  assert.deepEqual(lines, ["const value = alpha * 2 + beta;"]);
  assert.equal(containment(lines, normalizeLines(oldText)), 0);
});

test("--explain 辅助：命中行下标与最长连续段位置", () => {
  const candidate = ["a();", "b();", "c();", "d();"];
  const compared = ["x();", "a();", "b();", "c();"];
  assert.deepEqual(
    explainContainment(candidate, compared).map((item) => item.index),
    [0, 1, 2],
  );
  assert.deepEqual(longestRunDetail(candidate, compared), {
    length: 3,
    candidateStart: 0,
    comparedStart: 1,
  });
  assert.equal(longestRun(candidate, compared), 3);
  assert.deepEqual(longestRunDetail(["q();"], ["w();"]), {
    length: 0,
    candidateStart: -1,
    comparedStart: -1,
  });
});
test("声明模式：interface.md 列出的 const 声明块整块剔除，普通模式照常计分", () => {
  const schemaFile = [
    "export const SamplePayloadSchema = z",
    "  .object({",
    "    id: z.string().min(1),",
    "    count: z.number().int(),",
    "  })",
    "  .strict();",
    "export const MAX_SAMPLE_COUNT = 5;",
  ].join("\n");
  withTree(
    {
      "upstream/sample.ts": schemaFile,
      "contract/interface.md": "# interface\n\n- `SamplePayloadSchema`\n- `MAX_SAMPLE_COUNT`\n",
    },
    (root) => {
      const candidate = writeCandidate(root, "sample.ts", schemaFile);
      const normal = runTool(["--upstream-dir", join(root, "upstream"), "--candidate", candidate]);
      assert.equal(normal.status, 1, normal.stdout);
      assert.match(normal.stdout, /declaration=false/);
      // 2026-10-19 起普通模式先按 oxfmt 规范化（objectWrap=collapse）：zod 链收成 4 个代码行。
      assert.match(normal.stdout, /lines=4/);
      assert.match(normal.stdout, /containment=1\.000/);
      const stripped = runTool([
        "--upstream-dir",
        join(root, "upstream"),
        "--candidate",
        candidate,
        "--declaration",
        "--interface",
        join(root, "contract/interface.md"),
      ]);
      assert.equal(stripped.status, 0, stripped.stdout);
      assert.match(stripped.stdout, /declaration=true/);
      assert.match(stripped.stdout, /residual-lines=0/);
      assert.match(stripped.stdout, /stripped-blocks=2/);
    },
  );
});

test("声明模式：名字不在 interface.md 的 const 声明块不被剔除", () => {
  const file = ["export const UnlistedConstant = 1;", "export const OtherValue = 2;"].join("\n");
  withTree(
    {
      "upstream/unlisted.ts": file,
      "contract/interface.md": "# interface\n\n- `SomethingElse`\n",
    },
    (root) => {
      const result = runTool([
        "--upstream-dir",
        join(root, "upstream"),
        "--candidate",
        writeCandidate(root, "unlisted.ts", file),
        "--declaration",
        "--interface",
        join(root, "contract/interface.md"),
      ]);
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stdout, /stripped-blocks=0/);
      assert.match(result.stdout, /residual-lines=2/);
    },
  );
});

test("声明模式：as const 常量表整块剔除且不吞掉后面的实现代码", () => {
  const mixed = [
    "export const REWIND_SCOPES = {",
    '  Conversation: "conversation",',
    '  Workspace: "workspace",',
    "} as const;",
    "export function isScope(value: string): boolean {",
    "  return value.length > 0;",
    "}",
  ].join("\n");
  withTree(
    {
      "upstream/scopes.ts": mixed,
      "contract/interface.md": "# interface\n\n- `REWIND_SCOPES`\n",
    },
    (root) => {
      const result = runTool([
        "--upstream-dir",
        join(root, "upstream"),
        "--candidate",
        writeCandidate(root, "scopes.ts", mixed),
        "--declaration",
        "--interface",
        join(root, "contract/interface.md"),
      ]);
      assert.match(result.stdout, /stripped-blocks=1/);
      assert.match(result.stdout, /residual-lines=2/);
      assert.match(result.stdout, /lines=2/);
    },
  );
});

// ---------------------------------------------------------------------------------------------
// 2026-10-19 防刷：oxfmt 统一格式化 + 行包含率去注释。
// 变换只改空白/换行/注释，token 流保持不变，因此结构相似度也必须逐项不变。
// ---------------------------------------------------------------------------------------------

const TRANSFORM_FIXTURE = [
  "export function computeTotal(values: number[]): number {",
  "  let total = 0;",
  "  for (const value of values) {",
  "    if (value > 0) {",
  "      total += value;",
  "    }",
  "  }",
  "  return total;",
  "}",
  "",
  "const settings = {",
  "  alpha: 1,",
  "  beta: 2,",
  "  gamma: 3,",
  "};",
  "",
  'export const label = String(settings.alpha).trim() + "!";',
  "export const first = settings.alpha;",
  "export const sum = settings.alpha + settings.beta;",
  'export const result = run(first, sum, "done");',
  "",
].join("\n");

const TRANSFORM_COMPRESSED = TRANSFORM_FIXTURE.split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .join(" ");

const TRANSFORM_SPLIT = [
  "export function computeTotal(values: number[]): number {",
  "  let total = 0;",
  "  for (const value of values) {",
  "    if (value > 0) {",
  "      total +=",
  "        value;",
  "    }",
  "  }",
  "  return total;",
  "}",
  "",
  "const settings = {",
  "  alpha: 1,",
  "  beta: 2,",
  "  gamma: 3,",
  "};",
  "",
  "export const label =",
  "  String(settings.alpha).trim() +",
  '  "!";',
  "export const first = settings.alpha;",
  "export const sum =",
  "  settings.alpha +",
  "  settings.beta;",
  "export const result = run(",
  "  first,",
  "  sum,",
  '  "done",',
  ");",
  "",
].join("\n");

const TRANSFORM_COMMENTED = [
  "/**",
  " * 计算正数总和。",
  " */",
  "export function computeTotal(values: number[]): number {",
  "  let total = 0; // 累计值",
  "  for (const value of values) {",
  "    if (value > 0) { /* 只累加正数 */",
  "      total += value;",
  "    }",
  "  }",
  "  return total;",
  "}",
  "",
  "const settings = {",
  "  alpha: 1, // 第一项",
  "  beta: 2,",
  "  gamma: 3,",
  "};",
  "",
  'export const label = String(settings.alpha).trim() + "!"; // 标签',
  "export const first = settings.alpha;",
  "export const sum = settings.alpha + settings.beta;",
  'export const result = run(first, sum, "done");',
  "// 文件结束",
  "",
].join("\n");

test("压行、拆行、增删注释前后，包含率与最长段逐项不变", async () => {
  const base = await gateLines({ fileName: "transform.ts", text: TRANSFORM_FIXTURE });
  assert.equal(base.formatted, true);
  assert.ok(base.lines.length >= 10);
  const baseRun = longestRun(base.lines, base.lines);
  assert.equal(containment(base.lines, base.lines), 1);
  assert.equal(baseRun, base.lines.length);
  for (const [name, text] of [
    ["压行", TRANSFORM_COMPRESSED],
    ["拆行", TRANSFORM_SPLIT],
    ["增删注释", TRANSFORM_COMMENTED],
  ]) {
    const variant = await gateLines({ fileName: "transform.ts", text });
    assert.equal(variant.formatted, true, name);
    assert.deepEqual(variant.lines, base.lines, `${name}：代码行必须逐行一致`);
    assert.equal(containment(variant.lines, base.lines), 1, `${name}：包含率`);
    assert.equal(longestRun(variant.lines, base.lines), baseRun, `${name}：最长段`);
  }
});

test("压行、拆行、增删注释前后，结构相似度逐项不变", async () => {
  const base = structuralFingerprints(structuralTokens("transform.ts", TRANSFORM_FIXTURE));
  for (const [name, text] of [
    ["压行", TRANSFORM_COMPRESSED],
    ["拆行", TRANSFORM_SPLIT],
    ["增删注释", TRANSFORM_COMMENTED],
  ]) {
    const variant = structuralFingerprints(structuralTokens("transform.ts", text));
    assert.equal(structuralOverlap(variant, base), 1, `${name}：结构相似度`);
    assert.deepEqual([...variant].sort(), [...base].sort(), `${name}：结构指纹`);
  }
});

test("注释文字改动不影响门禁行结果", async () => {
  const rewritten = TRANSFORM_COMMENTED.replaceAll("累计值", "换成另一段完全不同的说明")
    .replaceAll("只累加正数", "另一条注释正文")
    .replaceAll("计算正数总和", "另一个 JSDoc 标题");
  const left = await gateLines({ fileName: "transform.ts", text: TRANSFORM_COMMENTED });
  const right = await gateLines({ fileName: "transform.ts", text: rewritten });
  assert.deepEqual(right.lines, left.lines);
  assert.equal(containment(right.lines, left.lines), 1);
  assert.equal(longestRun(right.lines, left.lines), left.lines.length);
});

test("字符串、模板与正则里的 // 不算注释", async () => {
  const result = await gateLines({
    fileName: "slash.ts",
    text: [
      'const url = "https://example.com//path"; // 行尾注释',
      "const template = `https://example.com/${id}//tail`;",
      "const pattern = /[/][/]/;",
      "const ratio = first / second / third;",
    ].join("\n"),
  });
  assert.deepEqual(result.lines, [
    'const url = "https://example.com//path";',
    "const template = `https://example.com/${id}//tail`;",
    "const pattern = /[/][/]/;",
    "const ratio = first / second / third;",
  ]);
});

test("压行样例相对逐行相同的旧文件判不过（旧工具可被稀释到门槛以下）", () => {
  const copied = Array.from(
    { length: 16 },
    (_, index) => `export const sample${index} = compute(${index}) + ${index * 2};`,
  );
  withTree(
    { "repo/legacy/copied.ts": copied.join("\n"), "upstream/unrelated.ts": upstreamLines(30) },
    (root) => {
      const compressed = runTool([
        "--repo",
        join(root, "repo"),
        "--upstream-dir",
        join(root, "upstream"),
        "--gates",
        "line",
        "--old",
        "legacy/copied.ts",
        "--candidate",
        writeCandidate(
          root,
          "compressed.ts",
          `${copied.join(" ")}\n${fillerLines("compressed", 9)}`,
        ),
      ]);
      // 16 行被压成 1 行后格式化会还原：16/25 = 0.640，最长段 16。
      assert.equal(compressed.status, 1, compressed.stdout);
      assert.match(compressed.stdout, /lines=25/);
      assert.match(compressed.stdout, /containment=0\.640/);
      assert.match(compressed.stdout, /run=16/);
    },
  );
});

test("凑注释稀释分母判不过（注释不计入分子分母，连续段也不被打断）", () => {
  const copied = Array.from(
    { length: 16 },
    (_, index) => `export const sample${index} = compute(${index}) + ${index * 2};`,
  );
  const padded = copied
    .flatMap((line, index) =>
      Array.from({ length: 5 }, (_, offset) => `// padding ${index}.${offset}`).concat(line),
    )
    .join("\n");
  withTree(
    { "repo/legacy/copied.ts": copied.join("\n"), "upstream/unrelated.ts": upstreamLines(30) },
    (root) => {
      const result = runTool([
        "--repo",
        join(root, "repo"),
        "--upstream-dir",
        join(root, "upstream"),
        "--gates",
        "line",
        "--old",
        "legacy/copied.ts",
        "--candidate",
        writeCandidate(root, "padded.ts", padded),
      ]);
      assert.equal(result.status, 1, result.stdout);
      assert.match(result.stdout, /lines=16/);
      assert.match(result.stdout, /containment=1\.000/);
      assert.match(result.stdout, /run=16/);
    },
  );
});

test("格式化失败时回退原文并在报告里标注", () => {
  withTree({ "upstream/a.ts": upstreamLines(30) }, (root) => {
    const json = join(root, "report.json");
    const broken = writeCandidate(root, "broken.ts", "const broken = ;;; {{{\n");
    const result = runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--candidate",
      broken,
      "--json",
      json,
    ]);
    assert.match(result.stdout, /format=fallback/);
    const report = JSON.parse(readFileSync(json, "utf8"));
    assert.equal(report.candidates[0].formatted, false);
    assert.match(report.candidates[0].formatError, /Unexpected token/);
    // 不支持的扩展名同样回退原文，但不算语法错误。
    const text = writeCandidate(root, "notes.txt", "plain    text\n");
    const unsupportedJson = join(root, "unsupported.json");
    runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--candidate",
      text,
      "--json",
      unsupportedJson,
    ]);
    const unsupported = JSON.parse(readFileSync(unsupportedJson, "utf8"));
    assert.equal(unsupported.candidates[0].formatted, false);
    assert.match(unsupported.candidates[0].formatError, /Unsupported file type/);
  });
});

test("门禁使用仓库 .oxfmtrc.json 的格式化选项（忽略 $schema 与 ignorePatterns）", async () => {
  await withTreeAsync(
    {
      ".oxfmtrc.json": JSON.stringify({
        $schema: "./node_modules/oxfmt/configuration_schema.json",
        ignorePatterns: ["**/*.ts"],
        semi: false,
      }),
    },
    async (root) => {
      const options = loadOxfmtOptions(root);
      assert.deepEqual(options, { semi: false });
      const result = await gateLines({
        fileName: join(root, "sample.ts"),
        text: "const value = 1;\n",
        oxfmtOptions: options,
      });
      assert.deepEqual(result.lines, ["const value = 1"]);
    },
  );
});

test("反刷分：搬家+再导出桩必须 FAIL（追到搬迁实现后对旧文件计分）", () => {
  const oldBody = [
    "// SPDX-License-Identifier: Apache-2.0",
    ...Array.from(
      { length: 20 },
      (_, i) => `export function movedSymbol${i}(x: number): number { return x + ${i}; }`,
    ),
  ].join("\n");
  withTree(
    {
      "upstream/keep.ts": "export const keep = 1;\n",
      "repo/packages/shared/src/mcp.ts": 'export { movedSymbol0 } from "./internal/mcp-impl.js";\n',
      "repo/packages/shared/src/internal/mcp-impl.ts": oldBody,
      "repo/old/mcp.ts": oldBody,
    },
    (root) => {
      const result = runTool([
        "--repo",
        join(root, "repo"),
        "--upstream-dir",
        join(root, "upstream"),
        "--gates",
        "line",
        "--candidate",
        "packages/shared/src/mcp.ts",
        "--old",
        "old/mcp.ts",
      ]);
      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stdout, /FAIL/);
      assert.match(result.stdout, /traced-from=packages\/shared\/src\/internal\/mcp-impl\.ts/);
      assert.match(result.stdout, /containment=1\.000|containment=0\.[89]/);
    },
  );
});

test("反刷分：多级再导出追踪到叶子实现", () => {
  const impl = [
    "// SPDX-License-Identifier: Apache-2.0",
    ...Array.from({ length: 15 }, (_, i) => `export const leafValue${i} = ${i};`),
  ].join("\n");
  withTree(
    {
      "upstream/keep.ts": "export const keep = 1;\n",
      "repo/a.ts": 'export * from "./b.js";\n',
      "repo/b.ts": 'export * from "./c.js";\n',
      "repo/c.ts": impl,
      "repo/old.ts": impl,
    },
    (root) => {
      const result = runTool([
        "--repo",
        join(root, "repo"),
        "--upstream-dir",
        join(root, "upstream"),
        "--gates",
        "line",
        "--candidate",
        "a.ts",
        "--old",
        "old.ts",
      ]);
      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stdout, /traced-from=c\.ts/);
    },
  );
});

test("反刷分：外部包再导出无法展开则 FAIL", () => {
  withTree(
    {
      "upstream/keep.ts": "export const keep = 1;\n",
      "repo/shim.ts": 'export { something } from "external-package";\n',
    },
    (root) => {
      const result = runTool([
        "--repo",
        join(root, "repo"),
        "--upstream-dir",
        join(root, "upstream"),
        "--gates",
        "line",
        "--candidate",
        "shim.ts",
      ]);
      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stdout, /FAIL/);
      assert.match(result.stdout, /pure-reexport-unresolved|外部包/);
    },
  );
});

test("反刷分：正常就地重写仍 PASS", () => {
  const oldBody = Array.from(
    { length: 16 },
    (_, i) => `export function oldFn${i}(n: number): number {\n  return n + ${i};\n}`,
  ).join("\n");
  const newBody = Array.from(
    { length: 16 },
    (_, i) =>
      `export function rewritten${i}(value: number): number {\n  const base = value;\n  return base * ${i + 1};\n}`,
  ).join("\n");
  withTree(
    {
      "upstream/keep.ts": "export const keep = 1;\n",
      "repo/target.ts": newBody,
      "repo/old.ts": oldBody,
    },
    (root) => {
      const result = runTool([
        "--repo",
        join(root, "repo"),
        "--upstream-dir",
        join(root, "upstream"),
        "--gates",
        "line",
        "--candidate",
        "target.ts",
        "--old",
        "old.ts",
      ]);
      assert.equal(result.status, 0, result.stdout);
      assert.match(result.stdout, /PASS/);
      assert.doesNotMatch(result.stdout, /traced-from=/);
    },
  );
});

test("反刷分：新增文件照抄同目录旧文件必须 FAIL（--old-rev 兜底）", () => {
  const body = [
    "// SPDX-License-Identifier: Apache-2.0",
    ...Array.from(
      { length: 18 },
      (_, i) => `export function copied${i}(): number { return ${i}; }`,
    ),
  ].join("\n");
  withTree(
    {
      "upstream/keep.ts": "export const keep = 1;\n",
      "repo/packages/x/original.ts": body,
      "repo/packages/x/moved.ts": body,
    },
    (root) => {
      const repo = join(root, "repo");
      execFileSync("git", ["-C", repo, "init", "-q"]);
      execFileSync("git", ["-C", repo, "config", "user.email", "t@t"]);
      execFileSync("git", ["-C", repo, "config", "user.name", "t"]);
      execFileSync("git", ["-C", repo, "add", "packages/x/original.ts"]);
      execFileSync("git", ["-C", repo, "commit", "-qm", "base"]);
      // moved.ts 仅在工作区，不在 base 提交
      const result = runTool([
        "--repo",
        repo,
        "--upstream-dir",
        join(root, "upstream"),
        "--gates",
        "line",
        "--candidate",
        "packages/x/moved.ts",
        "--old",
        "packages/x/moved.ts",
        "--old-rev",
        "HEAD",
      ]);
      // --old 指向新路径在 HEAD 不存在；兜底与同目录 original.ts 比对后必须 FAIL
      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stdout, /FAIL/);
    },
  );
});

test("反刷分：桶文件多目标分别展开后取最大相似度", () => {
  const leafA = [
    "// SPDX-License-Identifier: Apache-2.0",
    ...Array.from({ length: 14 }, (_, i) => `export const a${i} = ${i};`),
  ].join("\n");
  const leafB = Array.from({ length: 14 }, (_, i) => `export const uniqueB${i} = ${i * 3};`).join(
    "\n",
  );
  withTree(
    {
      "upstream/keep.ts": "export const keep = 1;\n",
      "repo/index.ts": 'export * from "./a.js";\nexport * from "./b.js";\n',
      "repo/a.ts": leafA,
      "repo/b.ts": leafB,
      "repo/old.ts": leafA,
    },
    (root) => {
      const result = runTool([
        "--repo",
        join(root, "repo"),
        "--upstream-dir",
        join(root, "upstream"),
        "--gates",
        "line",
        "--candidate",
        "index.ts",
        "--old",
        "old.ts",
      ]);
      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stdout, /traced-from=/);
      assert.match(result.stdout, /a\.ts/);
    },
  );
});

test("packed-literal-split：字面量与模板字面量直接 split 空白必须 FAIL（独立 gate）", () => {
  withTree({ "upstream/keep.ts": "export const keep = 1;\n" }, (root) => {
    const candidate = writeCandidate(
      root,
      "literal-split.ts",
      [
        "export function words(): readonly string[] {",
        '  return "alpha beta gamma".split(" ");',
        "}",
        "export function tags(): readonly string[] {",
        "  return `delta epsilon zeta`.split(/\\s+/u);",
        "}",
      ].join("\n"),
    );
    const json = join(root, "report.json");
    const result = runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--gates",
      "line",
      "--candidate",
      candidate,
      "--json",
      json,
    ]);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /FAIL/);
    assert.match(result.stdout, /-> packed-literal-split/);
    const report = JSON.parse(readFileSync(json, "utf8"));
    assert.ok(report.candidates[0].packedLiteralSplits.length >= 2);
  });
});

test("packed-literal-split：const 字面量、字面量数组与 join 结果再 split 必须 FAIL", () => {
  withTree({ "upstream/keep.ts": "export const keep = 1;\n" }, (root) => {
    const candidate = writeCandidate(
      root,
      "bound-split.ts",
      [
        'const WORD_PACK = "alpha beta gamma";',
        'const GROUP_PACK = ["delta epsilon", "zeta eta"];',
        'const JOINED_PACK = ["theta", "iota"].join(" ");',
        'export function words(): readonly string[] { return WORD_PACK.split(" "); }',
        "export function groups(): readonly string[] {",
        "  return GROUP_PACK.flatMap((item) => item.split(/\\s+/u));",
        "}",
        'export function joined(): readonly string[] { return JOINED_PACK.split(" "); }',
      ].join("\n"),
    );
    const json = join(root, "report.json");
    const result = runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--gates",
      "line",
      "--candidate",
      candidate,
      "--json",
      json,
    ]);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /packed-literal-split/);
    const report = JSON.parse(readFileSync(json, "utf8"));
    assert.ok(report.candidates[0].packedLiteralSplits.length >= 3);
  });
});

test("packed-literal-split：包装助手以字符串字面量实参调用必须 FAIL", () => {
  withTree({ "upstream/keep.ts": "export const keep = 1;\n" }, (root) => {
    const candidate = writeCandidate(
      root,
      "helper-split.ts",
      [
        "function enumWords(source: string): readonly string[] {",
        "  return source.split(/\\s+/u);",
        "}",
        "export function labels(): readonly string[] {",
        '  return enumWords("alpha beta gamma");',
        "}",
      ].join("\n"),
    );
    const result = runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--gates",
      "structural",
      "--candidate",
      candidate,
    ]);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /FAIL/);
    assert.match(result.stdout, /packed-literal-split/);
  });
});

test("packed-literal-split：运行时数据（git/ps 行、文件输出、用户输入）不得误报", () => {
  withTree({ "upstream/keep.ts": "export const keep = 1;\n" }, (root) => {
    const candidate = writeCandidate(
      root,
      "runtime-split.ts",
      [
        'import { readFileSync } from "node:fs";',
        'const STATUS = readFileSync("/proc/self/status", "utf8");',
        "function splitWords(source: string): string[] {",
        '  return source.split(" ");',
        "}",
        "export function statusFields(): string[] {",
        "  return STATUS.split(/\\s+/u);",
        "}",
        "export function gitRows(output: string): string[][] {",
        "  return output",
        "    .split(/\\r?\\n/u)",
        "    .map((row) => row.trim().split(/\\s+/u));",
        "}",
        "export function userWords(query: string): string[] {",
        "  return splitWords(query);",
        "}",
        'const CSV = "alpha,beta,gamma";',
        'export function csv(): string[] { return CSV.split(","); }',
      ].join("\n"),
    );
    const result = runTool([
      "--upstream-dir",
      join(root, "upstream"),
      "--gates",
      "line",
      "--candidate",
      candidate,
    ]);
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /PASS/);
    assert.doesNotMatch(result.stdout, /packed-literal-split/);
  });
});
