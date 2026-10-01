// Source-exposed frozen resolution contract; no blanket original/license claim.
import assert from "node:assert/strict";
import test from "node:test";
import { frozen, reference } from "./model-catalog-fixture.js";

test("model-reference exports and all fixed resolution outcomes remain frozen", () => {
  assert.deepEqual(Object.keys(reference), frozen.moduleExports);
  for (const c of frozen.referenceCases) {
    const entries = frozen.catalogs[c.catalog];
    const before = JSON.stringify(entries);
    const result = reference.resolveModelReference(c.text, entries);
    assert.equal(JSON.stringify(result), JSON.stringify(c.result), c.label);
    if (result.ok) assert.equal(result.entry, entries[c.entryIndex!], c.label);
    else
      assert.deepEqual(
        result.candidates.map((row) => entries.indexOf(row)),
        c.candidateIndices,
        c.label,
      );
    assert.equal(JSON.stringify(entries), before);
  }
});

test("canonical handler parsing preserves selections and exact wrapper/cause errors", () => {
  assert.equal(reference.parseWorkflowSubagentModel(undefined), undefined);
  for (const c of frozen.parseCases) {
    if (!c.error) assert.deepEqual(reference.parseWorkflowSubagentModel(c.canonical), c.selection);
    else
      assert.throws(
        () => reference.parseWorkflowSubagentModel(c.canonical),
        (error) => {
          assert.ok(error instanceof Error);
          assert.equal(error.name, c.error!.name);
          assert.equal(error.message, c.error!.message);
          assert.ok(error.cause instanceof Error);
          assert.equal(error.cause.name, c.error!.causeName);
          assert.equal(error.cause.message, c.error!.causeMessage);
          return true;
        },
      );
  }
});

test("description and catalog ids preserve absent/empty/raw spelling", () => {
  assert.equal(reference.describeWorkflowSubagentModel(undefined), "");
  for (const canonical of ["", "P/M$HiGH", " raw/模型 \n"]) {
    assert.equal(
      reference.describeWorkflowSubagentModel(canonical),
      ` Subagents run on ${canonical} (the main agent stays on the session model).`,
    );
  }
  for (const entry of frozen.catalogs.special)
    assert.equal(reference.formatModelCatalogId(entry), `${entry.providerId}/${entry.modelId}`);
});

test("qualified lookups do not read model names of other providers; matching failures propagate", () => {
  const unrelated = structuredClone(frozen.catalogs.basic[0]);
  const failure = new Error("example model getter failure");
  Object.defineProperty(unrelated, "modelId", {
    get: () => {
      throw failure;
    },
  });
  const target = frozen.catalogs.basic[1];
  const result = reference.resolveModelReference("Beta/reasoner", [unrelated, target]);
  assert.ok(result.ok);
  assert.equal(result.entry, target);
  assert.throws(
    () => reference.resolveModelReference("reasoner", [unrelated, target]),
    (error) => error === failure,
  );
});

test("disabled partition precedes current choice, retaining the first current duplicate", () => {
  const entries = structuredClone(frozen.catalogs.currents);
  const seen: number[] = [];
  entries.forEach((entry, index) => {
    Object.defineProperty(entry, "disabledReason", {
      get: () => {
        seen.push(index);
        return undefined;
      },
    });
    Object.defineProperty(entry, "current", {
      get: () => {
        assert.deepEqual(seen, [0, 1]);
        return true;
      },
    });
  });
  const result = reference.resolveModelReference("p/m", entries);
  assert.ok(result.ok);
  assert.equal(result.entry, entries[0]);
});
