// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 golden 语料 · settle 族（从 corpus.mjs 按族拆出，oxlint max-lines）。
// 每条 add(id, expect, script)：expect "clean" = 旧实现 ok 为真且零诊断，"diagnostics" = ok 为假。

export const samples = [];
function add(id, expect, script) {
  samples.push({ id: `settle/${id}`, script, expect });
}

add(
  "push-after-plan",
  "clean",
  'const a=agent("Owned A"); const first={steps:[a.ask("Owned first")]}; const plan=Promise.all(first.steps); const one=await plan; first.steps.push(a.ask("Owned extra")); await plan; return await a.ask(one[0]);',
);
add(
  "held-reassigned-loop",
  "clean",
  'const a=agent("Owned A"); let held=a.ask("Owned seed"); for(let i=0;i<2;i++){const previous=await held; held=a.ask(previous);} return await a.ask("Owned after");',
);
add(
  "parallel-with-phase-in-work",
  "clean",
  'const a=agent("Owned A"); const b=agent("Owned B"); async function work(){phase("Owned inner"); return await a.ask("Owned inside");} const held=work(); const parallel=b.ask("Owned parallel"); await held; return await parallel;',
);
add(
  "then-chain-held",
  "clean",
  'const a=agent("Owned A"); const held=a.ask("Owned first"); const work=held.then(async value=>a.ask(value)); return await work;',
);
add(
  "for-await-then-guard",
  "clean",
  'const a=agent("Owned A"); const held=[a.ask("Owned first"),a.ask("Owned second")]; for await(const answer of held){await a.ask(answer);} const flag=(await a.ask("Owned flag"))?1:2; if(flag){return await a.ask("Owned guarded");} return "Owned end";',
);
