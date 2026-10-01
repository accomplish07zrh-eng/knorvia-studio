// Retained compatibility values are disclosed in the model catalog spec.
import assert from "node:assert/strict";
import test from "node:test";
import {
  ListModelsInputJsonSchema,
  ListModelsInputSchema,
  ListModelsOutputJsonSchema,
  ListModelsOutputSchema,
  type ListModelsOutput,
} from "@knorvia/contracts";
import {
  catalogFixture,
  entry,
  frozen,
  handlers,
  registryModule,
} from "./model-catalog-fixture.js";

test("ListModels declarations, schema identity and real registry stay frozen", () => {
  assert.equal(frozen.baseline, "0d80f9ca37b1daef162ecc69bd18f6e8fc30a146");
  assert.deepEqual(Object.keys(entry), frozen.entryKeys);
  const declaration: Record<string, unknown> = {};
  for (const key of frozen.entryKeys)
    if (
      !["handler", "formatModelContent", "runtimeInputSchema", "runtimeOutputSchema"].includes(key)
    )
      declaration[key] = entry[key as keyof typeof entry];
  assert.deepEqual(declaration, frozen.declaration);
  assert.equal(entry.inputSchema, ListModelsInputJsonSchema);
  assert.equal(entry.outputSchema, ListModelsOutputJsonSchema);
  assert.equal(entry.runtimeInputSchema, ListModelsInputSchema);
  assert.equal(entry.runtimeOutputSchema, ListModelsOutputSchema);
  assert.equal(
    handlers.builtInTools.find((tool: typeof entry) => tool.metadata.name === "ListModels"),
    entry,
  );
  for (const includeDynamicWorkflow of [undefined, true, false]) {
    const registry = registryModule.createToolRegistry();
    handlers.registerBuiltInTools(registry, { includeDynamicWorkflow });
    assert.equal(registry.get("ListModels"), includeDynamicWorkflow === false ? undefined : entry);
    const contract = registry
      .toContracts()
      .find((tool: { name: string }) => tool.name === "ListModels");
    if (includeDynamicWorkflow !== false) {
      assert.equal(contract.inputSchema, ListModelsInputJsonSchema);
      assert.equal(contract.outputSchema, ListModelsOutputJsonSchema);
      assert.deepEqual(contract.permission, frozen.declaration.permission);
      assert.equal(contract.description, entry.metadata.description);
    } else assert.equal(contract, undefined);
  }
});

test("strict empty-object admission precedes catalog-port access", async () => {
  for (const input of [undefined, null, [], "", { filter: "m" }, { limit: 1 }]) {
    const f = catalogFixture();
    Object.defineProperty(f.context, "modelCatalogPort", { get: () => assert.fail("parse first") });
    await assert.rejects(entry.handler(input, f.context), { name: "ZodError" });
    assert.deepEqual(f.calls, []);
  }
});

test("undefined catalog preserves the capability failure; malformed ports are not rescued", async () => {
  const f = catalogFixture();
  f.context.modelCatalogPort = undefined;
  assert.deepEqual(await entry.handler({}, f.context), frozen.missingPort);
  f.context.modelCatalogPort = null as never;
  await assert.rejects(entry.handler({}, f.context), { name: "TypeError" });
});

test("catalog reads are synchronous, fresh, zero-argument and retain their receiver", async () => {
  const f = catalogFixture(frozen.catalogs.basic);
  for (const key of ["workingDirectory", "traceId", "abortSignal"])
    Object.defineProperty(f.context, key, {
      get: () => assert.fail(`handler must not read ${key}`),
    });
  const pending = entry.handler({}, f.context);
  assert.deepEqual(f.calls, [[]]);
  const first = (await pending) as ListModelsOutput;
  f.state.entries = frozen.catalogs.defaults;
  const second = (await entry.handler({}, f.context)) as ListModelsOutput;
  assert.deepEqual(f.calls, [[], []]);
  assert.equal(first.models[0].modelId, "Reasoner");
  assert.equal(second.models[0].modelId, "empty");
  assert.equal(Object.hasOwn(second, "current"), false);
});

test("structured output and model text retain ordering, optional values and raw strings", async () => {
  for (const c of frozen.listCases) {
    const before = JSON.stringify(c.entries);
    const f = catalogFixture(c.entries);
    const output = (await entry.handler({}, f.context)) as ListModelsOutput;
    assert.equal(JSON.stringify(output), JSON.stringify(c.output), c.label);
    assert.equal(await entry.formatModelContent!(output), c.modelContent, c.label);
    output.models.forEach((row, index) =>
      assert.notEqual(row.reasoningLevels, c.entries[index].reasoningLevels),
    );
    assert.equal(JSON.stringify(c.entries), before);
  }
});

test("all strict output fields are validated before model formatting", async () => {
  const valid = frozen.listCases[1].output as ListModelsOutput;
  for (const invalid of [
    null,
    "",
    {},
    { models: [], extra: true },
    { models: [], current: null },
    { models: [{ ...valid.models[0], contextWindow: "1" }] },
    { models: [{ ...valid.models[0], extra: true }] },
    { models: [{ ...valid.models[0], reasoningLevels: null }] },
  ])
    assert.equal(
      await entry.formatModelContent!(invalid),
      "ListModels returned an invalid result.",
    );
});

test("catalog and formatter accessor failures retain the original thrown value", async () => {
  for (const failure of [new Error("example catalog failure"), { sentinel: "catalog" }]) {
    const f = catalogFixture();
    f.state.read = () => {
      throw failure;
    };
    await assert.rejects(entry.handler({}, f.context), (error) => error === failure);
    assert.deepEqual(f.calls, [[]]);
  }
  const failure = new Error("example output getter failure");
  const malformed = {
    get models() {
      throw failure;
    },
  };
  assert.throws(
    () => entry.formatModelContent!(malformed),
    (error) => error === failure,
  );
});

test("current lookup completes before any row projection", async () => {
  const rows = structuredClone(frozen.catalogs.basic);
  const reads: number[] = [];
  rows.forEach((row, index) => {
    const current = row.current;
    Object.defineProperty(row, "current", {
      get: () => {
        reads.push(index);
        return current;
      },
    });
    const provider = row.providerId;
    Object.defineProperty(row, "providerId", {
      get: () => {
        assert.deepEqual(reads, [0, 1]);
        return provider;
      },
    });
  });
  await entry.handler({}, catalogFixture(rows).context);
});

test("optional field access preserves the defined-value second read", async () => {
  const row = structuredClone(frozen.catalogs.basic[0]);
  const reads: string[] = [];
  const values = {
    providerLabel: "first label",
    defaultReasoningLevel: "first level",
    contextWindow: 0,
    disabledReason: undefined,
  };
  for (const [key, value] of Object.entries(values)) {
    let count = 0;
    Object.defineProperty(row, key, {
      get: () => {
        reads.push(key);
        count++;
        return count === 1 ? value : key === "contextWindow" ? 7 : `second ${key}`;
      },
    });
  }
  const output = (await entry.handler({}, catalogFixture([row]).context)) as ListModelsOutput;
  assert.deepEqual(reads, [
    "providerLabel",
    "providerLabel",
    "defaultReasoningLevel",
    "defaultReasoningLevel",
    "contextWindow",
    "contextWindow",
    "disabledReason",
  ]);
  assert.equal(output.models[0].providerLabel, "second providerLabel");
  assert.equal(output.models[0].defaultReasoningLevel, "second defaultReasoningLevel");
  assert.equal(output.models[0].contextWindow, 7);
  assert.equal(Object.hasOwn(output.models[0], "disabledReason"), false);
});

test("sparse catalog behavior retains lookup failure and late output holes", async () => {
  const row = { ...structuredClone(frozen.catalogs.basic[0]), current: true };
  const leadingHole: (typeof row)[] = [];
  leadingHole.length = 2;
  leadingHole[1] = row;
  await assert.rejects(entry.handler({}, catalogFixture(leadingHole).context), {
    name: "TypeError",
  });
  const lateHole: (typeof row)[] = [];
  lateHole.length = 2;
  lateHole[0] = row;
  const output = (await entry.handler({}, catalogFixture(lateHole).context)) as ListModelsOutput;
  assert.equal(output.models.length, 2);
  assert.equal(1 in output.models, false);
  assert.equal(await entry.formatModelContent!(output), "ListModels returned an invalid result.");
});
