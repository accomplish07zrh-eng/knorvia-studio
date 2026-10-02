import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dynamic, sha } from "./causality-reduction-fixture.js";
import { assertSettlementDeclarationShape } from "./causality-order-settlement-documentation-proof.js";
export { sha };
export * from "./causality-order-settlement-cases.js";

const emitted = process.env.KNORVIA_WORKFLOW_RUN_SUMMARY_TEST_EMITTED === "1";
const root = new URL("../../dynamic-workflow/", import.meta.url);
const read = (url: URL) => readFile(url, "utf8");
export async function loadBaseline(readArchive = read) {
  const bytes = await readArchive(
    new URL("./causality-order-settlement-baseline.json", import.meta.url),
  );
  assert.equal(sha(bytes), "62a3e3eb5de6eb5ee0e56e2867494ac13cbd51aef773c978cf37ff7dd61d16ac");
  const archive = JSON.parse(bytes);
  assert.equal(sha(archive.compiled), archive.emittedSha256);
  assert.equal(sha(archive.declaration), archive.declarationSha256);
  return archive;
}
export const archive = await loadBaseline();
const pins = JSON.parse(
  await read(new URL("./causality-order-settlement-current.json", import.meta.url)),
);
export async function loadCurrent(readArtifact = read) {
  for (const [p, hash] of [
    ["src/analysis/causality-order-settle.ts", pins.sourceSha256],
    ["dist/analysis/causality-order-settle.js", pins.emittedSha256],
    ["dist/analysis/causality-order-settle.d.ts", pins.declarationSha256],
  ])
    assert.equal(sha(await readArtifact(new URL(p, root))), hash, p);
  await assertSettlementDeclarationShape(
    await readArtifact(new URL("dist/analysis/causality-order-settle.d.ts", root)),
    archive.declarationSha256,
  );
  return dynamic("analysis/causality-order-settle");
}
export const current = await loadCurrent();
function historical(name: string, code: string, overrides: Record<string, string> = {}) {
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
const oldUrl = historical("causality-order-settle", archive.compiled);
export const baseline = await import(oldUrl);
async function consumerUrl(name: string, overrides: Record<string, string>) {
  const code = await read(new URL(`dist/analysis/${name}.js`, root));
  assert.equal(sha(code), archive.consumers[name], name);
  return historical(name, code, overrides);
}
const settle = { "./causality-order-settle.js": oldUrl };
const calls = await consumerUrl("causality-order-calls", settle);
const loops = await consumerUrl("causality-order-loops", settle);
const walk = await consumerUrl("causality-order-walk", {
  ...settle,
  "./causality-order-calls.js": calls,
  "./causality-order-loops.js": loops,
});
const order = await consumerUrl("causality-order", { "./causality-order-walk.js": walk });
const interpret = await consumerUrl("interpret", { "./causality-order.js": order });
export const oldAnalyze = await import(
  await consumerUrl("analyze", { "./interpret.js": interpret })
);
export const analyze = await dynamic("analysis/analyze");
const projections = await dynamic("projections");
export const scripts = [
  'const a=agent("Owned A"); const first={steps:[a.ask("Owned first")]}; const plan=Promise.all(first.steps); const one=await plan; first.steps.push(a.ask("Owned extra")); await plan; return await a.ask(one[0]);',
  'const a=agent("Owned A"); let held=a.ask("Owned seed"); for(let i=0;i<2;i++){const previous=await held; held=a.ask(previous);} return await a.ask("Owned after");',
  'const a=agent("Owned A"); const b=agent("Owned B"); async function work(){phase("Owned inner"); return await a.ask("Owned inside");} const held=work(); const parallel=b.ask("Owned parallel"); await held; return await parallel;',
  'const a=agent("Owned A"); const held=a.ask("Owned first"); const work=held.then(async value=>a.ask(value)); return await work;',
  'const a=agent("Owned A"); const held=[a.ask("Owned first"),a.ask("Owned second")]; for await(const answer of held){await a.ask(answer);} const flag=(await a.ask("Owned flag"))?1:2; if(flag){return await a.ask("Owned guarded");} return "Owned end";',
];
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
