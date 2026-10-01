// Owned bounded graphs; the pinned emitted body retains inherited implementation/prose.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { current, observe, sha } from "./create-workflow-graph-fold-fixture.js";
import { errorShape } from "./workflow-run-summary-fixture.js";
export { current, observe, sha };
export const frozen = JSON.parse(
  await readFile(
    new URL("./create-workflow-graph-quotient-baseline.json", import.meta.url),
    "utf8",
  ),
);
const compiled = await readFile(
  new URL("../dist/tool/handlers/create-workflow-graph-fold.js", import.meta.url),
  "utf8",
);
const source = await readFile(
  new URL("../src/tool/handlers/create-workflow-graph-fold.ts", import.meta.url),
  "utf8",
);
const split = (text: string) => [
  text.indexOf("export function foldPhaseEdges("),
  text.indexOf("/** 同一有序对折叠成一条，首见序；"),
];
const [sourceStart, sourceEnd] = split(source);
const [compiledStart, compiledEnd] = split(compiled);
assert.ok(sourceStart >= 0 && sourceEnd > sourceStart);
assert.ok(compiledStart >= 0 && compiledEnd > compiledStart);
assert.equal(sha(source.slice(0, sourceStart)), frozen.sourceHeaderSha256);
assert.equal(sha(source.slice(sourceEnd)), frozen.sourceTailSha256);
assert.equal(sha(compiled.slice(0, compiledStart)), frozen.compiledHeaderSha256);
assert.equal(sha(compiled.slice(compiledEnd)), frozen.compiledTailSha256);
assert.equal(sha(frozen.compiledBody), frozen.compiledBodySha256);
const rebuilt =
  compiled.slice(0, compiledStart) + frozen.compiledBody + compiled.slice(compiledEnd);
assert.equal(sha(rebuilt), frozen.emittedSha256);
const baselineJs = rebuilt.replace(
  /from "([^"]+)"/gu,
  (_match, name) => `from ${JSON.stringify(import.meta.resolve(name))}`,
);
export const baseline = await import(
  `data:text/javascript;base64,${Buffer.from(baselineJs).toString("base64")}`
);
const edge = (from: string, to: string, back: any = false, extra = {}) => ({
  from,
  to,
  back,
  ...extra,
});
export const cases = [
  [
    edge("a", "b"),
    edge("b", "a"),
    edge("x", "y"),
    edge("y", "x"),
    edge("b", "x", false, { label: "first quotient edge" }),
    edge("a", "y", false, { [Symbol.for("synthetic-quotient")]: 7 }),
    edge("root", "a"),
    edge("root", "x"),
  ],
  [
    edge("a", "b"),
    edge("b", "a"),
    edge("x", "y"),
    edge("y", "x"),
    edge("b", "x", true),
    edge("a", "y"),
    edge("a", "x", true),
    edge("b", "y"),
  ],
  [edge("a b", "c"), edge("a", "b c", true), edge("c", "tail"), edge("a b", "tail")],
  [edge("a", "b", 0), edge("b", "c", "carry"), edge("a", "c", true)],
  [edge("z", "a", true), edge("a", "b", true), edge("z", "b", true), edge("u", "v")],
];
export function coercion(throwAt: number, selected = current) {
  const tape: string[] = [];
  const failure = new Error("Synthetic quotient key failure");
  const id = {
    [Symbol.toPrimitive](hint: string) {
      tape.push(hint);
      if (tape.length === throwAt) throw failure;
      return "owned-root";
    },
  };
  try {
    const output = selected.foldPhaseEdges([
      { from: id, to: "a", back: false },
      edge("a", "b"),
      { from: id, to: "b", back: false },
      edge("b", "tail"),
    ]);
    return {
      output: output.map((item: any) => ({
        ...item,
        from: item.from === id ? "#owned-id" : item.from,
        to: item.to === id ? "#owned-id" : item.to,
      })),
      tape,
    };
  } catch (error) {
    return { error: errorShape(error), sameFailure: error === failure, tape };
  }
}
