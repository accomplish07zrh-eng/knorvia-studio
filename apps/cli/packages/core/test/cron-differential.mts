// Manual exposed-source comparison against an exact inherited reference outside Git.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { ToolEntry } from "../src/tool/types.js";
import {
  admissionCases,
  automation,
  direct,
  entries,
  errorShape,
  json,
  type Operation,
} from "./cron-fixture.js";
if (!process.argv[2]) throw new Error("Pass the temporary bf0cc48 reference module path");
const inherited = await import(pathToFileURL(process.argv[2]).href);
const old: Record<Operation, ToolEntry> = {
  create: inherited.cronCreateToolEntry,
  list: inherited.cronListToolEntry,
  update: inherited.cronUpdateToolEntry,
  delete: inherited.cronDeleteToolEntry,
};
const seed = 0x43524f4e;
let state = seed;
function pick<T>(values: T[]): T {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return values[state % values.length];
}
const digest = createHash("sha256");
let count = 0;
for (const operation of Object.keys(entries) as Operation[]) {
  const cases = admissionCases.filter((c) => c.operation === operation);
  for (let i = 0; i < 4096; i++) {
    const c = pick(cases),
      outcome = pick<unknown>([
        undefined,
        null,
        {},
        automation,
        {
          ...automation,
          nextRunAt: undefined,
          maxRuns: undefined,
          mode: "yolo",
          targetTaskId: "hidden",
          extra: "hidden",
        },
        {
          ...automation,
          automationId: "example-other",
          title: "",
          recurring: false,
          maxRuns: 1,
          scheduleRule: undefined,
        },
      ]);
    const list = pick<unknown>([
      [],
      [automation, automation],
      [outcome],
      null,
      undefined,
      { map: 1 },
    ]);
    const deleted = pick<unknown>([false, true, 0, 1, null, undefined, "example"]);
    const model = pick([
      undefined,
      null,
      { providerId: "example-provider", modelId: "example-model" },
      { providerId: "", modelId: "" },
    ]);
    const sessionId = pick([undefined, "", "example-session", "different-session"]);
    const failure = pick<unknown>([
      undefined,
      undefined,
      undefined,
      new Error("Example port failure"),
      "example thrown string",
    ]);
    const observe = async (entry: ToolEntry) => {
      const f = direct();
      f.behavior.result = structuredClone(outcome);
      f.behavior.list = structuredClone(list);
      f.behavior.deleted = deleted;
      f.behavior.failure = failure;
      f.context.automationTurn = c.automationTurn;
      f.context.offPeakTurn = c.offPeakTurn;
      f.context.model = model as never;
      f.context.sessionId = sessionId;
      if (c.noPort) delete f.context.automationPort;
      const input = structuredClone(c.input),
        before = structuredClone(input);
      let result;
      try {
        result = { output: await entry.handler(input, f.context) };
      } catch (error) {
        result = { error: error !== null && typeof error === "object" ? errorShape(error) : error };
      }
      assert.deepEqual(input, before);
      return json({ ...result, calls: f.calls });
    };
    const before = await observe(old[operation]),
      after = await observe(entries[operation]);
    assert.deepEqual(after, before, `${operation}/${i}/${c.label}`);
    digest.update(JSON.stringify(after));
    count++;
  }
}
process.stdout.write(
  JSON.stringify({
    mode: process.env.KNORVIA_CRON_TEST_EMITTED === "1" ? "emitted" : "source",
    baseline: "bf0cc48",
    seed,
    calls: count,
    perOperation: 4096,
    digest: digest.digest("hex"),
  }) + "\n",
);
