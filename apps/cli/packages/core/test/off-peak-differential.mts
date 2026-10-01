// Manual finite compatibility comparison; inherited reference implementation stays outside Git.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { direct, entries, errorShape, type Operation } from "./off-peak-fixture.js";

const [referencePath] = process.argv.slice(2);
if (!referencePath) throw new Error("Pass the temporary exact-checkpoint OffPeak module.");
const previous = await import(pathToFileURL(referencePath).href);
const inherited = { create: previous.offPeakCreateToolEntry, list: previous.offPeakListToolEntry };
const SEED = 0x4f46504b;
let state = SEED,
  comparisons = 0;
const digest = createHash("sha256");
const next = (bound: number) =>
  (state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0) % bound;
function pick<T>(values: readonly T[]): T {
  return values[next(values.length)]!;
}
const strings = ["", " raw ", "example", "line\nbreak", '"quotes"', "例", "😀", "a$b"];
const categories = [
  "quota_3103",
  "eligibility_3101",
  "client_validation",
  "network",
  "invalid_response",
  "local_persist",
  "unknown",
  "toString",
  "__proto__",
  undefined,
];
const codes = [
  "model_not_allowed",
  "session_bound",
  "offpeak_disabled",
  "3103",
  "3101",
  "",
  "other",
  undefined,
];

for (let round = 0; round < 4096; round++) {
  let input: unknown = {
    title: pick(strings),
    prompt: pick(strings),
    ...(next(3) === 0
      ? { permissionMode: pick(["build", "edit", "plan", "yolo", "auto", null]) }
      : {}),
    ...(next(3) === 0 ? { model: pick(strings), thoughtLevel: pick(strings) } : {}),
  };
  if (next(9) === 0) input = pick([undefined, null, {}, [], 3]);
  if (next(9) === 0 && input && typeof input === "object") Object.assign(input, { extra: true });
  const task = {
    offPeakTaskId: pick(strings),
    title: pick(strings),
    status: pick(["queued", "paused", "running", "completed", "failed", "cancelled"]),
    createdAt: next(100),
    ...(next(3) === 0 ? {} : { queuePosition: pick([undefined, 0, -1, 2, Number.NaN, "2", null]) }),
  };
  const outcome: unknown =
    next(3) === 0
      ? {
          ok: false,
          errorCategory: pick(categories),
          errorCode: pick(codes),
          failureStage: pick([
            "client_validation",
            "ticket_request",
            "local_persist",
            "unexpected",
            undefined,
          ]),
        }
      : next(15) === 0
        ? pick([undefined, null, {}, { ok: true }])
        : { ok: true, task };
  const tasks: unknown = pick([[task, task], [], [task], undefined, null]);
  const offPeakTurn = pick([undefined, false, true]),
    automationTurn = pick([undefined, false, true]);
  const sessionId = pick([undefined, "example-session", "other-session", ""]),
    noPort = next(8) === 0;
  const failure = next(14) === 0 ? new Error("Example synthetic port rejection") : undefined;
  async function observation(operation: Operation, old: boolean) {
    const f = direct();
    f.context.offPeakTurn = offPeakTurn;
    f.context.automationTurn = automationTurn;
    f.context.sessionId = sessionId;
    if (noPort) delete f.context.offPeakPort;
    f.behavior.outcome = outcome;
    f.behavior.tasks = tasks;
    f.behavior.throwCreate = failure;
    f.behavior.throwList = failure;
    const argument = structuredClone(operation === "create" ? input : nextListInput);
    const before = JSON.stringify(argument);
    let result;
    try {
      result = {
        output: await (old ? inherited : entries)[operation].handler(argument, f.context),
      };
    } catch (error) {
      result = { error: errorShape(error) };
    }
    assert.equal(JSON.stringify(argument), before, `mutation ${round}/${operation}`);
    return JSON.stringify({ ...result, calls: f.calls });
  }
  const nextListInput = next(4) === 0 ? pick([undefined, null, { extra: true }]) : {};
  for (const operation of ["create", "list"] as const) {
    const expected = await observation(operation, true),
      actual = await observation(operation, false);
    assert.equal(actual, expected, `${round}/${operation}`);
    digest.update(actual);
    comparisons++;
  }
}
console.log(JSON.stringify({ seed: SEED, comparisons, sha256: digest.digest("hex") }));
