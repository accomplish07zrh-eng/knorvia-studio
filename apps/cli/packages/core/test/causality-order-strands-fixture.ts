import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import dns from "node:dns";
import { readFile } from "node:fs/promises";
import ts from "typescript";

export const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const emitted = process.env.KNORVIA_WORKFLOW_RUN_SUMMARY_TEST_EMITTED === "1";
const root = new URL("../../dynamic-workflow/", import.meta.url);
const read = (url: URL) => readFile(url, "utf8");
const forbiddenNetwork = () => {
  throw new Error("Only owned synthetic strand data is allowed");
};
globalThis.fetch = forbiddenNetwork as typeof fetch;
for (const port of [dns, dns.promises] as any[])
  for (const method of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny"])
    port[method] = forbiddenNetwork;

export async function loadBaseline(readArchive = read) {
  const text = await readArchive(
    new URL("./causality-order-strands-baseline.json", import.meta.url),
  );
  assert.equal(sha(text), "c1f55bc621e6a5b5f71937592c272024f86d3c366c45a0da76b76faf342742d8");
  const archive = JSON.parse(text);
  assert.equal(sha(archive.compiled), archive.emittedSha256);
  assert.equal(sha(archive.declaration), archive.declarationSha256);
  return archive;
}
export const archive = await loadBaseline();
const selector = await read(new URL("./causality-order-strands-current.json", import.meta.url));
assert.equal(sha(selector), "8a9abee12922e74dcfcbfaa93ba3e3e18cd56730dfe56a973777d62b2eb52e1d");
export const pins: { files: Record<string, string> } = JSON.parse(selector);
async function dynamic(name: string) {
  const url = new URL(`${emitted ? "dist" : "src"}/${name}.${emitted ? "js" : "ts"}`, root);
  await read(url);
  return import(url.href);
}
export async function loadCurrent(readArtifact = read) {
  for (const [path, pin] of Object.entries(pins.files))
    assert.equal(sha(await readArtifact(new URL(path, root))), pin, path);
  assert.equal(
    await readArtifact(new URL("dist/analysis/causality-order-strands.d.ts", root)),
    archive.declaration,
    "unchanged public declaration bytes",
  );
  return dynamic("analysis/causality-order-strands");
}
export const current = await loadCurrent();
export const actual = await dynamic("analysis/causality-order-strands");

function historical(name: string, code: string, overrides: Record<string, string> = {}) {
  const mapped = code.replace(/from "([^"]+)"/gu, (_match, path: string) => {
    const target =
      overrides[path] ??
      (path.startsWith(".")
        ? new URL(
            path.replace(/\.js$/u, emitted ? ".js" : ".ts"),
            new URL(`${emitted ? "dist" : "src"}/analysis/${name}.${emitted ? "js" : "ts"}`, root),
          ).href
        : import.meta.resolve(path));
    return `from ${JSON.stringify(target)}`;
  });
  return `data:text/javascript;base64,${Buffer.from(mapped).toString("base64")}`;
}
const oldStrands = historical("causality-order-strands", archive.compiled);
export const baseline = await import(oldStrands);
async function caller(name: string, overrides: Record<string, string>) {
  const path = `dist/analysis/${name}.js`,
    code = await read(new URL(path, root));
  assert.equal(sha(code), archive.dependencies[path], path);
  return historical(name, code, overrides);
}
const strandImports = { "./causality-order-strands.js": oldStrands };
const oldState = await caller("causality-order-state", strandImports);
const oldSettle = await caller("causality-order-settle", strandImports);
const stateAndSettle = {
  ...strandImports,
  "./causality-order-state.js": oldState,
  "./causality-order-settle.js": oldSettle,
};
const oldCalls = await caller("causality-order-calls", stateAndSettle);
const oldLoops = await caller("causality-order-loops", stateAndSettle);
const oldWalk = await caller("causality-order-walk", {
  ...stateAndSettle,
  "./causality-order-calls.js": oldCalls,
  "./causality-order-loops.js": oldLoops,
});
const oldOrder = await caller("causality-order", {
  "./causality-order-state.js": oldState,
  "./causality-order-walk.js": oldWalk,
});
const oldInterpret = await caller("interpret", { "./causality-order.js": oldOrder });
export const oldAnalyze = await import(await caller("analyze", { "./interpret.js": oldInterpret }));
export const analyze = await dynamic("analysis/analyze");
const projections = await dynamic("projections");
export function consumer(selected: any, script: string) {
  const result = selected.analyzeWorkflowScript(script);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return {
    core: projections.serializeCore(result.core),
    causality: result.causality,
    flow: result.flow,
    handoff: result.handoff,
    mermaid: projections.causalityGraphToMermaid(result.causality),
  };
}
export const scripts = [
  'const a=agent("Owned A"); const b=agent("Owned B"); async function work(){return await a.ask("Owned inner");} const held=work(); const parallel=b.ask("Owned parallel"); await held; await held; return await parallel;',
  'const a=agent("Owned A"); async function work(label:string){return await a.ask(label);} const held=[work("Owned first"),work("Owned second")]; const answer=await Promise.all(held); for await(const value of held){await a.ask(value);} return answer;',
  'const a=agent("Owned A"); async function work(){const held=a.ask("Owned seed"); return await held.then(async value=>a.ask(value));} return await work();',
];

export function operand(text: string) {
  const file = ts.createSourceFile(
    "owned.ts",
    `const value = ${text};`,
    ts.ScriptTarget.Latest,
    true,
  );
  return (file.statements[0] as ts.VariableStatement).declarationList.declarations[0]!.initializer!;
}
export function record(region: string, at: number, issued: string[] = [], closed = true) {
  return { region, at, issued: new Set(issued), closed, summary: new Set<string>() };
}
export function state(): any {
  return {
    frames: [{ region: "root", settled: new Set<string>() }],
    strands: [],
    joined: new Set<string>(),
    strandsBySymbol: new Map(),
    checker: {
      getSymbolAtLocation() {
        return undefined;
      },
    },
    program: {
      isSourceFileDefaultLibrary() {
        return false;
      },
    },
  };
}
