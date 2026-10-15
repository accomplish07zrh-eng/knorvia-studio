// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 golden 语料 · async 族（从 corpus.mjs 按族拆出，oxlint max-lines）。
// 每条 add(id, expect, script)：expect "clean" = 旧实现 ok 为真且零诊断，"diagnostics" = ok 为假。

export const samples = [];
function add(id, expect, script) {
  samples.push({ id: `async/${id}`, script, expect });
}

add(
  "await-in-loop",
  "clean",
  'const a = agent("a"); let acc = "seed"; for (const k of ["1", "2", "3"]) { acc = await a.ask(acc + k); } return acc;',
);
add(
  "while-loop-await",
  "clean",
  'const a = agent("a"); let i = 0; let last = ""; while (i < 2) { last = await a.ask(String(i)); i += 1; } return last;',
);
add(
  "do-while-await",
  "clean",
  'const a = agent("a"); let i = 0; let last = ""; do { last = await a.ask(String(i)); i += 1; } while (i < 1); return last;',
);
add(
  "then-chain",
  "clean",
  'const a = agent("a"); const answer = await a.ask("seed").then(async (v) => a.ask(v)); return answer;',
);
add(
  "then-two-hops",
  "clean",
  'const a = agent("a"); const answer = await a.ask("1").then((v) => a.ask(v)).then((v) => a.ask(v)); return answer;',
);
add(
  "held-await-twice",
  "clean",
  'const a = agent("a"); const held = a.ask("held"); const one = await held; const two = await held; return one + two;',
);
add(
  "parallel-hold",
  "clean",
  'const a = agent("a"); const b = agent("b"); const left = a.ask("l"); const right = b.ask("r"); return (await left) + (await right);',
);
add(
  "async-helper-nested",
  "clean",
  'const a = agent("a"); async function step(v: string) { const mid = await a.ask(v); return await a.ask(mid); } return await step("seed");',
);
add(
  "recursive-helper",
  "clean",
  'const a = agent("a"); async function descend(depth: number): Promise<string> { if (depth <= 0) return "leaf"; return await a.ask(await descend(depth - 1)); } return await descend(2);',
);
add(
  "try-finally-await",
  "clean",
  'const a = agent("a"); try { return await a.ask("body"); } finally { log("cleanup"); }',
);
add(
  "new-promise-executor",
  "clean",
  'const a = agent("a"); const value = await new Promise<string>((resolve) => { void a.ask("x").then(resolve); }); return value;',
);
add(
  "promise-reject-caught",
  "clean",
  'const a = agent("a"); try { await Promise.reject(new Error("boom")); } catch { return await a.ask("recovered"); } return "unreachable";',
);
add(
  "await-undefined",
  "clean",
  'const a = agent("a"); const maybe: string | undefined = undefined; const v = await Promise.resolve(maybe ?? "fallback"); return await a.ask(v);',
);
add(
  "sequential-world-then-ask",
  "clean",
  'const run = await world.run("node", ["-e", "console.log(1)"]); return await agent("a").ask("exit=" + run.exitCode);',
);
add(
  "iife-await",
  "clean",
  'const a = agent("a"); const v = await (async () => await a.ask("x"))(); return v;',
);
add(
  "promise-resolve-static",
  "clean",
  'const a = agent("a"); return await Promise.resolve(a.ask("x"));',
);
add(
  "await-array-index",
  "clean",
  'const a = agent("a"); const held = [a.ask("1"), a.ask("2")]; return await held[1];',
);
add(
  "deep-then-chain",
  "clean",
  'const a = agent("a"); const v = await a.ask("1").then((x) => a.ask(x)).then((x) => a.ask(x)).then((x) => a.ask(x)); return v;',
);
add(
  "shared-node-two-helpers",
  "clean",
  'const a = agent("a"); const held = a.ask("seed"); async function left() { return await held; } async function right() { return await held; } return (await left()) + (await right());',
);
add(
  "await-in-class-method",
  "clean",
  'class Worker { async go() { return await agent("w").ask("x"); } } const w = new Worker(); return await w.go();',
);
add(
  "recursion-depth-3",
  "clean",
  'const a = agent("a"); async function descend(depth: number): Promise<string> { if (depth <= 0) return "leaf"; return await a.ask(await descend(depth - 1)); } return await descend(3);',
);
add(
  "then-catch-recover",
  "clean",
  'const a = agent("a"); const v = await a.ask("s").then((x) => x, () => "fallback"); return v;',
);
add(
  "await-maybe-undefined",
  "clean",
  'const a = agent("a"); const maybe: Node<string> | undefined = a.ask("x"); return (await maybe) ?? "none";',
);
add(
  "queue-chain-then",
  "clean",
  'const a = agent("a"); let p: Node<string> = a.ask("seed"); for (let i = 0; i < 2; i++) { p = p.then(async (v) => await a.ask(v + i)); } return await p;',
);
