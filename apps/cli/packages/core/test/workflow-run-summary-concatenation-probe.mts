// Synthetic native string-limit probe, run separately from the ordinary focused suite.
import assert from "node:assert/strict";
import { constants } from "node:buffer";
import { summary, baselineSummary, detail, emitted } from "./workflow-run-summary-fixture.js";
const part = "s".repeat(Math.ceil(constants.MAX_STRING_LENGTH / 2));
const facts: any = {
  ...detail,
  generatedAt: 60000,
  status: "completed",
  phases: [{ state: "current", name: part }],
  artifacts: [{ id: "synthetic-id", title: part, kind: "file", primary: true }],
};
function observe(selected: any) {
  try {
    const text = selected(facts);
    return { success: true, length: text.length };
  } catch (error: any) {
    return { success: false, name: error.name, message: error.message };
  }
}
const old = observe(baselineSummary),
  current = observe(summary);
console.log(
  JSON.stringify({
    emitted,
    maxStringLength: constants.MAX_STRING_LENGTH,
    partLength: part.length,
    old,
    current,
  }),
);
assert.deepEqual(current, old);
assert.equal(old.success, false);
assert.equal((old as any).name, "RangeError");
