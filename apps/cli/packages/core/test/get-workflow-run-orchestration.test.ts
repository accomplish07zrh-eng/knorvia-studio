import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { archive, clock, detail, errorShape, json } from "./workflow-run-summary-fixture.js";
import {
  baseline,
  entry,
  rowCases,
  observe,
  sha,
} from "./get-workflow-run-orchestration-fixture.js";
const gold = JSON.parse(
  await readFile(
    new URL("./get-workflow-run-orchestration-contract.json", import.meta.url),
    "utf8",
  ),
);
test("GetWorkflowRun orchestration frozen nested admission/read/native-method contracts", async () => {
  assert.equal(archive.consumer.sourceSha256, gold.baselineSourceSha256);
  assert.equal(archive.consumer.compiledSha256, gold.baselineEmittedSha256);
  for (const [i, kind] of rowCases.entries()) {
    const old = await observe(kind, baseline);
    assert.equal(sha(JSON.stringify(old)), gold.direct[i], `baseline:${kind}`);
    assert.deepEqual(await observe(kind), old, `current:${kind}`);
    assert.equal(old.calls, 1);
    assert.equal(old.clocks, 1);
  }
});
test("GetWorkflowRun orchestration immediate full call-runner valid/malformed field consumers", async () => {
  for (const [i, kind] of gold.executorCases.entries()) {
    const old = await observe(kind, baseline, true);
    assert.equal(sha(JSON.stringify(old)), gold.executor[i], `baseline:${kind}`);
    assert.deepEqual(await observe(kind, entry, true), old, `current:${kind}`);
    assert.equal(old.calls, 1);
  }
});
test("GetWorkflowRun orchestration creates own output data fields without invoking inherited setters", async () => {
  async function observe(selected: any) {
    return clock(async () => {
      const previous = Object.getOwnPropertyDescriptor(Object.prototype, "pendingQuestions"),
        failure = new Error("Synthetic inherited output setter");
      let setters = 0;
      const snapshot = {
        ...detail,
        pendingQuestions: [
          {
            qid: "synthetic-q",
            actor: "synthetic-actor",
            question: "Synthetic question?",
            askedAt: 0,
          },
        ],
      };
      const port = {
        getRunDetail(this: any, id: string) {
          assert.equal(this, port);
          assert.equal(id, "synthetic-run");
          return snapshot;
        },
      };
      Object.defineProperty(Object.prototype, "pendingQuestions", {
        configurable: true,
        set() {
          setters++;
          throw failure;
        },
      });
      try {
        try {
          const output = await selected.handler(
            { run_id: "synthetic-run" },
            {
              workingDirectory: ".",
              dynamicWorkflowRunPort: port,
            },
          );
          const descriptor = Object.getOwnPropertyDescriptor(output, "pendingQuestions");
          return { output: json(output), setters, descriptor: json(descriptor) };
        } catch (error) {
          return { error: errorShape(error), sameFailure: error === failure, setters };
        }
      } finally {
        if (previous) Object.defineProperty(Object.prototype, "pendingQuestions", previous);
        else Reflect.deleteProperty(Object.prototype, "pendingQuestions");
      }
    });
  }
  const old = await observe(baseline);
  assert.equal(old.setters, 0);
  assert.equal(old.descriptor.enumerable, true);
  assert.equal(old.descriptor.configurable, true);
  assert.equal(old.descriptor.writable, true);
  assert.deepEqual(await observe(entry), old);
});
