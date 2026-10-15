// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 golden 语料 · actors 族（从 corpus.mjs 按族拆出，oxlint max-lines）。
// 每条 add(id, expect, script)：expect "clean" = 旧实现 ok 为真且零诊断，"diagnostics" = ok 为假。

export const samples = [];
function add(id, expect, script) {
  samples.push({ id: `actors/${id}`, script, expect });
}

add(
  "duplicate-literal-names",
  "diagnostics",
  'const a = agent("same"); const b = agent("same"); await a.ask("1"); return await b.ask("2");',
);
add(
  "distinct-literal-names",
  "clean",
  'const a = agent("one"); const b = agent("two"); await a.ask("1"); return await b.ask("2");',
);
add(
  "template-name",
  "clean",
  'const idx = 1; const a = agent(`reviewer-${idx}`); return await a.ask("x");',
);
add("binding-name-fallback", "clean", 'const reviewer = agent(); return await reviewer.ask("x");');
add(
  "anonymous-many",
  "clean",
  'await agent().ask("1"); await agent().ask("2"); return await agent().ask("3");',
);
add(
  "duplicate-binding-names",
  "clean",
  'const worker = agent("one"); const other = agent("two"); await worker.ask("1"); return await other.ask("2");',
);
add(
  "same-name-loop-static",
  "diagnostics",
  'for (const k of ["a", "b"]) { await agent("static").ask(k); } return "done";',
);
add(
  "template-name-in-fanout",
  "clean",
  'const xs = ["a", "b"]; return await Promise.all(xs.map(async (x) => await agent(`r-${x}`).ask(x)));',
);
add(
  "persona-and-name",
  "clean",
  'const lead = agent("lead", { system: "you coordinate" }); const sub = agent("sub"); return await lead.ask(await sub.ask("draft"));',
);
add(
  "name-number-concat",
  "clean",
  'const a = agent("worker-" + String(1)); return await a.ask("x");',
);
add(
  "template-name-two-expressions",
  "clean",
  'const team = "core"; const idx = 2; const a = agent(`${team}-worker-${idx}`); return await a.ask("x");',
);
add(
  "persona-and-dup-name",
  "diagnostics",
  'const a = agent("dup", { system: "s1" }); const b = agent("dup", "s2"); await a.ask("1"); return await b.ask("2");',
);
add(
  "anonymous-in-loop",
  "clean",
  'for (const k of ["a", "b"]) { await agent().ask(k); } return "done";',
);
add("name-with-spaces", "clean", 'const a = agent("review bot"); return await a.ask("x");');
