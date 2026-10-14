// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 golden 语料 · artifacts 族（从 corpus.mjs 按族拆出，oxlint max-lines）。
// 每条 add(id, expect, script)：expect "clean" = 旧实现 ok 为真且零诊断，"diagnostics" = ok 为假。

const lines = (...items) => items.join("\n");

export const samples = [];
function add(id, expect, script) {
  samples.push({ id: `artifacts/${id}`, script, expect });
}

add(
  "report-untagged",
  "clean",
  'const a = agent("a"); const r = await a.ask("x"); report({ finding: r }); return r;',
);
add(
  "report-tagged-chart",
  "clean",
  'artifact.chart("perf", { x: { field: "n" }, y: { field: "ms" } }); for (let n = 0; n < 2; n++) { report({ n, ms: n * 10 }, "perf"); } return "done";',
);
add(
  "table-with-key",
  "clean",
  'artifact.table("rows", { columns: [{ field: "name" }, { field: "score" }], key: "name" }); report({ name: "a", score: 1 }, "rows"); return "done";',
);
add(
  "metrics-tiles",
  "clean",
  'artifact.metrics("tiles", { metrics: [{ field: "count", label: "Count" }] }); report({ count: 3 }, "tiles"); return "done";',
);
add(
  "board-columns",
  "clean",
  'artifact.board("kanban", { key: "id", status: "column", columns: ["todo", "done"] }); report({ id: "t1", column: "todo" }, "kanban"); return "done";',
);
add(
  "markdown-publish",
  "clean",
  'const ref = await artifact.markdown("summary", "# Title\\n\\nbody"); return ref.version;',
);
add(
  "file-publish",
  "clean",
  'const ref = await artifact.file("report", "out/report.html"); return ref.version;',
);
add(
  "file-in-try",
  "clean",
  'try { const ref = await artifact.file("report", "out/report.html"); return ref.version; } catch { return await agent("a").ask("write it yourself"); }',
);
add(
  "primary-markdown",
  "clean",
  'const ref = await artifact.markdown("deliverable", "long form", { primary: true }); return ref.id;',
);
add(
  "duplicate-id-same-spec",
  "clean",
  'artifact.metrics("m", { metrics: [{ field: "n" }] }); artifact.metrics("m", { metrics: [{ field: "n" }] }); report({ n: 1 }, "m"); return "done";',
);
add("report-tag-unknown", "diagnostics", 'report({ n: 1 }, "missing-preset"); return "done";');
add(
  "id-non-literal",
  "diagnostics",
  'const id = "dyn"; artifact.metrics(id, { metrics: [{ field: "n" }] }); return "done";',
);
add(
  "primary-conflict",
  "diagnostics",
  'artifact.metrics("m", { metrics: [{ field: "n" }], primary: true }); artifact.table("t", { columns: [{ field: "c" }], primary: true }); return "done";',
);
add(
  "declaration-in-loop",
  "diagnostics",
  'for (let i = 0; i < 2; i++) { artifact.metrics("m" + i, { metrics: [{ field: "n" }] }); } return "done";',
);
add(
  "id-too-long",
  "diagnostics",
  `artifact.metrics("${"x".repeat(65)}", { metrics: [{ field: "n" }] }); return "done";`,
);
add(
  "report-before-declare",
  "clean",
  'report({ n: 1 }, "late"); artifact.metrics("late", { metrics: [{ field: "n" }] }); return "done";',
);
add(
  "many-ids",
  "clean",
  lines(
    'artifact.metrics("m1", { metrics: [{ field: "a" }] });',
    'artifact.chart("c1", { x: { field: "x" }, y: { field: "y" } });',
    'artifact.table("t1", { columns: [{ field: "c" }] });',
    'artifact.board("b1", { key: "id", status: "s", columns: ["todo"] });',
    'report({ a: 1, x: 1, y: 2, c: "v", id: "t", s: "todo" });',
    'return "done";',
  ),
);
add(
  "chart-baseline-log",
  "clean",
  'artifact.chart("perf", { x: { field: "n" }, y: { field: "ms" }, scale: "log", baseline: { field: "budget" } }); report({ n: 1, ms: 10, budget: 8 }, "perf"); return "done";',
);
add(
  "chart-scatter-type",
  "clean",
  'artifact.chart("scatter", { type: "scatter", x: { field: "x" }, y: { field: "y" } }); report({ x: 1, y: 2 }, "scatter"); return "done";',
);
add(
  "table-key-replace",
  "clean",
  'artifact.table("t", { columns: [{ field: "k" }, { field: "v" }], key: "k" }); report({ k: "a", v: 1 }, "t"); report({ k: "a", v: 2 }, "t"); return "done";',
);
add(
  "table-append-only",
  "clean",
  'artifact.table("rows", { columns: [{ field: "name" }] }); report({ name: "a" }, "rows"); report({ name: "b" }, "rows"); return "done";',
);
add(
  "metrics-two-tiles",
  "clean",
  'artifact.metrics("tiles", { metrics: [{ field: "count", label: "Count" }, { field: "size", label: "Size", unit: "KB" }] }); report({ count: 3, size: 12 }, "tiles"); return "done";',
);
add(
  "board-cardtitle-detail",
  "clean",
  'artifact.board("b", { key: "id", status: "s", columns: ["todo"], cardTitle: "title", detail: [{ field: "n", label: "N" }] }); report({ id: "1", s: "todo", title: "T", n: 1 }, "b"); return "done";',
);
add(
  "markdown-primary-last",
  "clean",
  'artifact.table("t", { columns: [{ field: "c" }] }); const ref = await artifact.markdown("doc", "body", { primary: true }); return ref.version;',
);
add(
  "report-dot-path",
  "clean",
  'artifact.metrics("m", { metrics: [{ field: "timing.after", label: "After" }] }); report({ timing: { after: 3 } }, "m"); return "done";',
);
add(
  "publish-in-helper",
  "clean",
  'async function publish() { const ref = await artifact.markdown("doc", "body"); return ref.version; } return await publish();',
);
add(
  "file-and-md-two-primary",
  "diagnostics",
  'const f = await artifact.file("out", "out.html", { primary: true }); const m = await artifact.markdown("doc", "body", { primary: true }); return f.version + m.version;',
);
