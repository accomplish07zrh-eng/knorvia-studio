import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { dynamic, sha } from "./causality-reduction-fixture.js";

export { sha };
const emitted = process.env.KNORVIA_WORKFLOW_RUN_SUMMARY_TEST_EMITTED === "1";
const root = new URL("../../dynamic-workflow/", import.meta.url);
const archive = JSON.parse(
  await readFile(new URL("./fanout-cardinality-baseline.json", import.meta.url), "utf8"),
);
const pins = JSON.parse(
  await readFile(new URL("./fanout-cardinality-current.json", import.meta.url), "utf8"),
);
export async function loadCurrent(readArtifact = (url: URL) => readFile(url, "utf8")) {
  for (const [p, hash] of [
    ["src/analysis/fanout-cardinality.ts", pins.sourceSha256],
    ["dist/analysis/fanout-cardinality.js", pins.emittedSha256],
    ["dist/analysis/fanout-cardinality.d.ts", pins.declarationSha256],
  ])
    assert.equal(sha(await readArtifact(new URL(p, root))), hash, p);
  assert.equal(pins.declarationSha256, archive.declarationSha256);
  return dynamic("analysis/fanout-cardinality");
}
export const current = await loadCurrent();
assert.equal(sha(archive.compiled), archive.emittedSha256);
const typescript = createRequire(new URL("package.json", root)).resolve("typescript");
const typescriptUrl = pathToFileURL(typescript).href;
const oldCode = archive.compiled.replace(
  'from "typescript"',
  `from ${JSON.stringify(typescriptUrl)}`,
);
const oldUrl = `data:text/javascript;base64,${Buffer.from(oldCode).toString("base64")}`;
export const baseline = await import(oldUrl);
export const ts = (await import(typescript)).default;
const compiler = await dynamic("compiler/compile");

async function historical(name: string, overrides: Record<string, string>) {
  const code = await readFile(new URL(`dist/analysis/${name}.js`, root), "utf8");
  assert.equal(sha(code), archive.consumers[name], name);
  const mapped = code.replace(
    /from "([^"]+)"/gu,
    (_match: string, p: string) =>
      `from ${JSON.stringify(overrides[p] ?? (p === "typescript" ? typescriptUrl : p.startsWith(".") ? new URL(p.replace(/\.js$/u, emitted ? ".js" : ".ts"), new URL(`${emitted ? "dist" : "src"}/analysis/${name}.${emitted ? "js" : "ts"}`, root)).href : import.meta.resolve(p)))}`,
  );
  return `data:text/javascript;base64,${Buffer.from(mapped).toString("base64")}`;
}
const oldInterpret = await historical("interpret", { "./fanout-cardinality.js": oldUrl });
export const oldAnalyze = await import(
  await historical("analyze", { "./interpret.js": oldInterpret })
);
export const analyze = await dynamic("analysis/analyze");
const core = await dynamic("analysis/core");
const mermaid = await dynamic("analysis/mermaid");

export const cases = [
  { name: "literal", prefix: "", expression: "[1, 2]", expected: 2 },
  {
    name: "wrappers",
    prefix: "",
    expression: "(([1, 2] as const)! satisfies readonly number[])",
    expected: 2,
  },
  { name: "empty", prefix: "", expression: "[]", expected: null },
  { name: "hole", prefix: "", expression: "[1,,2]", expected: null },
  { name: "spread", prefix: "", expression: "[1,...[2]]", expected: null },
  { name: "const", prefix: "const xs = [1,2];", expression: "xs", expected: 2 },
  { name: "let", prefix: "let xs = [1,2];", expression: "xs", expected: null },
  {
    name: "initializer-wrappers",
    prefix: "const xs = (([1,2] as const)!);",
    expression: "xs",
    expected: 2,
  },
  { name: "push", prefix: "const xs = [1,2]; xs.push(3);", expression: "xs", expected: null },
  { name: "length", prefix: "const xs = [1,2]; xs.length = 1;", expression: "xs", expected: null },
  {
    name: "index-increment",
    prefix: "const xs = [1,2]; xs[0]++;",
    expression: "xs",
    expected: null,
  },
  {
    name: "delete-index",
    prefix: "const xs = [1,2]; delete xs[0];",
    expression: "xs",
    expected: null,
  },
  {
    name: "destructure",
    prefix: "const xs = [1,2]; [xs[0]] = [3];",
    expression: "xs",
    expected: null,
  },
  {
    name: "object-target",
    prefix: "const xs = [1,2]; ({v:xs[0]} = {v:3});",
    expression: "xs",
    expected: null,
  },
  {
    name: "name-assignment",
    prefix: "const xs = [1,2]; xs = [3];",
    expression: "xs",
    expected: null,
  },
  { name: "reverse", prefix: "const xs = [1,2]; xs.reverse();", expression: "xs", expected: null },
  {
    name: "shadow",
    prefix: "const xs = [1,2]; { const xs = [3]; xs.push(4); }",
    expression: "xs",
    expected: 2,
  },
  {
    name: "alias",
    prefix: "const xs = [1,2]; const ys = xs; ys.push(3);",
    expression: "xs",
    expected: 2,
  },
  {
    name: "nonmutator",
    prefix: "const xs = [1,2]; xs.map(x => x + 1);",
    expression: "xs",
    expected: 2,
  },
  {
    name: "wrapped-receiver",
    prefix: "const xs = [1,2]; (xs).push(3);",
    expression: "xs",
    expected: 2,
  },
  {
    name: "captured-write",
    prefix: "const xs = [1,2]; function edit() { xs[0] = 3; }",
    expression: "xs",
    expected: null,
  },
  { name: "unresolved", prefix: "", expression: "missing", expected: null },
];

export function observe(selected: any, c: (typeof cases)[number], failAt?: number) {
  const workflow = compiler.createWorkflowProgram(`${c.prefix}\nreturn ${c.expression};`);
  const body = workflow.scriptFile.statements[0].body;
  const expression = body.statements[body.statements.length - 1].expression;
  const checker = workflow.program.getTypeChecker();
  const calls: string[] = [];
  const failure = new Error("Owned checker failure");
  let ordinal = 0;
  const port = {
    get getSymbolAtLocation() {
      calls.push("get");
      return function (this: unknown, node: any) {
        assert.equal(this, port);
        calls.push(`${node.text}@${node.pos}`);
        if (++ordinal === failAt) throw failure;
        return checker.getSymbolAtLocation(node);
      };
    },
  };
  const before = workflow.scriptFile.getFullText();
  try {
    const value = selected.literalCardinality(expression, port);
    assert.equal(workflow.scriptFile.getFullText(), before);
    return { value: value ?? null, calls };
  } catch (error) {
    assert.equal(error, failure);
    return { error: failure.message, sameError: true, calls };
  }
}

export const scripts = [
  'const a = agent("Owned worker"); const xs = ["one", "two"]; return await Promise.all(xs.map(async x => await a.ask(x)));',
  'const a = agent("Owned worker"); const xs = ["one", "two"]; xs.push("three"); return await Promise.all(xs.map(async x => await a.ask(x)));',
  'const a = agent("Owned worker"); const xs = ["one", "two"]; const ys = xs; ys.push("three"); return await Promise.all(xs.map(async x => await a.ask(x)));',
];
export function consumer(selected: any, script: string) {
  const result = selected.analyzeWorkflowScript(script);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.ok(result.core.sites.fanouts.length > 0);
  return {
    cardinalities: result.core.sites.fanouts.map((site: any) => site.cardinality ?? null),
    core: core.serializeCore(result.core),
    handoff: result.handoff,
    mermaid: mermaid.handoffGraphToMermaid(result.handoff),
  };
}
