// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 golden 语料 · joins 族（从 corpus.mjs 按族拆出，oxlint max-lines）。
// 每条 add(id, expect, script)：expect "clean" = 旧实现 ok 为真且零诊断，"diagnostics" = ok 为假。

export const samples = [];
function add(id, expect, script) {
  samples.push({ id: `joins/${id}`, script, expect });
}

add(
  "all-two-asks",
  "clean",
  'const a = agent("a"); const b = agent("b"); return await Promise.all([a.ask("1"), b.ask("2")]);',
);
add(
  "all-nested",
  "clean",
  'const a = agent("a"); const inner = a.ask("i"); const outer = [inner, a.ask("o")]; return await Promise.all(outer);',
);
add(
  "all-settled",
  "clean",
  'const a = agent("a"); return await Promise.allSettled([a.ask("1"), a.ask("2")]);',
);
add(
  "all-of-world-reads",
  "clean",
  'return await Promise.all([files.read("a.txt"), files.read("b.txt")]);',
);
add(
  "all-mixed",
  "clean",
  'const a = agent("a"); const text = await files.read("cfg.json"); return await Promise.all([a.ask(text), a.ask("static")]);',
);
add(
  "join-feeds-ask",
  "clean",
  'const a = agent("a"); const both = await Promise.all([a.ask("1"), a.ask("2")]); return await agent("sum").ask(both.join(" "));',
);
add("all-of-empty", "clean", "return await Promise.all([]);");
add("all-single", "clean", 'const a = agent("a"); return await Promise.all([a.ask("only")]);');
add(
  "spread-into-all",
  "clean",
  'const a = agent("a"); const parts = [a.ask("1"), a.ask("2")]; return await Promise.all([...parts]);',
);
add(
  "all-of-then-chains",
  "clean",
  'const a = agent("a"); const one = a.ask("1").then(async (v) => v + "!"); return await Promise.all([one, a.ask("2")]);',
);
add(
  "all-of-three-agents",
  "clean",
  'const a = agent("a"); const b = agent("b"); const c = agent("c"); return await Promise.all([a.ask("1"), b.ask("2"), c.ask("3")]);',
);
add(
  "join-inside-helper",
  "clean",
  'const a = agent("a"); async function both() { return await Promise.all([a.ask("l"), a.ask("r")]); } return (await both()).join("/");',
);
add(
  "all-of-reads-then-ask",
  "clean",
  'const a = agent("a"); const texts = await Promise.all([files.read("x.txt"), files.read("y.txt")]); return await a.ask(texts.join("---"));',
);
