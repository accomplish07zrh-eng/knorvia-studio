import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatCases, projectionCases } from "./websearch-cases.js";
import { clock, observeProjection, projection, valid } from "./websearch-fixture.js";
const frozen = JSON.parse(
  await readFile(new URL("./websearch-contract.json", import.meta.url), "utf8"),
);
test("raw tool/source/summary/usage projection preserves frozen malformed and ordered observations", async () => {
  await clock(async () => {
    for (const [index, c] of projectionCases.entries())
      assert.deepEqual(
        await observeProjection(c.result),
        frozen.projections[index].observed,
        c.label,
      );
    for (const [index, output] of formatCases.entries())
      assert.equal(
        projection.formatWebSearchModelContent(output),
        frozen.formats[index],
        `format/${index}`,
      );
  });
});
test("nested source traversal retains sparse inherited slots and first-winner spelling/title", async () => {
  const values: unknown[] = [];
  values.length = 3;
  Object.setPrototypeOf(
    values,
    Object.create(Array.prototype, {
      0: { value: { url: "HTTPS://EXAMPLE.invalid/A", title: "Inherited first" } },
    }),
  );
  values[2] = { url: "https://example.invalid/a", title: "Later" };
  const observed = await clock(() =>
    observeProjection({
      text: "",
      finishReason: "stop",
      usage: {},
      toolResults: [{ output: { content: values, sources: [{ url: "https://ignored.invalid" }] } }],
    }),
  );
  assert.deepEqual(observed.output.results, [
    { url: "HTTPS://EXAMPLE.invalid/A", title: "Inherited first" },
  ]);
  assert.deepEqual(observed.output.sources, [
    { url: "HTTPS://EXAMPLE.invalid/A", title: "Inherited first" },
  ]);
});
test("result type filtering differs from source filtering and leaves take precedence over descendants", async () => {
  const output = await clock(() =>
    projection.buildWebSearchOutput(
      valid,
      {
        text: "",
        usage: {},
        toolResults: [
          {
            output: {
              url: "https://example.invalid/source",
              type: "other",
              sources: [{ url: "https://example.invalid/result" }],
            },
          },
        ],
      },
      0,
    ),
  );
  assert.deepEqual(output.results, [
    { url: "https://example.invalid/result", title: undefined, pageAge: undefined },
  ]);
  assert.deepEqual(output.sources, [
    { url: "https://example.invalid/result", title: undefined },
    { url: "https://example.invalid/source", title: undefined },
  ]);
});
test("formatter fallback retains JSON failure and does not validate/repair direct builder outputs", () => {
  const cycle: any = {};
  cycle.self = cycle;
  assert.throws(() => projection.formatWebSearchModelContent(cycle), TypeError);
  assert.throws(() => projection.formatWebSearchModelContent(1n), TypeError);
  assert.equal(projection.formatWebSearchModelContent(Symbol("synthetic")), "");
  cycle.content = [cycle];
  assert.throws(
    () =>
      projection.buildWebSearchOutput(
        valid,
        { text: "", usage: {}, toolResults: [{ output: cycle }] },
        0,
      ),
    RangeError,
  );
});
