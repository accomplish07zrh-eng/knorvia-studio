// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 golden 语料 · taint 族（从 corpus.mjs 按族拆出，oxlint max-lines）。
// 每条 add(id, expect, script)：expect "clean" = 旧实现 ok 为真且零诊断，"diagnostics" = ok 为假。

export const samples = [];
function add(id, expect, script) {
  samples.push({ id: `taint/${id}`, script, expect });
}

add(
  "ask-feeds-ask",
  "clean",
  'const p = agent("planner"); const r = agent("reviewer"); const plan = await p.ask("plan it"); return await r.ask(plan);',
);
add(
  "world-read-feeds-two",
  "clean",
  'const text = await files.read("config.json"); const a = agent("a"); return await Promise.all([a.ask(text), a.ask(text + " again")]);',
);
add(
  "destructure-ask-result",
  "clean",
  'interface Detail { title: string; body: string } const a = agent("a"); const { title, body } = await a.ask<Detail>("fetch"); return title + body;',
);
add(
  "spread-object",
  "clean",
  'const a = agent("a"); const base = { note: await a.ask("seed") }; const merged = { ...base, extra: 1 }; return merged.note + merged.extra;',
);
add(
  "object-assign",
  "clean",
  'const a = agent("a"); const target: Record<string, string> = {}; Object.assign(target, { note: await a.ask("seed") }); return target.note ?? "";',
);
add(
  "array-push-flow",
  "clean",
  'const a = agent("a"); const bag: string[] = []; bag.push(await a.ask("one")); return bag[0] ?? "";',
);
add(
  "class-field-roundtrip",
  "clean",
  'class Box { note = ""; fill(v: string) { this.note = v; } } const a = agent("a"); const box = new Box(); box.fill(await a.ask("seed")); return box.note;',
);
add(
  "json-stringify-flow",
  "clean",
  'const a = agent("a"); const payload = { note: await a.ask("seed") }; const encoded = JSON.stringify(payload); return encoded.length;',
);
add(
  "helper-param-flow",
  "clean",
  'const a = agent("a"); async function relay(v: string) { return await a.ask(v); } const seed = await a.ask("seed"); return await relay(seed);',
);
add(
  "join-port-types",
  "clean",
  'interface Left { l: string } interface Right { r: number } const a = agent("a"); const [l, r] = await Promise.all([a.ask<Left>("left"), a.ask<Right>("right")]); return l.l + r.r;',
);
add(
  "destructive-reassign",
  "clean",
  'const a = agent("a"); let v = "seed"; v = await a.ask(v); v = await a.ask(v + "!"); return v;',
);
add(
  "conditional-merge",
  "clean",
  'const a = agent("a"); const flag = true as boolean; const v = flag ? await a.ask("hot") : "cold"; return await a.ask(v);',
);
add(
  "string-built-from-two",
  "clean",
  'const a = agent("a"); const one = await a.ask("1"); const two = await a.ask("2"); return await agent("sum").ask(one + "/" + two);',
);
add(
  "spread-into-all-plus",
  "clean",
  'const a = agent("a"); const nodes = [a.ask("1"), a.ask("2")]; return await Promise.all([...nodes, a.ask("3")]);',
);
add(
  "destructure-await-all",
  "clean",
  'const a = agent("a"); const [x, y] = await Promise.all([a.ask("1"), a.ask("2")]); return x + y;',
);
add(
  "conditional-both-ask",
  "clean",
  'const a = agent("a"); const flag = true as boolean; const v = flag ? await a.ask("hot") : await a.ask("cold"); return v;',
);
add(
  "typed-roundtrip",
  "clean",
  'interface Note { v: string } class Box { note = ""; fill(v: string) { this.note = v; } } const a = agent("a"); const box = new Box(); const n = await a.ask<Note>("s"); box.fill(n.v); return box.note;',
);
add(
  "json-roundtrip-two",
  "clean",
  'const a = agent("a"); const payload = { one: await a.ask("1"), two: await a.ask("2") }; return JSON.stringify(payload).length;',
);
add(
  "helper-param-two-hops",
  "clean",
  'const a = agent("a"); async function first(v: string) { return await a.ask(v); } async function second(v: string) { return await a.ask(v + "!"); } return await second(await first("seed"));',
);
