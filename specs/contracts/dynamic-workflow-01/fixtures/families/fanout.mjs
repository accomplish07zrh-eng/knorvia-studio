// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 golden 语料 · fanout 族（从 corpus.mjs 按族拆出，oxlint max-lines）。
// 每条 add(id, expect, script)：expect "clean" = 旧实现 ok 为真且零诊断，"diagnostics" = ok 为假。

export const samples = [];
function add(id, expect, script) {
  samples.push({ id: `fanout/${id}`, script, expect });
}

add(
  "map-inline",
  "clean",
  'const xs = ["a", "b"]; return await Promise.all(xs.map(async (x) => await agent("r-" + x).ask(x)));',
);
add(
  "map-named-agent",
  "clean",
  'const a = agent("reviewer"); const xs = ["a", "b"]; return await Promise.all(xs.map(async (x) => await a.ask(x)));',
);
add(
  "map-named-callback",
  "clean",
  'const a = agent("a"); async function review(x: string) { return await a.ask(x); } const xs = ["m", "n"]; return await Promise.all(xs.map(review));',
);
add(
  "map-sync-callback",
  "clean",
  'const a = agent("a"); const xs = ["m", "n"]; return await Promise.all(xs.map((x) => a.ask(x)));',
);
add(
  "map-world-read",
  "clean",
  'const files3 = ["a.ts", "b.ts"]; const texts = await Promise.all(files3.map(async (f) => await files.read(f))); return texts;',
);
add(
  "filter-then-map",
  "clean",
  'const xs = ["a", "b", "c"]; const kept = xs.filter((x) => x !== "b"); return await Promise.all(kept.map(async (x) => await agent("r-" + x).ask(x)));',
);
add(
  "flatMap",
  "clean",
  'const groups = [["a", "b"], ["c"]]; return await Promise.all(groups.flatMap((g) => g.map(async (x) => await agent("c-" + x).ask(x))));',
);
add(
  "forEach-side-effect",
  "clean",
  'const a = agent("a"); const xs = ["p", "q"]; const held: Node<string>[] = []; xs.forEach((x) => { held.push(a.ask(x)); }); return await Promise.all(held);',
);
add(
  "reduce-to-nodes",
  "clean",
  'const a = agent("a"); const xs = ["p", "q"]; const held = xs.reduce<Node<string>[]>((acc, x) => { acc.push(a.ask(x)); return acc; }, []); return await Promise.all(held);',
);
add(
  "array-from",
  "clean",
  'const a = agent("a"); const keys = ["k1", "k2"]; return await Promise.all(Array.from(keys, async (k) => await a.ask(k)));',
);
add(
  "for-of-literal",
  "clean",
  'const out: string[] = []; for (const k of ["a", "b"]) { out.push(await agent("r-" + k).ask(k)); } return out;',
);
add(
  "for-of-const-binding",
  "clean",
  'const xs = ["a", "b"]; const out: string[] = []; for (const x of xs) { out.push(await agent("r-" + x).ask(x)); } return out;',
);
add(
  "for-of-await-all",
  "clean",
  'const xs = ["a", "b"]; const held = xs.map((x) => agent("r-" + x).ask(x)); return await Promise.all(held);',
);
add(
  "for-await-of-nodes",
  "clean",
  'const xs = ["a", "b"]; const held = xs.map((x) => agent("r-" + x).ask(x)); const out: string[] = []; for await (const v of held) { out.push(v); } return out;',
);
add(
  "nested-map",
  "clean",
  'const rows = [["a1", "a2"], ["b1"]]; return await Promise.all(rows.map(async (row) => await Promise.all(row.map(async (cell) => await agent("c-" + cell).ask(cell)))));',
);
add(
  "map-with-phase",
  "clean",
  'phase("review files"); const xs = ["a.ts", "b.ts"]; return await Promise.all(xs.map(async (x) => await agent("reviewer-" + x).ask("review " + x)));',
);
add(
  "fanout-inside-loop",
  "clean",
  'const out: string[] = []; for (const round of ["r1", "r2"]) { const xs = ["a", "b"]; const batch = await Promise.all(xs.map(async (x) => await agent(round + "-" + x).ask(x))); out.push(...batch); } return out;',
);
add(
  "static-name-in-fanout",
  "diagnostics",
  'const xs = ["a", "b"]; return await Promise.all(xs.map(async (x) => await agent("static").ask(x)));',
);
add(
  "no-facade-in-body",
  "clean",
  'const xs = ["a", "b"]; const upper = xs.map((x) => x.toUpperCase()); return upper;',
);
add(
  "for-of-no-facade",
  "clean",
  "let acc = 0; for (const n of [1, 2, 3]) { acc += n; } return acc;",
);
add(
  "cardinality-1",
  "clean",
  'const a = agent("a"); const xs = ["only"]; return await Promise.all(xs.map(async (x) => await a.ask(x)));',
);
add(
  "cardinality-8",
  "clean",
  'const a = agent("a"); const xs = ["1", "2", "3", "4", "5", "6", "7", "8"]; return await Promise.all(xs.map(async (x) => await a.ask(x)));',
);
add(
  "cardinality-9-over-cap",
  "clean",
  'const a = agent("a"); const xs = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]; return await Promise.all(xs.map(async (x) => await a.ask(x)));',
);
add(
  "cardinality-empty-literal",
  "clean",
  'const a = agent("a"); const xs: string[] = []; return await Promise.all(xs.map(async (x) => await a.ask(x)));',
);
add(
  "cardinality-let-mutated",
  "clean",
  'const a = agent("a"); let xs = ["a", "b"]; xs = ["c"]; return await Promise.all(xs.map(async (x) => await a.ask(x)));',
);
add(
  "cardinality-push-invalidates",
  "clean",
  'const a = agent("a"); const xs = ["a", "b"]; xs.push("c"); return await Promise.all(xs.map(async (x) => await a.ask(x)));',
);
add(
  "cardinality-glob",
  "clean",
  'const names = await files.glob("src/**/*.ts"); return await Promise.all(names.map(async (n) => await agent("r-" + n).ask(n)));',
);
add(
  "callback-receiver-chain",
  "clean",
  'const a = agent("a"); const xs = ["m", "n"]; const nodes = xs.map((x) => a.ask(x)); return await Promise.all(nodes);',
);
add(
  "map-object-pair",
  "clean",
  'const entries: [string, string][] = [["k", "v"]]; return await Promise.all(entries.map(async ([k, v]) => await agent("e-" + k).ask(k + "=" + v)));',
);
add(
  "generator-array-from",
  "clean",
  'const a = agent("a"); function* keys() { yield "x"; yield "y"; } return await Promise.all(Array.from(keys(), async (k) => await a.ask(k)));',
);
add(
  "map-returns-node-direct",
  "clean",
  'const xs = ["a", "b"]; return await Promise.all(xs.map((x) => agent("r-" + x).ask(x)));',
);
add(
  "helper-declared-outside",
  "clean",
  'async function review(x: string) { return await agent("r").ask(x); } const xs = ["a", "b"]; return await Promise.all(xs.map(async (x) => await review(x)));',
);
add(
  "typed-generic-callback",
  "clean",
  'async function review<T>(item: T) { return await agent("r").ask(String(item)); } const xs = ["a", "b"]; return await Promise.all(xs.map(async (x) => await review(x)));',
);
add(
  "callback-with-try",
  "clean",
  'const a = agent("a"); const xs = ["a", "b"]; return await Promise.all(xs.map(async (x) => { try { return await a.ask(x); } catch { return "fail"; } }));',
);
add(
  "phase-inside-callback",
  "clean",
  'const a = agent("a"); const xs = ["a", "b"]; return await Promise.all(xs.map(async (x) => { phase("review item"); return await a.ask(x); }));',
);
add(
  "for-of-push-await",
  "clean",
  'const a = agent("a"); const out: string[] = []; for (const k of ["a", "b"]) { out.push(await a.ask(k)); } return out;',
);
add(
  "for-of-push-world-read",
  "clean",
  'const out: string[] = []; for (const n of ["a.txt", "b.txt"]) { out.push(await files.read(n)); } return out;',
);
add(
  "reduce-async-callback",
  "clean",
  'const a = agent("a"); const xs = ["p", "q"]; const held = xs.reduce<Node<string>[]>((acc, x) => { acc.push(a.ask(x)); return acc; }, []); return (await Promise.all(held)).join("");',
);
add(
  "map-over-string-chars",
  "clean",
  'const a = agent("a"); const s = "ab"; return await Promise.all(Array.from(s).map(async (c) => await a.ask(c)));',
);
add(
  "nested-for-of-fanout",
  "clean",
  'const out: string[] = []; for (const row of [["a1", "a2"], ["b1"]]) { for (const cell of row) { out.push(await agent("c-" + cell).ask(cell)); } } return out;',
);
add(
  "fanout-inside-try",
  "clean",
  'const a = agent("a"); try { const xs = ["a", "b"]; return await Promise.all(xs.map(async (x) => await a.ask(x))); } catch { return ["recovered"]; }',
);
add(
  "held-batch-then-intro",
  "clean",
  'const a = agent("a"); const xs = ["a", "b"]; const held = Promise.all(xs.map((x) => a.ask(x))); await a.ask("intro"); return await held;',
);
add(
  "map-object-values",
  "clean",
  'const a = agent("a"); const cfg = { alpha: "1", beta: "2" }; return await Promise.all(Object.values(cfg).map(async (v) => await a.ask(v)));',
);
add(
  "for-await-map-nodes",
  "clean",
  'const a = agent("a"); const xs = ["a", "b"]; const nodes = xs.map((x) => a.ask(x)); const out: string[] = []; for await (const v of nodes) { out.push(v); } return out.length;',
);
add(
  "world-read-in-fanout-callback",
  "clean",
  'const names = ["a.txt", "b.txt"]; return await Promise.all(names.map(async (n) => await files.read(n)));',
);
