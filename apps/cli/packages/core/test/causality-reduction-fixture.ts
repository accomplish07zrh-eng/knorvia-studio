// Owned finite graphs; archived implementation/prose and fixed API kinds remain attributed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import dns from "node:dns";
import { assertDeclarationShape } from "./causality-reduction-documentation-proof.js";
import { verifyCurrentArtifacts } from "./current-artifact-receipt-20261003.js";
export const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const emitted = process.env.KNORVIA_WORKFLOW_RUN_SUMMARY_TEST_EMITTED === "1";
const forbiddenNetwork = () => {
  throw new Error("Only owned synthetic graph data is allowed");
};
globalThis.fetch = forbiddenNetwork as typeof fetch;
for (const target of [dns, dns.promises] as any[])
  for (const method of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny"])
    target[method] = forbiddenNetwork;
const root = new URL("../../dynamic-workflow/", import.meta.url);
const archive = JSON.parse(
  await readFile(new URL("./causality-reduction-baseline.json", import.meta.url), "utf8"),
);
const pins = JSON.parse(
  await readFile(new URL("./causality-reduction-current.json", import.meta.url), "utf8"),
);
const read = (url: URL) => readFile(url, "utf8");
export async function dynamic(name: string) {
  const url = new URL(`${emitted ? "dist" : "src"}/${name}.${emitted ? "js" : "ts"}`, root);
  if (emitted) await read(url);
  return import(url.href);
}
export async function loadCurrent(readArtifact = read) {
  for (const [path, pin] of [
    ["src/analysis/causality-reduce.ts", pins.sourceSha256],
    ["dist/analysis/causality-reduce.js", pins.emittedSha256],
    ["dist/analysis/causality-reduce.d.ts", pins.declarationSha256],
  ])
    assert.equal(sha(await readArtifact(new URL(path, root))), pin, path);
  await assertDeclarationShape(
    await readArtifact(new URL("dist/analysis/causality-reduce.d.ts", root)),
    archive.declarationSha256,
  );
  return dynamic("analysis/causality-reduce");
}
export const current = await loadCurrent();
assert.equal(sha(archive.compiled), archive.emittedSha256);
const oldUrl = `data:text/javascript;base64,${Buffer.from(archive.compiled).toString("base64")}`;
export const baseline = await import(oldUrl);
async function historical(name: string, overrides: Record<string, string>) {
  const url = new URL(`dist/analysis/${name}.js`, root),
    code = await read(url);
  assert.equal(sha(code), archive.consumers[name], name);
  const mapped = code.replace(/from "([^"]+)"/gu, (_match, p: string) => {
    const target =
      overrides[p] ??
      (p.startsWith(".")
        ? new URL(
            p.replace(/\.js$/u, emitted ? ".js" : ".ts"),
            new URL(`${emitted ? "dist" : "src"}/analysis/${name}.${emitted ? "js" : "ts"}`, root),
          ).href
        : import.meta.resolve(p));
    return `from ${JSON.stringify(target)}`;
  });
  return `data:text/javascript;base64,${Buffer.from(mapped).toString("base64")}`;
}
const oldPhase = await historical("phase-graph", { "./causality-reduce.js": oldUrl });
const oldGraph = await historical("causality-graph", {
  "./causality-reduce.js": oldUrl,
  "./phase-graph.js": oldPhase,
});
export const oldAnalyze = await import(
  await historical("analyze", { "./causality-graph.js": oldGraph })
);
export const analyze = await dynamic("analysis/analyze");
export const phase = await dynamic("analysis/phase-graph");
export const oldPhaseModule = await import(oldPhase);
const foldUrl = new URL(
  `../${emitted ? "dist" : "src"}/tool/handlers/create-workflow-graph-fold.${emitted ? "js" : "ts"}`,
  import.meta.url,
);
if (emitted) await read(foldUrl);
// 当前 graph closure 用固定 receipt 验证；旧调用者不能从 live dist 取字节。
const graphContractText = await read(
  new URL("./create-workflow-graph-loader-contract.json", import.meta.url),
);
const graphContract = JSON.parse(graphContractText);
const graphFiles: Record<string, string> = {};
for (const role of ["fold", "bounds", "analysis"]) {
  const record = graphContract.current[role];
  for (const [directory, extension, pin] of [
    ["src", ".ts", record.sourceSha256],
    ["dist", ".js", record.emittedSha256],
    ["dist", ".d.ts", record.declarationSha256],
  ])
    graphFiles[`${directory}/tool/handlers/${record.module}${extension}`] = pin;
}
await verifyCurrentArtifacts(
  "create-workflow-graph-loader-contract.json",
  graphContractText,
  graphFiles,
  new URL("../", import.meta.url),
  read,
);
export const fold = await import(foldUrl.href);
const foldHistoryText = await read(
  new URL("./causality-fold-caller-history-20261003.json", import.meta.url),
);
assert.equal(
  sha(foldHistoryText),
  "ff6c7443b825ddfe970d1c5a23999eeaef5b5cb5a0d6c031838d52b9f907ab42",
);
const foldHistory = JSON.parse(foldHistoryText);
assert.equal(foldHistory.baseline, archive.baseline);
assert.equal(
  foldHistory.sourceSha256,
  "961359a02ad773a24d72c4eb8eaa5ee18c7c4f70ee349f3dc5d51fc16d8723d6",
);
const foldJs = foldHistory.compiled;
assert.equal(sha(foldJs), foldHistory.compiledSha256);
assert.equal(sha(foldJs), archive.consumers["cli-fold"]);
export const oldFold = await import(
  `data:text/javascript;base64,${Buffer.from(foldJs.replace('from "@knorvia/dynamic-workflow/projections"', `from ${JSON.stringify(oldUrl)}`)).toString("base64")}`
);

export const edge = (from: string, to: string, kind: string, carryOf?: string): any => ({
  from,
  to,
  kind,
  ...(carryOf === undefined ? {} : { carryOf }),
});
export const kinds = ["data", "control", "fifo", "seq"];
export function lattice(target: string, hop: string) {
  return [edge("a", "c", target), edge("a", "b", hop), edge("b", "c", hop)];
}
const alias = edge("a", "c", "data"),
  parallelCarry = edge("a", "c", "carry", "seq");
export const graphs: { name: string; edges: any[] }[] = [
  { name: "empty", edges: [] },
  {
    name: "mixed-hard",
    edges: [edge("a", "c", "data"), edge("a", "b", "control"), edge("b", "c", "data")],
  },
  {
    name: "weak-last-hop",
    edges: [edge("a", "c", "fifo"), edge("a", "b", "data"), edge("b", "c", "seq")],
  },
  {
    name: "self-forward",
    edges: [edge("a", "a", "data"), edge("a", "b", "data"), edge("b", "a", "data")],
  },
  {
    name: "cycle-greedy",
    edges: [
      edge("a", "b", "data"),
      edge("a", "c", "data"),
      edge("c", "b", "data"),
      edge("b", "c", "data"),
    ],
  },
  {
    name: "cycle-reordered",
    edges: [
      edge("a", "c", "data"),
      edge("a", "b", "data"),
      edge("c", "b", "data"),
      edge("b", "c", "data"),
    ],
  },
  { name: "parallel-forward", edges: [edge("a", "b", "data"), edge("a", "b", "control")] },
  { name: "alias-forward", edges: [alias, alias] },
  { name: "alias-deletion", edges: [alias, edge("a", "b", "data"), edge("b", "c", "data"), alias] },
  {
    name: "certainty-ignored",
    edges: [
      { ...edge("a", "c", "data"), certainty: "always", extra: { owned: true } },
      { ...edge("a", "b", "control"), certainty: "maybe" },
      edge("b", "c", "data"),
    ],
  },
  {
    name: "carry-prefix",
    edges: [edge("a", "b", "seq"), edge("b", "c", "carry", "seq"), edge("a", "c", "carry", "seq")],
  },
  {
    name: "carry-suffix",
    edges: [edge("a", "b", "carry", "seq"), edge("b", "c", "seq"), edge("a", "c", "carry", "seq")],
  },
  {
    name: "carry-default-hard",
    edges: [edge("a", "b", "seq"), edge("b", "c", "carry", "seq"), edge("a", "c", "carry")],
  },
  {
    name: "carry-default-witness",
    edges: [edge("a", "b", "control"), edge("b", "c", "carry"), edge("a", "c", "carry")],
  },
  {
    name: "zero-carry",
    edges: [edge("a", "b", "data"), edge("b", "c", "data"), edge("a", "c", "carry")],
  },
  {
    name: "two-carries",
    edges: [
      edge("a", "b", "carry", "seq"),
      edge("b", "c", "carry", "seq"),
      edge("a", "c", "carry", "seq"),
    ],
  },
  {
    name: "weak-carry",
    edges: [edge("a", "b", "data"), edge("b", "c", "carry", "seq"), edge("a", "c", "carry")],
  },
  {
    name: "weak-carry-suffix",
    edges: [edge("a", "b", "carry"), edge("b", "c", "seq"), edge("a", "c", "carry")],
  },
  { name: "parallel-carry", edges: [parallelCarry, edge("a", "c", "carry", "seq")] },
  { name: "alias-carry", edges: [parallelCarry, parallelCarry] },
  {
    name: "alias-carry-deletion",
    edges: [parallelCarry, parallelCarry, edge("a", "c", "carry", "seq")],
  },
  { name: "self-carry", edges: [edge("a", "a", "carry")] },
  {
    name: "cyclic-carry",
    edges: [
      edge("a", "b", "seq"),
      edge("b", "a", "seq"),
      edge("a", "a", "carry", "seq"),
      edge("b", "a", "carry", "seq"),
    ],
  },
];
export function indices(selected: any, input: any[]) {
  return selected.reduceOrdering(input).map((value: any) => {
    const index = input.indexOf(value);
    assert.ok(index >= 0);
    return index;
  });
}
export function phaseInput(edges = graphs[10]!.edges): any[] {
  const ids = ["a", "b", "c"],
    steps = ids.map((id) => ({
      id,
      kind: "ask",
      lane: "owned",
      region: "root",
      certainty: "always",
      label: id,
      loc: { line: 1, column: 1 },
    }));
  const events = ids.map((step) => ({ at: "issue", step, phase: step, regions: [] }));
  const claims = phase.collectPhaseClaims(events, new Set(ids), () => true, new Set());
  return [
    {
      steps,
      edges: edges.map((e) => ({ ...e, certainty: "always" })),
      lanes: [{ id: "owned" }],
      regions: [],
    },
    ids.map((id) => ({ id, name: `Synthetic ${id}`, loc: { line: 1, column: 1 } })),
    claims,
    edges.map((e) => ({ ...e, certainty: "always" })),
    () => true,
  ];
}
export const scripts = [
  'const a = agent("Synthetic alpha"); const b = agent("Synthetic beta"); phase("First"); const x = await a.ask("Owned first"); phase("Second"); const y = await b.ask(`Owned second ${x}`); phase("Third"); return await a.ask(`Owned third ${x} ${y}`);',
  'const a = agent("Synthetic loop"); let value = "owned seed"; for (let i = 0; i < 2; i++) { phase("Round"); value = await a.ask(value); } phase("Done"); return value;',
];
export function analysis(selected: any, script: string) {
  const { core: _core, ...result } = selected.analyzeWorkflowScript(script);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result;
}
