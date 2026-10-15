// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 golden 语料 · legacy 族（从 corpus.mjs 按族拆出，oxlint max-lines）。
// 每条 add(id, expect, script)：expect "clean" = 旧实现 ok 为真且零诊断，"diagnostics" = ok 为假。

export const samples = [];
function add(id, expect, script) {
  samples.push({ id: `legacy/${id}`, script, expect });
}

add(
  "lane-facts-1",
  "clean",
  'const a = agent("Owned worker"); phase("Owned first"); const x = await a.ask("Owned input"); phase("Owned second"); return await a.ask(x);',
);
add(
  "lane-facts-2",
  "clean",
  'const a = agent("Owned worker"); let value = "Owned seed"; for (let i=0;i<3;i++) { if (i === 1) { value = await a.ask(value); continue; } value = await a.ask(value); } return value;',
);
add(
  "reduction-1",
  "clean",
  'const a = agent("Synthetic alpha"); const b = agent("Synthetic beta"); phase("First"); const x = await a.ask("Owned first"); phase("Second"); const y = await b.ask(`Owned second ${x}`); phase("Third"); return await a.ask(`Owned third ${x} ${y}`);',
);
add(
  "reduction-2",
  "clean",
  'const a = agent("Synthetic loop"); let value = "owned seed"; for (let i = 0; i < 2; i++) { phase("Round"); value = await a.ask(value); } phase("Done"); return value;',
);
add(
  "strands-1",
  "clean",
  'const a=agent("Owned A"); const b=agent("Owned B"); async function work(){return await a.ask("Owned inner");} const held=work(); const parallel=b.ask("Owned parallel"); await held; await held; return await parallel;',
);
add(
  "strands-2",
  "clean",
  'const a=agent("Owned A"); async function work(label:string){return await a.ask(label);} const held=[work("Owned first"),work("Owned second")]; const answer=await Promise.all(held); for await(const value of held){await a.ask(value);} return answer;',
);
add(
  "strands-3",
  "clean",
  'const a=agent("Owned A"); async function work(){const held=a.ask("Owned seed"); return await held.then(async value=>a.ask(value));} return await work();',
);
add(
  "may-set-1",
  "clean",
  'const a = agent("Owned alpha"); const b = agent("Owned beta"); const condition = true as boolean; const chosen = condition ? a : b; return await chosen.ask("Owned ask");',
);
add(
  "may-set-2",
  "clean",
  'const a = agent("Owned alpha"); const b = agent("Owned beta"); const condition = true as boolean; const chosen = condition ? a : b; let value = "Owned seed"; for (let i=0;i<2;i++) { value = await chosen.ask(value); } return value;',
);
add(
  "may-set-3",
  "clean",
  'const a = agent("Owned alpha"); const b = agent("Owned beta"); const condition = true as boolean; const chosen = condition ? a : b; phase("Owned first"); const x = await chosen.ask("Owned first ask"); phase("Owned second"); return await chosen.ask(x);',
);
add(
  "fanout-card-1",
  "clean",
  'const a = agent("Owned worker"); const xs = ["one", "two"]; return await Promise.all(xs.map(async x => await a.ask(x)));',
);
add(
  "fanout-card-2",
  "clean",
  'const a = agent("Owned worker"); const xs = ["one", "two"]; xs.push("three"); return await Promise.all(xs.map(async x => await a.ask(x)));',
);
add(
  "fanout-card-3",
  "clean",
  'const a = agent("Owned worker"); const xs = ["one", "two"]; const ys = xs; ys.push("three"); return await Promise.all(xs.map(async x => await a.ask(x)));',
);
