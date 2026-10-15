// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 golden 语料 · basic 族（从 corpus.mjs 按族拆出，oxlint max-lines）。
// 每条 add(id, expect, script)：expect "clean" = 旧实现 ok 为真且零诊断，"diagnostics" = ok 为假。

export const samples = [];
function add(id, expect, script) {
  samples.push({ id: `basic/${id}`, script, expect });
}

add("empty", "clean", "");
add("whitespace", "clean", "   \n\t\n  ");
add("log-only", "clean", 'log("hello");');
add("log-template", "clean", 'const who = "world"; log(`hello ${who}`);');
add("args-read", "clean", "log(String(args.target));");
add("args-missing-key", "clean", "log(String(args.nope));");
add("single-ask", "clean", 'const a = agent(); return await a.ask("do");');
add("named-agent", "clean", 'const planner = agent("planner"); return await planner.ask("plan");');
add("persona-string", "clean", 'const p = agent("p", "you are careful"); return await p.ask("x");');
add(
  "persona-object",
  "clean",
  'const p = agent("p", { system: "you are careful" }); return await p.ask("x");',
);
add("anonymous-two", "clean", 'const x = await agent().ask("first"); return await agent().ask(x);');
add(
  "ask-typed",
  "clean",
  'interface Plan { steps: string[] } const p = agent("p"); const plan = await p.ask<Plan>("make a plan"); return plan.steps;',
);
add(
  "ask-literal-union",
  "clean",
  'const a = agent("a"); const verdict = await a.ask<"yes" | "no">("judge"); return verdict;',
);
add(
  "sequential-asks",
  "clean",
  'const a = agent("a"); const one = await a.ask("one"); const two = await a.ask(one); return two;',
);
add(
  "return-object",
  "clean",
  'const a = agent("a"); const r = await a.ask("r"); return { r, n: 1 };',
);
add("return-array", "clean", 'const a = agent("a"); return [await a.ask("x")];');
add("return-void", "clean", 'const a = agent("a"); await a.ask("x");');
add(
  "return-number",
  "clean",
  'const a = agent("a"); const n = (await a.ask("n")).length; return n;',
);
add("return-nothing", "clean", 'log("no output");');
add(
  "const-shadow",
  "clean",
  'const a = agent("a"); { const a = agent("b"); await a.ask("inner"); } return await a.ask("outer");',
);
add(
  "helper-function",
  "clean",
  'async function run(label: string) { const a = agent("w"); return await a.ask(label); } return await run("first");',
);
add(
  "helper-two-agents",
  "clean",
  'const x = agent("x"); const y = agent("y"); async function relay(v: string) { return await x.ask(v); } return await y.ask(await relay("seed"));',
);
add(
  "unicode-labels",
  "clean",
  'const 审查员 = agent("审查员"); phase("汇总并产出最终报告"); const 审阅 = await 审查员.ask("审阅 diff"); return 审阅.length > 0 ? 审阅 : "empty";',
);
add(
  "long-instructions",
  "clean",
  `const a = agent("a"); return await a.ask("${"review carefully ".repeat(20)}");`,
);
add(
  "args-plus-ask",
  "clean",
  'const a = agent("a"); const target = String(args.target ?? "src"); return await a.ask("review " + target);',
);
add(
  "nested-let-blocks",
  "clean",
  'let acc = "seed"; { let inner = await agent("a").ask(acc); { acc = await agent("b").ask(inner); } } return acc;',
);
add(
  "for-await-nodes",
  "clean",
  'const a = agent("a"); const nodes = ["p", "q"].map((k) => a.ask(k)); const out: string[] = []; for await (const v of nodes) { out.push(v); } return out;',
);
add(
  "helper-node-param",
  "clean",
  'async function once(p: Node<string>) { return await p; } const a = agent("a"); return await once(a.ask("x"));',
);
add(
  "string-formatting",
  "clean",
  'const a = agent("a"); const text = await a.ask("t"); return `len=${text.length}`;',
);
add(
  "nested-arrow-async",
  "clean",
  'const a = agent("a"); const run = async (v: string) => await a.ask(v); return await run("seed");',
);
add(
  "default-param-helper",
  "clean",
  'async function go(label: string = "d") { return await agent("w").ask(label); } return await go();',
);
add(
  "interface-narrowing",
  "clean",
  'interface Box { v: string } const a = agent("a"); const box = await a.ask<Box>("b"); if (typeof box.v === "string") { return box.v; } return "none";',
);
add(
  "array-at-helper",
  "clean",
  'const a = agent("a"); const rows: string[] = []; rows.push(await a.ask("x")); return rows.at(0) ?? "none";',
);
add(
  "boolean-guard-return",
  "clean",
  'const a = agent("a"); const text = await a.ask("x"); if (text.length > 0) { return true; } return false;',
);
add(
  "number-typed-return",
  "clean",
  'const a = agent("a"); const n: number = (await a.ask("n")).length; return n;',
);
add(
  "spread-join-args",
  "clean",
  'const a = agent("a"); const parts = ["p", "q"]; return await a.ask(parts.join(","));',
);
add(
  "object-return-nested",
  "clean",
  'const a = agent("a"); const inner = await a.ask("i"); return { outer: { inner, n: 1 } };',
);
add(
  "two-helpers-chained",
  "clean",
  'const x = agent("x"); async function first(v: string) { return await x.ask(v); } async function second(v: string) { return await x.ask(v + "!"); } return await second(await first("seed"));',
);
add(
  "generic-passthrough",
  "clean",
  'async function echo<T>(v: T): Promise<T> { return v; } const a = agent("a"); return await echo(await a.ask("x"));',
);
