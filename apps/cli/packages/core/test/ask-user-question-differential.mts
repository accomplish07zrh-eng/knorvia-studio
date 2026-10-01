// Manual finite comparison; the exact-checkpoint inherited module stays outside tracked sources.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { directContext, entry, errorShape } from "./ask-user-question-fixture.js";

const [referencePath] = process.argv.slice(2);
if (!referencePath) throw new Error("Pass the temporary exact-checkpoint AskUserQuestion module.");
const previous = (await import(pathToFileURL(referencePath).href)).askUserQuestionToolEntry;
const SEED = 0x41534b51;
let state = SEED;
const digest = createHash("sha256");
let admissions = 0,
  narrations = 0;
function next(bound: number): number {
  state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
  return state % bound;
}
function pick<T>(values: readonly T[]): T {
  return values[next(values.length)]!;
}
const text = ["", " raw ", '"quotes"', "line\nbreak", "例", "😀", "a$b", "<div>x</div>"];
async function outcome(action: () => unknown | Promise<unknown>) {
  try {
    return { value: await action() };
  } catch (error) {
    return { error: errorShape(error) };
  }
}

for (let round = 0; round < 4096; round++) {
  const questions = Array.from({ length: 1 + next(4) }, (_, index) => ({
    question: `${index}:${pick(text)}`,
    header: pick(text),
    options: Array.from({ length: 2 + next(3) }, (_, option) => ({
      label: `${option}:${pick(text)}`,
      description: pick(text),
      ...(next(3) === 0 ? { preview: pick(text) } : {}),
    })),
    ...(next(2) === 0 ? {} : { multiSelect: next(2) === 0 }),
  }));
  const answers = Object.fromEntries(
    questions
      .filter(() => next(3) !== 0)
      .reverse()
      .map((q) => [q.question, pick(text)]),
  );
  if (next(3) === 0) answers[String(next(15))] = pick(text);
  const annotations = Object.fromEntries(
    questions
      .filter(() => next(2) === 0)
      .map((q) => [q.question, { preview: pick(text), notes: pick(text) }]),
  );
  const input: Record<string, unknown> = {
    questions,
    ...(next(8) === 0 ? {} : { answers }),
    ...(next(3) === 0 ? {} : { annotations }),
    metadata: { source: "example-seeded-probe" },
  };
  if (next(12) === 0) input.extra = true;
  if (next(12) === 0) questions[0]!.options[0]!.label = "Other";
  const before = JSON.stringify(input);
  const old = await outcome(() => previous.handler(input, directContext()));
  const actual = await outcome(() => entry.handler(input, directContext()));
  assert.equal(JSON.stringify(actual), JSON.stringify(old), `admission ${round}`);
  assert.equal(JSON.stringify(input), before, `mutation ${round}`);
  digest.update(JSON.stringify(actual));
  admissions++;
  if ("value" in actual) {
    const content = await outcome(() => entry.formatModelContent!(actual.value));
    const oldContent = await outcome(() => previous.formatModelContent(old.value));
    assert.deepEqual(content, oldContent, `admitted narration ${round}`);
    digest.update(JSON.stringify(content));
    narrations++;
  }
  const raw = { questions: [...questions, { question: "toString" }], answers, annotations };
  const content = await outcome(() => entry.formatModelContent!(raw));
  assert.deepEqual(
    content,
    await outcome(() => previous.formatModelContent(raw)),
    `raw narration ${round}`,
  );
  digest.update(JSON.stringify(content));
  narrations++;
}
console.log(JSON.stringify({ seed: SEED, admissions, narrations, sha256: digest.digest("hex") }));
