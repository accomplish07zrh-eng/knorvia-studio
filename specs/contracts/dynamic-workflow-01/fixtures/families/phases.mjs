// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 golden 语料 · phases 族（从 corpus.mjs 按族拆出，oxlint max-lines）。
// 每条 add(id, expect, script)：expect "clean" = 旧实现 ok 为真且零诊断，"diagnostics" = ok 为假。

export const samples = [];
function add(id, expect, script) {
  samples.push({ id: `phases/${id}`, script, expect });
}

add("single", "clean", 'phase("research"); return await agent("a").ask("x");');
add(
  "three-markers",
  "clean",
  'const a = agent("a"); phase("one"); const x = await a.ask("1"); phase("two"); const y = await a.ask(x); phase("three"); return await a.ask(y);',
);
add(
  "repeated-name-merges",
  "clean",
  'const a = agent("a"); phase("gate"); const x = await a.ask("1"); if (x.length > 0) { phase("gate"); await a.ask("2"); } return x;',
);
add(
  "inside-loop",
  "clean",
  'const a = agent("a"); for (const k of ["1", "2"]) { phase("round"); await a.ask(k); } return "done";',
);
add(
  "inside-if-branch",
  "clean",
  'const a = agent("a"); const flag = true as boolean; if (flag) { phase("branch"); await a.ask("in"); } else { await a.ask("out"); } return "done";',
);
add("no-substitution-template", "clean", 'phase(`plain name`); return await agent("a").ask("x");');
add(
  "empty-then-work",
  "clean",
  'const a = agent("a"); phase("prep"); const prompt = "assemble"; phase("work"); return await a.ask(prompt);',
);
add(
  "trailing-marker-no-work",
  "clean",
  'const a = agent("a"); const r = await a.ask("x"); phase("wrap"); return r;',
);
add(
  "non-literal-name",
  "diagnostics",
  'const name = "dynamic"; phase(name); return await agent("a").ask("x");',
);
add(
  "template-with-hole",
  "diagnostics",
  'const i = 1; phase(`round ${i}`); return await agent("a").ask("x");',
);
add("empty-name", "diagnostics", 'phase(""); return await agent("a").ask("x");');
add(
  "expression-position",
  "diagnostics",
  'const a = agent("a"); const captured = phase("bad"); return await a.ask("x");',
);
add(
  "assignment-position",
  "diagnostics",
  'const a = agent("a"); let slot = 1; slot = phase("bad") as unknown as number; return await a.ask("x");',
);
add(
  "in-nested-function",
  "clean",
  'const a = agent("a"); async function inner() { phase("deep"); return await a.ask("x"); } return await inner();',
);
add(
  "around-two-loops",
  "clean",
  'const a = agent("a"); phase("first loop"); for (const k of ["1", "2"]) { await a.ask(k); } phase("second loop"); for (const k of ["3", "4"]) { await a.ask(k); } return "done";',
);
add(
  "inside-try",
  "clean",
  'const a = agent("a"); try { phase("body"); await a.ask("x"); } catch { log("cleanup"); } return "done";',
);
add(
  "inside-while",
  "clean",
  'const a = agent("a"); let i = 0; while (i < 2) { phase("round"); await a.ask(String(i)); i += 1; } return "done";',
);
add(
  "prep-then-if-work",
  "clean",
  'const a = agent("a"); phase("prep"); if (true) { await a.ask("x"); } return "done";',
);
add(
  "then-world-run",
  "clean",
  'phase("run the check"); const r = await world.run("node", ["--version"]); return r.stdout;',
);
add(
  "loop-then-close-out",
  "clean",
  'const a = agent("a"); for (const k of ["1", "2"]) { await a.ask(k); } phase("close out"); return await a.ask("summary");',
);
add(
  "no-marker-single-stage",
  "clean",
  'const a = agent("a"); const one = await a.ask("1"); return await a.ask(one);',
);
