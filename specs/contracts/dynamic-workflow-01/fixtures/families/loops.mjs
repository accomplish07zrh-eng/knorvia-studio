// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 golden 语料 · loops 族（从 corpus.mjs 按族拆出，oxlint max-lines）。
// 每条 add(id, expect, script)：expect "clean" = 旧实现 ok 为真且零诊断，"diagnostics" = ok 为假。

export const samples = [];
function add(id, expect, script) {
  samples.push({ id: `loops/${id}`, script, expect });
}

add(
  "for-literal-bound",
  "clean",
  'const a = agent("a"); for (let i = 0; i < 2; i++) { await a.ask("round " + i); } return "done";',
);
add(
  "nested-for",
  "clean",
  'const a = agent("a"); for (let i = 0; i < 2; i++) { for (let j = 0; j < 2; j++) { await a.ask(`${i}.${j}`); } } return "done";',
);
add(
  "for-in-object",
  "clean",
  'const a = agent("a"); const cfg: Record<string, string> = { alpha: "1", beta: "2" }; for (const key in cfg) { await a.ask(key + "=" + cfg[key]); } return "done";',
);
add(
  "break-in-loop",
  "clean",
  'const a = agent("a"); for (const k of ["a", "b", "c"]) { const r = await a.ask(k); if (r.length > 100) break; } return "done";',
);
add(
  "continue-in-while",
  "clean",
  'const a = agent("a"); let i = 0; while (i < 3) { i += 1; if (i === 2) continue; await a.ask(String(i)); } return "done";',
);
add(
  "switch-on-ask",
  "clean",
  'const a = agent("a"); const v = await a.ask("pick"); switch (v.length % 2) { case 0: await a.ask("even"); break; default: await a.ask("odd"); } return "done";',
);
add(
  "loop-with-world-run",
  "clean",
  'const out: number[] = []; for (const expr of ["1", "2"]) { const r = await world.run("node", ["-e", expr]); out.push(r.exitCode); } return out;',
);
add(
  "early-return-in-helper",
  "clean",
  'const a = agent("a"); async function once(kind: string) { if (kind === "skip") return "skipped"; return await a.ask(kind); } return await once("run");',
);
add(
  "for-step-two",
  "clean",
  'const a = agent("a"); for (let i = 0; i < 4; i += 2) { await a.ask(String(i)); } return "done";',
);
add(
  "nested-for-three-levels",
  "clean",
  'const a = agent("a"); for (let i = 0; i < 2; i++) { for (let j = 0; j < 2; j++) { for (let k = 0; k < 2; k++) { await a.ask(`${i}${j}${k}`); } } } return "done";',
);
add(
  "while-true-break",
  "clean",
  'const a = agent("a"); while (true) { const r = await a.ask("poll"); if (r.length > 0) break; } return "done";',
);
add(
  "for-of-break-attempts",
  "clean",
  'const a = agent("a"); for (const k of ["a", "b", "c"]) { const r = await a.ask(k); if (r === "stop") break; } return "done";',
);
add(
  "loop-phase-continue",
  "clean",
  'const a = agent("a"); for (let i = 0; i < 3; i++) { phase("round"); if (i === 1) { continue; } await a.ask(String(i)); } return "done";',
);
add(
  "loop-with-try-continue",
  "clean",
  'const a = agent("a"); for (const k of ["a", "b"]) { try { await a.ask(k); } catch { continue; } } return "done";',
);
