// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 golden 语料 · misuse 族（从 corpus.mjs 按族拆出，oxlint max-lines）。
// 每条 add(id, expect, script)：expect "clean" = 旧实现 ok 为真且零诊断，"diagnostics" = ok 为假。

export const samples = [];
function add(id, expect, script) {
  samples.push({ id: `misuse/${id}`, script, expect });
}

add(
  "alias-agent",
  "diagnostics",
  'const spawn = agent; const a = spawn("x"); return await a.ask("y");',
);
add(
  "alias-ask",
  "diagnostics",
  'const a = agent("a"); const send = a.ask; return await send("x");',
);
add(
  "destructure-ask",
  "diagnostics",
  'const a = agent("a"); const { ask } = a; return await ask("x");',
);
add(
  "destructure-renamed",
  "diagnostics",
  'const a = agent("a"); const { ask: send } = a; return await send("x");',
);
add(
  "destructure-assignment",
  "diagnostics",
  'const a = agent("a"); let send: typeof a.ask; ({ ask: send } = a); return await send("x");',
);
add(
  "bind-ask",
  "diagnostics",
  'const a = agent("a"); const bound = a.ask.bind(a); return await bound("x");',
);
add(
  "pass-agent-as-argument",
  "diagnostics",
  'const a = agent("a"); function use(fn: () => void) { log("used"); } use(a.ask); return await a.ask("x");',
);
add(
  "computed-member-call",
  "diagnostics",
  'const text = await files["read"]("a.txt"); return text.length;',
);
add(
  "retype-as-local-interface",
  "diagnostics",
  'interface Askable { ask(t: string): Promise<string> } const a = agent("a"); const d = a as Askable; return await d.ask("x");',
);
add(
  "retype-into-parameter",
  "diagnostics",
  'interface Askable { ask(t: string): Promise<string> } function use(x: Askable) { log("ok"); } const a = agent("a"); use(a); return "done";',
);
add(
  "alias-files-read",
  "diagnostics",
  'const read = files.read; const t = await read("a.txt"); return t.length;',
);
add(
  "alias-phase",
  "diagnostics",
  'const mark = phase; mark("bad"); return await agent("a").ask("x");',
);
add("alias-log", "clean", 'log("direct is fine"); return await agent("a").ask("x");');
add(
  "retyping-result-stays-legal",
  "clean",
  'const a = agent("a"); const text: string = await a.ask("x"); return text.length;',
);
add(
  "alias-git-status",
  "diagnostics",
  "const s = git.status; const r = await s(); return r.clean;",
);
add(
  "alias-artifact-metrics",
  "diagnostics",
  'const m = artifact.metrics; m("x", { metrics: [{ field: "n" }] }); return "done";',
);
add("alias-report", "diagnostics", 'const r = report; r({ n: 1 }); return "done";');
add(
  "destructure-files-read",
  "diagnostics",
  'const { read } = files; const t = await read("a.txt"); return t.length;',
);
add(
  "pass-agent-into-function",
  "clean",
  'const a = agent("a"); function use(x: Agent) { log("used"); } use(a); return await a.ask("x");',
);
