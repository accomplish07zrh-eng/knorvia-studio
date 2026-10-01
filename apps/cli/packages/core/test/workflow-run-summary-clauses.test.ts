import assert from "node:assert/strict";
import test from "node:test";
import { baselineSummary, summary, detail, errorShape } from "./workflow-run-summary-fixture.js";

function observe(kind: string, selected: any) {
  const tape: any[] = [];
  const failure = new Error("Synthetic clause boundary failure");
  const run: any = {
    ...detail,
    generatedAt: 60000,
    usage: { ...detail.usage },
    health: { ...detail.health },
    phases: [],
    artifacts: [],
  };
  const getter = (target: any, key: string, values: any[], label = key) => {
    let n = 0;
    Object.defineProperty(target, key, {
      configurable: true,
      get() {
        tape.push(`${label}:${n}`);
        return values[Math.min(n++, values.length - 1)];
      },
    });
  };
  const coercion = (label: string, value: any, throws = false) => ({
    [Symbol.toPrimitive](hint: string) {
      tape.push(`${label}:${hint}`);
      if (throws) throw failure;
      return value;
    },
  });
  switch (kind) {
    case "status":
      getter(run, "status", ["completed", "stopped", "stopped", "completed"]);
      getter(run, "stopReason", ["provider", "user"]);
      getter(run, "updatedAt", [1000, 2000]);
      break;
    case "state": {
      const phase = { name: "Synthetic changing phase" };
      getter(phase, "state", ["unfinished", "current"], "phase.state");
      const actorA = {},
        actorB = {};
      getter(actorA, "state", ["parked", "waiting"], "actorA.state");
      getter(actorB, "state", ["waiting", "none", "parked"], "actorB.state");
      run.phases = [phase];
      run.subagents = [actorA, actorB];
      break;
    }
    case "failed":
      run.status = "completed";
      getter(run.usage, "nodesFailed", [0, 3, coercion("failed", 4)]);
      getter(run.usage, "spentTokens", [8]);
      break;
    case "running":
      getter(run.usage, "nodesRunning", [1, coercion("running", 2)]);
      getter(run, "subagents", [
        [
          {
            get state() {
              tape.push("actor.state");
              return "executing";
            },
          },
        ],
      ]);
      getter(run.usage, "nodesObserved", [5]);
      break;
    case "running-throw":
      getter(run.usage, "nodesRunning", [1, coercion("running", 2, true)]);
      getter(run, "subagents", [[]]);
      break;
    case "leftover":
      run.status = "stopped";
      getter(run.health, "leftoverRunning", [coercion("leftover", 1)]);
      getter(run.usage, "nodesObserved", [5]);
      break;
    case "title-throw":
      run.status = "completed";
      run.artifacts = [
        {
          primary: true,
          title: coercion("title", "Synthetic title", true),
          get kind() {
            tape.push("artifact.kind");
            return "file";
          },
        },
      ];
      break;
    case "code-throw":
      run.status = "errored";
      run.error = { code: coercion("code", "synthetic_code", true) };
      getter(run, "pendingQuestions", [[]]);
      break;
    case "error-reread":
      run.status = "errored";
      getter(run, "error", [{ code: "synthetic_code" }, undefined]);
      break;
    case "question-symbol":
      run.pendingQuestions = { length: Symbol("synthetic_count") };
      break;
    case "method": {
      const phases: any = [{ name: "Synthetic phase", state: "current" }];
      phases.findIndex = function (this: any, predicate: any) {
        tape.push(["findIndex", this === phases, predicate.length, predicate.name]);
        return Array.prototype.findIndex.call(this, predicate);
      };
      const artifacts: any = [{ title: "Synthetic title", kind: "file", primary: true }];
      artifacts.find = function (this: any, predicate: any) {
        tape.push(["find", this === artifacts, predicate.length, predicate.name]);
        return Array.prototype.find.call(this, predicate);
      };
      run.status = "completed";
      run.phases = phases;
      run.artifacts = artifacts;
      break;
    }
    case "index-coercion":
      run.phases = {
        length: 1,
        findIndex() {
          tape.push("findIndex");
          return coercion("index", -1);
        },
      };
      break;
    default:
      throw new Error("Unknown owned fixture");
  }
  try {
    return { text: selected(run), tape };
  } catch (error) {
    return { error: errorShape(error), sameFailure: error === failure, tape };
  }
}
const kinds = [
  "status",
  "state",
  "failed",
  "running",
  "running-throw",
  "leftover",
  "title-throw",
  "code-throw",
  "error-reread",
  "question-symbol",
  "method",
  "index-coercion",
];
test("Clause programs preserve changed getter/coercion/native-method decision boundaries", () => {
  for (const kind of kinds)
    assert.deepEqual(observe(kind, summary), observe(kind, baselineSummary), kind);
});
test("Clause programs keep coercion failure before deferred downstream reads", () => {
  for (const [kind, forbidden] of [
    ["running-throw", "subagents:0"],
    ["title-throw", "artifact.kind"],
    ["code-throw", "pendingQuestions:0"],
  ]) {
    const old = observe(kind, baselineSummary);
    assert.equal(old.sameFailure, true);
    assert.equal(old.tape.includes(forbidden), false);
    assert.deepEqual(observe(kind, summary), old);
  }
});
