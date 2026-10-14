// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 golden 语料 · control 族（从 corpus.mjs 按族拆出，oxlint max-lines）。
// 每条 add(id, expect, script)：expect "clean" = 旧实现 ok 为真且零诊断，"diagnostics" = ok 为假。

export const samples = [];
function add(id, expect, script) {
  samples.push({ id: `control/${id}`, script, expect });
}

add(
  "if-else-asks",
  "clean",
  'const a = agent("a"); const flag = true as boolean; if (flag) { return await a.ask("yes"); } else { return await a.ask("no"); }',
);
add(
  "ternary-ask",
  "clean",
  'const a = agent("a"); const flag = true as boolean; return await a.ask(flag ? "hot" : "cold");',
);
add(
  "short-circuit-guard",
  "clean",
  'const a = agent("a"); const cached: string | undefined = undefined; const v = cached || await a.ask("fresh"); return v;',
);
add(
  "nullish-ask",
  "clean",
  'const a = agent("a"); const input: string | null = null; return await a.ask(input ?? "default");',
);
add(
  "optional-chain-receiver",
  "clean",
  'const a = agent("a"); function pick(flag: boolean): Agent | undefined { return flag ? a : undefined; } const maybe = pick(true as boolean); return (await maybe?.ask("skipped")) ?? "none";',
);
add(
  "throw-caught-locally",
  "clean",
  'const a = agent("a"); try { throw new Error("inner"); } catch (e) { return await a.ask("caught " + (e as Error).message); }',
);
add("uncaught-throw", "clean", 'const a = agent("a"); await a.ask("x"); throw new Error("fatal");');
add(
  "nested-branches",
  "clean",
  'const a = agent("a"); const mode = "fast"; if (mode === "fast") { if ((await a.ask("q")).length >= 0) { return await a.ask("fast-path"); } } return await a.ask("slow-path");',
);
add(
  "if-else-chain-three",
  "clean",
  'const a = agent("a"); const mode: string = "mid"; if (mode === "fast") { return await a.ask("f"); } else if (mode === "mid") { return await a.ask("m"); } else { return await a.ask("s"); }',
);
add(
  "throw-in-async-helper-caught",
  "clean",
  'const a = agent("a"); async function boom(): Promise<string> { throw new Error("x"); } try { await boom(); } catch { return await a.ask("caught"); } return "unreachable";',
);
add(
  "short-circuit-and-ask",
  "clean",
  'const a = agent("a"); const flag = true as boolean; const v = flag && (await a.ask("g")); return String(v);',
);
add(
  "guard-clause-pattern",
  "clean",
  'const a = agent("a"); const flag = true as boolean; if (!flag) { return "skip"; } return await a.ask("x");',
);
add(
  "switch-fallthrough",
  "clean",
  'const a = agent("a"); const v = await a.ask("s"); switch (v.length % 3) { case 0: await a.ask("even"); case 1: await a.ask("odd"); break; default: await a.ask("other"); } return "done";',
);
add(
  "throw-inside-loop-caught",
  "clean",
  'const a = agent("a"); try { for (const k of ["a", "b"]) { throw new Error(k); } } catch (e) { return await a.ask("caught " + (e as Error).message); } return "unreachable";',
);
