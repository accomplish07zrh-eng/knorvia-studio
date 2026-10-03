// Manual finite comparison driver; inherited reference modules stay outside the repository.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { ModelCatalogEntry, ListModelsOutput } from "@knorvia/contracts";
import { catalogFixture, entry, reference as modelReference } from "./model-catalog-fixture.js";

const [referencePath, listPath] = process.argv.slice(2);
if (!referencePath || !listPath)
  throw new Error("Pass exact-base temporary model-reference and ListModels module paths.");
const previousReference = await import(pathToFileURL(referencePath).href);
const previousList = (await import(pathToFileURL(listPath).href)).listModelsToolEntry;
const SEED = 0x4b4e4f52;
let state = SEED;
let resolutions = 0;
let snapshots = 0;
const digest = createHash("sha256");
function next(bound: number): number {
  state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
  return state % bound;
}
function pick<T>(values: readonly T[]): T {
  return values[next(values.length)]!;
}
const providers = ["P", " q ", "", "a$b", "a/b", "__proto__", "İ", "例"];
const names = ["M", " m ", "", "a/b", "/lead", "a$b", "$lead", "tail$", "İ", "例", "x\ny"];
const levels = [[], ["low", "HiGH", " medium "], [""], [" HIGH ", "high"], ["a$b", "$x"]];

function makeCatalog(round: number): ModelCatalogEntry[] {
  const rows: ModelCatalogEntry[] = [];
  const length = round % 64 === 0 ? 76 : next(13);
  for (let index = 0; index < length; index++) {
    const row: ModelCatalogEntry = {
      providerId: pick(providers),
      modelId: pick(names),
      reasoningLevels: [...pick(levels)],
    };
    if (next(3) === 0) row.providerLabel = pick(["", "Label", "raw\nlabel"]);
    if (next(3) === 0) row.defaultReasoningLevel = pick(["", "low", "odd", " HiGH "]);
    if (next(3) === 0) row.contextWindow = pick([0, 1, 128_000]);
    if (next(3) === 0) row.disabledReason = pick(["", "policy", "raw\nreason"]);
    if (next(4) === 0) row.current = true;
    rows.push(row);
  }
  return rows;
}

function queries(rows: ModelCatalogEntry[]): string[] {
  const values = ["missing", "", " ", "/", "$high", "tail$", "a$b/c", "P/absent$high"];
  for (const row of rows) {
    const full = `${row.providerId}/${row.modelId}`;
    values.push(row.modelId, full, ` ${full.toUpperCase()} `, `${row.modelId}$HIGH`, `${full}$odd`);
    for (const level of row.reasoningLevels)
      values.push(`${full}$${level}`, `${row.modelId}$${level}`);
  }
  return values;
}

function checkReferences(
  result: ReturnType<typeof modelReference.resolveModelReference>,
  rows: ModelCatalogEntry[],
) {
  if (result.ok) assert.equal(rows.includes(result.entry), true);
  else for (const candidate of result.candidates) assert.equal(rows.includes(candidate), true);
}

for (let round = 0; round < 512; round++) {
  const rows = makeCatalog(round);
  const before = JSON.stringify(rows);
  for (const query of queries(rows)) {
    const old = previousReference.resolveModelReference(query, rows);
    const result = modelReference.resolveModelReference(query, rows);
    assert.equal(
      JSON.stringify(result),
      JSON.stringify(old),
      `resolution ${round}: ${JSON.stringify(query)}`,
    );
    checkReferences(result, rows);
    if (result.ok) assert.equal(result.entry, old.entry);
    else
      result.candidates.forEach((candidate, index) =>
        assert.equal(candidate, old.candidates[index]),
      );
    digest.update(JSON.stringify(result));
    resolutions++;
  }
  const old = await previousList.handler({}, catalogFixture(rows).context);
  const output = (await entry.handler({}, catalogFixture(rows).context)) as ListModelsOutput;
  assert.equal(JSON.stringify(output), JSON.stringify(old), `snapshot ${round}`);
  const content = await entry.formatModelContent!(output);
  assert.equal(content, previousList.formatModelContent(old), `model content ${round}`);
  output.models.forEach((model, index) =>
    assert.notEqual(model.reasoningLevels, rows[index]!.reasoningLevels),
  );
  assert.equal(JSON.stringify(rows), before, `catalog mutation ${round}`);
  digest.update(JSON.stringify(output));
  digest.update(JSON.stringify(content));
  snapshots++;
}
console.log(JSON.stringify({ seed: SEED, resolutions, snapshots, sha256: digest.digest("hex") }));
