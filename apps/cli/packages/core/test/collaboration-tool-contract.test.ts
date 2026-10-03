import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  SendMessageInputSchema,
  SendMessageInputJsonSchema,
  SendMessageOutputSchema,
  RespondToCoordinatorInputSchema,
  RespondToCoordinatorInputJsonSchema,
  RespondToCoordinatorOutputSchema,
  SubmitResultInputSchema,
  SubmitResultInputJsonSchema,
  SubmitResultOutputSchema,
  SubmitResultOutputJsonSchema,
  CoreErrorType,
} from "@knorvia/contracts";
import {
  directCases,
  getterCases,
  formatCases,
  resultSchema,
  validInputs,
  type Operation,
} from "./collaboration-tool-cases.js";
import { verdictProbes, observeVerdictProbe } from "./collaboration-tool-verdict-probes.js";
import {
  clock,
  declaration,
  entryFor,
  errorShape,
  fixture,
  modules,
  publicDeclarations,
  observe,
  formatObservation,
  factoryObservations,
  projectionMatrix,
} from "./collaboration-tool-fixture.js";
const frozen = JSON.parse(
  await readFile(new URL("./collaboration-tool-contract.json", import.meta.url), "utf8"),
);
const operations: Operation[] = ["send", "respond", "submit"];

test("exact source/strict emitted exports, public d.ts, metadata, prose and declarations stay frozen", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(modules).map(([key, module]) => [key, Object.keys(module)])),
    frozen.exports,
  );
  assert.deepEqual(publicDeclarations, frozen.publicDeclarations);
  assert.deepEqual(
    operations.map((operation) => declaration(entryFor(operation))),
    frozen.declarations,
  );
});
test("public runtime/input/output schemas and distinct permission/timeout/turn metadata retain identity", () => {
  const schemas = [
    [SendMessageInputSchema, SendMessageInputJsonSchema, SendMessageOutputSchema],
    [
      RespondToCoordinatorInputSchema,
      RespondToCoordinatorInputJsonSchema,
      RespondToCoordinatorOutputSchema,
    ],
    [SubmitResultInputSchema, SubmitResultInputJsonSchema, SubmitResultOutputSchema],
  ];
  for (const [index, operation] of operations.entries()) {
    const entry = entryFor(operation);
    assert.equal(entry.runtimeInputSchema, schemas[index][0]);
    assert.equal(entry.inputSchema, schemas[index][1]);
    assert.equal(entry.runtimeOutputSchema, schemas[index][2]);
    assert.equal(entry.metadata.needsApproval, false);
    assert.equal(entry.permission.needsApproval, false);
    assert.equal(entry.metadata.stopTurnOnSuccess, operation === "submit" ? true : undefined);
    assert.equal(entry.metadata.concurrentSafe, operation !== "submit");
    if (operation === "submit") {
      assert.equal(entry.timeout.kind, "none");
      assert.equal(entry.outputSchema, SubmitResultOutputJsonSchema);
    } else {
      assert.equal(entry.timeout.defaultMs, 10000);
      assert.equal(entry.timeout.maxMs, 10000);
      assert.equal(entry.timeout.allowCallOverride, false);
    }
  }
});
test("typed and generic factory declarations, malformed schemas and own strict keys are frozen", () => {
  assert.deepEqual(factoryObservations(), frozen.factories);
  const generic = entryFor("submit"),
    other = modules.submit.createSubmitResultToolEntry(),
    typed = modules.submit.createSubmitResultToolEntry(resultSchema);
  assert.equal(generic.inputSchema, SubmitResultInputJsonSchema);
  assert.equal(Object.hasOwn(generic, "strict"), false);
  assert.equal(typed.strict, true);
  assert.equal(typed.handler, generic.handler);
  assert.equal(typed.formatModelContent, generic.formatModelContent);
  assert.equal(typed.runtimeInputSchema, generic.runtimeInputSchema);
  assert.equal(typed.runtimeOutputSchema, generic.runtimeOutputSchema);
  assert.notEqual(other.metadata, generic.metadata);
  assert.notEqual(other.permission, generic.permission);
  assert.notEqual(other.resultBudget, generic.resultBudget);
});
test("typed declaration retains shallow nested references and actor-frozen reuse without deep freezing", () => {
  const properties = { fictional: { type: "string" } },
    schema = { type: "object", properties, description: "First description" };
  const entry = modules.submit.createSubmitResultToolEntry(schema),
    nested = entry.inputSchema.properties.result;
  assert.equal(nested.properties, properties);
  assert.notEqual(nested, schema);
  schema.description = "Later description";
  assert.equal(nested.description, "First description");
  properties.fictional.type = "number";
  assert.equal(nested.properties.fictional.type, "number");
  assert.equal(Object.isFrozen(entry.inputSchema), false);
  assert.equal(Object.isFrozen(nested), false);
});
test("frozen direct input, operation-specific admission, malformed ports and outputs", async () => {
  await clock(async () => {
    for (const [index, c] of directCases.entries())
      assert.deepEqual(await observe(c), frozen.direct[index].observed, c.label);
  });
});
test("frozen context/method getters preserve read count, native errors and short circuits", async () => {
  await clock(async () => {
    for (const [index, { operation, fault }] of getterCases.entries())
      assert.deepEqual(
        await observe({ label: "getters", operation }, fault),
        frozen.getters[index].observed,
        JSON.stringify({ operation, fault }),
      );
  });
});
test("frozen verdict/violation getter order and malformed map receiver/results remain unchanged", async () => {
  for (const [index, probe] of verdictProbes.entries())
    assert.deepEqual(await observeVerdictProbe(probe), frozen.verdicts[index].observed, probe);
});
test("model formatting branches, retained continuations, errors and fallback strings are frozen", () => {
  for (const operation of operations)
    assert.deepEqual(
      formatCases[operation].map((value) => formatObservation(operation, value)),
      frozen.formatting[operation],
    );
  assert.deepEqual(projectionMatrix(), frozen.projectionMatrix);
  assert.equal(frozen.projectionMatrix.comparisons, 144);
});
test("all input parsing precedes throwing context/port getters and rejects extra routing keys", async () => {
  for (const operation of operations) {
    const f = fixture({ label: "schema first", operation });
    let reads = 0;
    for (const field of [
      "subagentPort",
      "coordinatorResponsePort",
      "workflowSubmitPort",
      "runtimeScope",
      "offPeakTurn",
    ])
      Object.defineProperty(f.context, field, {
        get() {
          reads++;
          throw new Error("Synthetic forbidden getter");
        },
      });
    await assert.rejects(entryFor(operation).handler(null, f.context), { name: "ZodError" });
    assert.equal(reads, 0);
    await assert.rejects(
      entryFor(operation).handler(
        {
          ...validInputs[operation],
          sessionId: "cannot-route",
          to: operation === "send" ? "synthetic-recipient" : "cannot-route",
        },
        f.context,
      ),
      { name: "ZodError" },
    );
    assert.equal(reads, 0);
  }
});
test("RespondToCoordinator scope denial skips port getter while submit_result never reads scope", async () => {
  const response = fixture({ label: "main", operation: "respond", scope: "main" });
  let reads = 0;
  Object.defineProperty(response.context, "coordinatorResponsePort", {
    get() {
      reads++;
      throw new Error("Synthetic response getter");
    },
  });
  await assert.rejects(
    entryFor("respond").handler(validInputs.respond, response.context),
    (error: any) => {
      assert.equal(error.type, CoreErrorType.ConfigurationError);
      return true;
    },
  );
  assert.equal(reads, 0);
  const submission = fixture({ label: "main actor", operation: "submit" });
  Object.defineProperty(submission.context, "runtimeScope", {
    get() {
      assert.fail("Submission cannot read runtimeScope");
    },
  });
  assert.deepEqual(await entryFor("submit").handler(validInputs.submit, submission.context), {
    status: "accepted",
  });
});
test("trace, reply and arbitrary result references remain exact without signal/routing broadening", async () => {
  for (const operation of operations) {
    const trace = { traceId: "synthetic-exact-trace", custom: "retained" },
      f = fixture({ label: "identity", operation, trace });
    if (operation !== "send")
      Object.defineProperty(f.context, "abortSignal", {
        get() {
          assert.fail("No signal read for response/submission");
        },
      });
    const output = await entryFor(operation).handler(validInputs[operation], f.context);
    assert.equal(f.rawCalls[0][0].trace, trace);
    assert.equal(f.calls[0].argc, operation === "send" ? 2 : 1);
    if (operation !== "submit") assert.equal(output, f.reply);
    if (operation === "submit") assert.equal(f.rawCalls[0][0].result, validInputs.submit.result);
  }
  const f = fixture({ label: "undefined fields", operation: "send" });
  f.context.turnId = undefined;
  f.context.abortSignal = undefined as any;
  await entryFor("send").handler(validInputs.send, f.context);
  assert.equal(Object.hasOwn(f.rawCalls[0][0], "turnId"), true);
  assert.equal(Object.hasOwn(f.rawCalls[0][0].trace, "turnId"), true);
  assert.deepEqual(Object.keys(f.rawCalls[0][1]), ["signal"]);
  assert.equal(f.rawCalls[0][1].signal, undefined);
});
test("changed port getter selects the actual second receiver and preserves method-before-request order", async () => {
  for (const operation of operations) {
    const f = fixture({ label: "changed port", operation }),
      field =
        operation === "send"
          ? "subagentPort"
          : operation === "respond"
            ? "coordinatorResponsePort"
            : "workflowSubmitPort";
    let reads = 0;
    const first = {
      [f.methodName]() {
        assert.fail("Admission port cannot deliver");
      },
    };
    Object.defineProperty(f.context, field, {
      get() {
        return ++reads === 1 ? first : f.port;
      },
    });
    await entryFor(operation).handler(validInputs[operation], f.context);
    assert.equal(reads, 2);
    assert.equal(f.calls[0].receiver, true);
    assert.equal(f.calls.length, 1);
  }
});
test("raw thrown and rejected synthetic objects preserve identity; no wrapper or retry", async () => {
  for (const operation of operations)
    for (const rejected of [false, true]) {
      const f = fixture({ label: "raw error", operation }),
        cause = { syntheticCause: true },
        original = new Error("Synthetic owned failure", { cause });
      let calls = 0;
      f.port[f.methodName] = () => {
        calls++;
        if (rejected) return Promise.reject(original);
        throw original;
      };
      await assert.rejects(
        entryFor(operation).handler(validInputs[operation], f.context),
        (error) => {
          assert.equal(error, original);
          assert.deepEqual(errorShape(error).cause, cause);
          return true;
        },
      );
      assert.equal(calls, 1);
    }
});
