// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTriage,
  classifyReturnReason,
  displayWidth,
  parseReturns,
  renderMarkdown,
  renderTable,
  summarize,
  triageRecords,
} from "./inherited-triage.mjs";

const SAMPLE_REPORT = [
  "## 5. 交还清单",
  "",
  "### 阶段 B（4 条）",
  "",
  "| 路径 | 阶段 | 原因 |",
  "| --- | --- | --- |",
  "| `docs/evidence/agent-runtime-author-20261003/api.d.ts` | B | 相似度 0.78（最相似 apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts），最长连续段 37 行，超过 0.2 / 8 行阈值 |",
  "| `packages/services/src/session/sessionStore.ts` | B | 首快照文件（首次加入即 7619e41）；相似度 0.31（最相似 packages/services/src/session/store.ts），最长连续段 9 行，超过 0.2 / 8 行阈值 |",
  "| `docs/knorvia-stage0-acceptance.md` | B | 首快照文件（首次加入即 7619e41） |",
  "| `apps/cli/packages/adapters/src/config/owners.test.mjs` | B | 首次加入提交含替换字样：reimplement |",
].join("\n");

test("parseReturns reads path, stage and reason from the return tables", () => {
  const records = parseReturns(SAMPLE_REPORT);
  assert.equal(records.length, 4);
  assert.deepEqual(records[0], {
    path: "docs/evidence/agent-runtime-author-20261003/api.d.ts",
    stage: "B",
    reason:
      "相似度 0.78（最相似 apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts），最长连续段 37 行，超过 0.2 / 8 行阈值",
    category: "similarity",
  });
});

test("parseReturns tolerates CRLF line endings", () => {
  const records = parseReturns(SAMPLE_REPORT.replace(/\n/g, "\r\n"));
  assert.equal(records.length, 4);
  assert.equal(records[1].category, "first-snapshot");
});

test("classifyReturnReason buckets the documented round-1 reasons", () => {
  assert.equal(classifyReturnReason("首快照文件（首次加入即 7619e41）"), "first-snapshot");
  assert.equal(classifyReturnReason("相似度 0.78（最相似 a.ts）"), "similarity");
  assert.equal(classifyReturnReason("首次加入提交含替换字样：independent"), "replacement-wording");
  assert.equal(
    classifyReturnReason("许可无法判定：正文只声明 public domain"),
    "license-undecidable",
  );
  assert.equal(classifyReturnReason("正文没有许可声明（只有联系人地址）"), "license-missing-claim");
  assert.equal(classifyReturnReason("无法确认首次加入提交"), "other");
});

test("M0-3 scope is exactly the first-snapshot and similarity returns", () => {
  const result = buildTriage({ text: SAMPLE_REPORT });
  assert.equal(result.report.returns, 4);
  assert.equal(result.rows.length, 3);
  assert.equal(result.report.byCategory["first-snapshot"], 2);
  assert.equal(result.report.byCategory.similarity, 1);
  assert.equal(result.report.byCategory["replacement-wording"], 1);
});

test("frozen evidence excerpts are written exceptions, product source joins a package", () => {
  const { rows } = triageRecords(
    parseReturns(SAMPLE_REPORT).filter((r) => r.category !== "replacement-wording"),
  );
  const byPath = new Map(rows.map((row) => [row.path, row]));
  const evidence = byPath.get("docs/evidence/agent-runtime-author-20261003/api.d.ts");
  assert.equal(evidence.disposition, "exception");
  assert.equal(evidence.clause, "冻结证据包中的上游摘录");
  const service = byPath.get("packages/services/src/session/sessionStore.ts");
  assert.equal(service.disposition, "inherited");
  assert.equal(service.pkg, "services-03");
  const doc = byPath.get("docs/knorvia-stage0-acceptance.md");
  assert.equal(doc.disposition, "doc-rewrite");
});

test("rule order keeps license prose on nature review instead of the document rule", () => {
  const { rows } = triageRecords([
    {
      path: "licensing/MIT.txt",
      stage: "C",
      reason: "首快照文件（首次加入即 7619e41）",
      category: "first-snapshot",
    },
    {
      path: "docs/knorvia-icon-provenance.md",
      stage: "C",
      reason: "相似度 0.30（最相似 docs/a.md）",
      category: "similarity",
    },
  ]);
  const byPath = new Map(rows.map((row) => [row.path, row]));
  assert.equal(byPath.get("licensing/MIT.txt").disposition, "nature-review");
  assert.equal(byPath.get("docs/knorvia-icon-provenance.md").disposition, "doc-rewrite");
});

test("development tools documented as deletions are marked delete", () => {
  const { rows } = triageRecords([
    {
      path: "packages/formal-proof/src/checker.ts",
      stage: "B",
      reason: "相似度 0.40（最相似 a.ts）",
      category: "similarity",
    },
    {
      path: "apps/cli/packages/dynamic-workflow/scratch/bench.mjs",
      stage: "B",
      reason: "首快照文件（首次加入即 7619e41）",
      category: "first-snapshot",
    },
  ]);
  assert.deepEqual(
    rows.map((row) => [row.path, row.disposition]),
    [
      ["apps/cli/packages/dynamic-workflow/scratch/bench.mjs", "delete"],
      ["packages/formal-proof/src/checker.ts", "delete"],
    ],
  );
});

test("unmapped paths are reported instead of being silently dropped", () => {
  const { rows, unmapped } = triageRecords([
    {
      path: "unknown-root/file.ts",
      stage: "B",
      reason: "相似度 0.5（最相似 x.ts）",
      category: "similarity",
    },
  ]);
  assert.equal(rows.length, 0);
  assert.deepEqual(unmapped, ["unknown-root/file.ts"]);
});

test("summarize counts dispositions and packages", () => {
  const { rows } = triageRecords([
    { path: "packages/ui/src/a.tsx", stage: "B", reason: "相似度 0.5", category: "similarity" },
    { path: "packages/ui/src/b.tsx", stage: "B", reason: "相似度 0.5", category: "similarity" },
    { path: "docs/evidence/x/api.d.ts", stage: "B", reason: "相似度 0.6", category: "similarity" },
  ]);
  const { byDisposition, byPackage } = summarize(rows);
  assert.equal(byDisposition.inherited, 2);
  assert.equal(byDisposition.exception, 1);
  assert.equal(
    Object.values(byPackage).reduce((sum, value) => sum + value, 0),
    2,
  );
});

test("supplement covers same-class reasons without touching the 1,547 scope", () => {
  const text = [
    ...SAMPLE_REPORT.split("\n"),
    "| `docs/evidence/x/note.md` | C | 规范化行数 < 10（9 行）但包含率 0.22 不为 0 |",
    "| `packages/shared/src/x.ts` | C | 找不到首次加入提交 |",
  ].join("\n");
  const result = buildTriage({ text });
  assert.equal(result.rows.length, 3);
  assert.equal(result.supplement.count, 2);
});

test("displayWidth counts CJK and full-width punctuation as two columns", () => {
  assert.equal(displayWidth("abc"), 3);
  assert.equal(displayWidth("首快照"), 6);
  assert.equal(displayWidth("（条件 4）"), 10);
  assert.equal(displayWidth("≥"), 1);
});

test("renderTable pads every column to the widest cell so pnpm fmt leaves it unchanged", () => {
  const table = renderTable(["处置", "文件数"], [["`inherited`", "902"]]);
  const lines = table.split("\n").filter((line) => line.length > 0);
  assert.equal(lines.length, 3);
  const widths = lines.map((line) => displayWidth(line));
  assert.deepEqual(widths, [widths[0], widths[0], widths[0]]);
  assert.match(lines[0], /^\| 处置\s+\| 文件数 \|$/);
});

test("renderMarkdown emits every row with its disposition and package", () => {
  const result = buildTriage({ text: SAMPLE_REPORT });
  const md = renderMarkdown(result, { date: "2026-10-11", commit: "6ea4cbe7", issue: "97" });
  assert.match(md, /# Knorvia 继承文件分诊表（M0-3）/);
  const row = md
    .split("\n")
    .find((line) => line.includes("`packages/services/src/session/sessionStore.ts`"));
  assert.ok(row, "expected the session store row");
  assert.deepEqual(
    row
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim()),
    ["`packages/services/src/session/sessionStore.ts`", "首快照", "inherited", "services-03"],
  );
  assert.match(md, /两类合计 \*\*3\*\* 个文件/);
  const tableLines = md.split("\n").filter((line) => line.startsWith("|"));
  for (const line of tableLines) {
    assert.equal(line.endsWith(" |"), true, `unterminated table line: ${line}`);
  }
});
