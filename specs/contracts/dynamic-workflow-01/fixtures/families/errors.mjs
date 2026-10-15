// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 golden 语料 · errors 族（从 corpus.mjs 按族拆出，oxlint max-lines）。
// 每条 add(id, expect, script)：expect "clean" = 旧实现 ok 为真且零诊断，"diagnostics" = ok 为假。

export const samples = [];
function add(id, expect, script) {
  samples.push({ id: `errors/${id}`, script, expect });
}

add("type-mismatch", "diagnostics", 'const n: number = "not a number"; return n;');
add("unknown-identifier", "diagnostics", "return missingFunction();");
add("wrong-arg-type", "diagnostics", 'const a = agent("a"); return await a.ask(42);');
add("syntax-error", "diagnostics", 'const a = agent("a"; return await a.ask("x");');
add(
  "declare-modifier",
  "diagnostics",
  'declare const ambient: string; return await agent("a").ask(ambient);',
);
add("export-modifier", "diagnostics", "export const value = 1; return value;");
add("await-non-thenable", "clean", "const v = await 5; return v;");
add(
  "duplicate-const",
  "diagnostics",
  'const a = agent("a"); const a2 = agent("a"); await a.ask("1"); return await a2.ask("2");',
);
add(
  "missing-interface-body",
  "diagnostics",
  'interface Broken ; const a = agent("a"); return await a.ask("x");',
);
add("process-ambient-missing", "diagnostics", 'log(String(process.env.X)); return "done";');
add("require-missing", "diagnostics", 'const fs = require("node:fs"); return typeof fs;');
add(
  "fetch-ambient-missing",
  "diagnostics",
  'const r = await fetch("https://example.invalid"); return r.status;',
);
add(
  "misuse-and-type-error",
  "diagnostics",
  'const send = agent("a").ask; const n: number = "x"; return await send(n);',
);
add(
  "assign-string-to-number",
  "diagnostics",
  'const a = agent("a"); const s: string = await a.ask("x"); const n: number = s; return n;',
);
add(
  "missing-interface-property",
  "diagnostics",
  'interface P { steps: string[] } const a = agent("a"); const p = await a.ask<P>("g"); return p.missing;',
);
add("call-non-function", "diagnostics", 'const a = agent("a"); const v = 5; return await v("x");');
add(
  "assign-to-const",
  "diagnostics",
  'const a = agent("a"); const x = await a.ask("x"); x = "y"; return x;',
);
add(
  "wrong-generic-arity",
  "diagnostics",
  'const a = agent("a"); const p = await a.ask<"a", "b">("x"); return p;',
);
add(
  "missing-return-annotated",
  "diagnostics",
  'async function f(): Promise<string> { const a = agent("a"); await a.ask("x"); } return await f();',
);
