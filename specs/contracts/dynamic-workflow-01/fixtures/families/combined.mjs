// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 golden 语料 · combined 族（从 corpus.mjs 按族拆出，oxlint max-lines）。
// 每条 add(id, expect, script)：expect "clean" = 旧实现 ok 为真且零诊断，"diagnostics" = ok 为假。

const lines = (...items) => items.join("\n");

export const samples = [];
function add(id, expect, script) {
  samples.push({ id: `combined/${id}`, script, expect });
}

add(
  "review-pipeline",
  "clean",
  lines(
    'const filesList = await files.glob("src/**/*.ts");',
    'phase("Review each changed file in parallel");',
    "const reviews = await Promise.all(filesList.map(async (f) => {",
    "  const body = await files.read(f);",
    '  return await agent("reviewer-" + f).ask("Review " + f + ":\\n" + body);',
    "}));",
    'phase("Summarize the findings");',
    'const summary = await agent("summarizer").ask(reviews.join("\\n---\\n"));',
    'const ref = await artifact.markdown("review", summary, { primary: true });',
    "return { version: ref.version, count: reviews.length };",
  ),
);
add(
  "release-gate",
  "clean",
  lines(
    'phase("Run the release checks");',
    "const results: { cmd: string; code: number }[] = [];",
    'const nodeCheck = await world.run("node", ["--version"]);',
    'results.push({ cmd: "node", code: nodeCheck.exitCode });',
    'const gitCheck = await world.run("git", ["status"]);',
    'results.push({ cmd: "git", code: gitCheck.exitCode });',
    'phase("Decide with a reviewer");',
    'const verdict = await agent("gatekeeper").ask("Approve release? " + JSON.stringify(results));',
    'artifact.table("checks", { columns: [{ field: "cmd" }, { field: "code" }], key: "cmd" });',
    'for (const row of results) { report(row, "checks"); }',
    "return verdict;",
  ),
);
add(
  "docs-cleanup",
  "clean",
  lines(
    'const docs = await files.glob("docs/**/*.md");',
    'phase("Inventory the stale documents");',
    'const inventories = await Promise.all(docs.map(async (d) => await agent("curator-" + d).ask("Inventory " + d)));',
    'phase("Confirm the deletion list");',
    'const approved = await agent("approver").ask(inventories.join("\\n"));',
    "return { candidates: docs.length, approved };",
  ),
);
add(
  "content-pack",
  "clean",
  lines(
    'phase("Draft the copy");',
    'const topic = String(args.topic ?? "release notes");',
    'const draft = await agent("writer").ask("Draft copy about " + topic);',
    'phase("Assemble the pack");',
    'const metrics = await world.run("node", ["-e", "console.log(42)"]);',
    'artifact.metrics("stats", { metrics: [{ field: "lines" }] });',
    'report({ lines: draft.split("\\n").length, exit: metrics.exitCode }, "stats");',
    'const ref = await artifact.markdown("pack-doc", draft, { primary: true });',
    "return { id: ref.id, version: ref.version };",
  ),
);
add(
  "triage-with-branches",
  "clean",
  lines(
    "const status = await git.status();",
    'phase("Triage the working tree");',
    'const a = agent("triager");',
    "if (status.clean) {",
    '  return await a.ask("Working tree is clean; summarize recent commits");',
    "}",
    "const changed = await git.changedFiles();",
    "if (changed.length > 10) {",
    '  return await a.ask("Too many changes: " + changed.length);',
    "}",
    'return await a.ask("Review: " + changed.join(", "));',
  ),
);
add(
  "loop-until-green",
  "clean",
  lines(
    'const a = agent("fixer");',
    "let attempt = 0;",
    'let last = "";',
    'phase("Iterate until the check passes");',
    "while (attempt < 3) {",
    '  const run = await world.run("node", ["--version"]);',
    "  last = run.stdout;",
    "  if (run.exitCode === 0) break;",
    '  last = await a.ask("Fix attempt " + attempt);',
    "  attempt += 1;",
    "}",
    "return { attempt, last };",
  ),
);
add(
  "deep-nesting",
  "clean",
  lines(
    "const out: string[] = [];",
    'phase("Nested review rounds");',
    "for (let round = 0; round < 2; round++) {",
    '  const targets = ["a", "b"];',
    "  const roundResults = await Promise.all(targets.map(async (t) => {",
    '    const text = await files.read(t + ".md");',
    '    if (text.length === 0) return "empty:" + t;',
    "    return await agent(`round${round}-${t}`).ask(text);",
    "  }));",
    "  out.push(...roundResults);",
    "}",
    "return out;",
  ),
);
add(
  "full-pipeline",
  "clean",
  lines(
    'const names = await files.glob("src/**/*.ts");',
    'phase("Review every file in parallel");',
    "const reviews = await Promise.all(names.map(async (f) => {",
    '  return await agent("reviewer-" + f).ask("Review " + f);',
    "}));",
    'phase("Run the release check");',
    'const check = await world.run("node", ["--version"]);',
    'phase("Publish the deliverable");',
    'artifact.metrics("stats", { metrics: [{ field: "files" }] });',
    'report({ files: reviews.length }, "stats");',
    'const ref = await artifact.markdown("report", reviews.join("\\n"), { primary: true });',
    "return { version: ref.version, exit: check.exitCode };",
  ),
);
add(
  "retry-loop-with-artifacts",
  "clean",
  lines(
    'const fixer = agent("fixer");',
    'artifact.metrics("attempts", { metrics: [{ field: "attempt" }] });',
    'phase("Iterate until green");',
    "let attempt = 0;",
    'let last = "";',
    "while (attempt < 3) {",
    '  const run = await world.run("node", ["--version"]);',
    '  report({ attempt }, "attempts");',
    "  if (run.exitCode === 0) break;",
    '  last = await fixer.ask("Fix attempt " + attempt);',
    "  attempt += 1;",
    "}",
    "return { attempt, last };",
  ),
);
add(
  "two-agents-handoff",
  "clean",
  lines(
    'phase("Draft the outline");',
    'const draft = await agent("drafter").ask(String(args.topic ?? "outline"));',
    'phase("Review the outline");',
    'const reviewed = await agent("reviewer").ask(draft);',
    'phase("Finalize the document");',
    'const ref = await artifact.markdown("doc", reviewed, { primary: true });',
    "return ref.id;",
  ),
);
add(
  "release-check-with-board",
  "clean",
  lines(
    'artifact.board("checks", { key: "name", status: "state", columns: ["pending", "done"] });',
    'phase("Collect the check results");',
    "const rows: { name: string; state: string }[] = [];",
    'const nodeRun = await world.run("node", ["--version"]);',
    'rows.push({ name: "node", state: nodeRun.exitCode === 0 ? "done" : "pending" });',
    'const gitRun = await world.run("git", ["status"]);',
    'rows.push({ name: "git", state: gitRun.exitCode === 0 ? "done" : "pending" });',
    'phase("Report the board");',
    'for (const row of rows) { report(row, "checks"); }',
    "return rows.length;",
  ),
);
add(
  "research-summary-with-metrics",
  "clean",
  lines(
    'phase("Collect the sources");',
    'const sources = await files.glob("docs/**/*.md");',
    'artifact.metrics("progress", { metrics: [{ field: "read", label: "Read" }] });',
    'phase("Read and summarize each source");',
    "const summaries: string[] = [];",
    "for (const [index, source] of sources.entries()) {",
    "  const body = await files.read(source);",
    '  const summary = await agent("reader-" + index).ask("Summarize " + source + ":\\n" + body);',
    "  summaries.push(summary);",
    '  report({ read: index + 1 }, "progress");',
    "}",
    'phase("Merge the summaries");',
    'const merged = await agent("merger").ask(summaries.join("\\n---\\n"));',
    'artifact.markdown("summary", merged, { primary: true });',
    "return summaries.length;",
  ),
);
