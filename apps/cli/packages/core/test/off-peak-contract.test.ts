// Frozen inherited observations; source exposure and retained prose are disclosed in the spec.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as contracts from "@knorvia/contracts";
import { gate } from "./tool-invocation-fixture.js";
import {
  admissionCases,
  direct,
  entries,
  errorShape,
  failureCases,
  handlers,
  observe,
  offPeak,
  rawOutcomes,
  registryModule,
  valid,
} from "./off-peak-fixture.js";

const frozen = JSON.parse(
  await readFile(new URL("./off-peak-contract.json", import.meta.url), "utf8"),
);
test("OffPeak exports, public declarations/schema identities and opt-in registry remain frozen", () => {
  assert.equal(frozen.baseline, "7b37339");
  assert.deepEqual(Object.keys(offPeak).sort(), [
    "assertNotOffPeakTurn",
    "offPeakCreateToolEntry",
    "offPeakListToolEntry",
  ]);
  for (const [operation, entry] of Object.entries(entries)) {
    const before = frozen.declarations[operation];
    assert.deepEqual(Object.keys(entry), before.keys);
    assert.deepEqual(Object.keys(entry.permission), before.permissionKeys);
    assert.deepEqual(JSON.parse(JSON.stringify(entry)), before.data);
    const prefix = operation === "create" ? "OffPeakCreate" : "OffPeakList";
    assert.equal(
      entry.inputSchema,
      contracts[`${prefix}InputJsonSchema` as keyof typeof contracts],
    );
    assert.equal(
      entry.outputSchema,
      contracts[`${prefix}OutputJsonSchema` as keyof typeof contracts],
    );
    assert.equal(
      entry.runtimeInputSchema,
      contracts[`${prefix}InputSchema` as keyof typeof contracts],
    );
    assert.equal(
      entry.runtimeOutputSchema,
      contracts[`${prefix}OutputSchema` as keyof typeof contracts],
    );
    assert.equal(
      handlers.builtInTools.find((e: typeof entry) => e.metadata.name === entry.metadata.name),
      entry,
    );
  }
  for (const includeOffPeak of [undefined, false, true]) {
    const registry = registryModule.createToolRegistry();
    handlers.registerBuiltInTools(registry, { includeOffPeak, includeDynamicWorkflow: false });
    for (const entry of Object.values(entries))
      assert.equal(registry.get(entry.metadata.name), includeOffPeak === true ? entry : undefined);
  }
});

test("31 frozen admission cases preserve ordering, normalized requests, outputs and full errors", async () => {
  assert.equal(admissionCases.length, frozen.cases.length);
  for (const [index, c] of admissionCases.entries()) {
    const original = JSON.stringify(c);
    assert.deepEqual(await observe(c), frozen.cases[index].observed, c.label);
    assert.equal(JSON.stringify(c), original, c.label);
  }
});

test("all frozen failure categories/codes/stages and malformed outcomes preserve discriminated errors", async () => {
  for (const [index, outcome] of failureCases.entries())
    assert.deepEqual(
      await observe({ label: "failure", operation: "create", input: valid }, { value: outcome }),
      frozen.failures[index].observed,
    );
  for (const [index, outcome] of rawOutcomes.entries())
    assert.deepEqual(
      await observe({ label: "raw", operation: "create", input: valid }, { value: outcome }),
      frozen.raw[index].observed,
      `raw ${index}`,
    );
});

test("idle-turn denial precedes input/port/session reads and never inspects automationTurn", async () => {
  const f = direct();
  const forbidden = () => assert.fail("denial cannot reach input or port/session");
  Object.defineProperties(f.context, {
    offPeakTurn: { value: true },
    offPeakPort: { get: forbidden },
    sessionId: { get: forbidden },
    automationTurn: { get: forbidden },
  });
  await assert.rejects(
    entries.create.handler(
      {
        get title() {
          return forbidden();
        },
      },
      f.context,
    ),
    (error) => {
      assert.equal(errorShape(error).type, contracts.CoreErrorType.PermissionDenied);
      assert.equal(errorShape(error).recoverable, false);
      return true;
    },
  );
  for (const operation of ["create", "list"] as const) {
    const ordinary = direct();
    Object.defineProperty(ordinary.context, "automationTurn", { get: forbidden });
    await entries[operation].handler(operation === "create" ? valid : {}, ordinary.context);
    assert.equal(ordinary.calls.length, 1);
  }
});

test("port receivers, argument counts, context reads and success accessor multiplicity remain frozen", async () => {
  for (const operation of ["create", "list"] as const) {
    const f = direct(),
      reads: string[] = [];
    const context = new Proxy(f.context, {
      get(target, key) {
        reads.push(String(key));
        return Reflect.get(target, key);
      },
    });
    const output = await entries[operation].handler(operation === "create" ? valid : {}, context);
    assert.deepEqual(
      reads,
      operation === "create"
        ? ["offPeakTurn", "offPeakPort", "offPeakPort", "sessionId"]
        : ["offPeakPort", "offPeakPort"],
    );
    assert.equal(f.calls[0].receiver, true);
    assert.equal(f.calls[0].args.length, operation === "create" ? 2 : 0);
    if (operation === "create") {
      assert.equal(
        (output as { task: unknown }).task,
        (f.behavior.outcome as { task: unknown }).task,
      );
      assert.notEqual(f.calls[0].args[0], valid);
    } else assert.equal((output as { tasks: unknown }).tasks, f.behavior.tasks);
  }
  const f = direct(),
    reads: string[] = [];
  const task = new Proxy((f.behavior.outcome as { task: object }).task, {
    get(target, key) {
      reads.push(String(key));
      return Reflect.get(target, key);
    },
  });
  f.behavior.outcome = {
    get ok() {
      reads.push("ok");
      return true;
    },
    get task() {
      reads.push("task");
      return task;
    },
  };
  await entries.create.handler(valid, f.context);
  assert.deepEqual(reads, [
    "ok",
    "task",
    "task",
    "queuePosition",
    "task",
    "offPeakTaskId",
    "task",
    "queuePosition",
  ]);
  delete f.context.sessionId;
  f.calls.length = 0;
  await entries.create.handler(valid, f.context);
  assert.deepEqual(Object.keys(f.calls[0].args[1] as object), ["sessionId"]);
  assert.equal((f.calls[0].args[1] as { sessionId?: string }).sessionId, undefined);
});

test("failure selection preserves lazy category/code/context read order", async () => {
  const f = direct(),
    reads: string[] = [];
  const failure = {
    ok: false,
    errorCategory: "client_validation",
    errorCode: "session_bound",
    failureStage: "client_validation",
  };
  f.behavior.outcome = new Proxy(failure, {
    get(target, key) {
      reads.push(String(key));
      return Reflect.get(target, key);
    },
  });
  Object.defineProperty(f.context, "toolCallId", {
    get() {
      reads.push("toolCallId");
      return "example-offpeak-call";
    },
  });
  await assert.rejects(entries.create.handler(valid, f.context));
  assert.deepEqual(reads, [
    "then",
    "ok",
    "errorCategory",
    "errorCode",
    "errorCode",
    "toolCallId",
    "failureStage",
    "errorCategory",
    "errorCode",
  ]);
});

test("exported guard preserves optional hint/recoverability and has no reads when turn is ordinary", () => {
  const f = direct();
  offPeak.assertNotOffPeakTurn(
    new Proxy(f.context, {
      get(_target, key) {
        assert.equal(key, "offPeakTurn");
        return false;
      },
    }),
    "ExampleTool",
    new Proxy(
      {},
      {
        get() {
          assert.fail("ordinary turn cannot inspect options");
        },
      },
    ),
  );
  f.context.offPeakTurn = true;
  for (const recoverable of [undefined, false, true])
    assert.throws(
      () =>
        offPeak.assertNotOffPeakTurn(f.context, "ExampleTool", {
          hint: "Example alternative.",
          recoverable,
        }),
      (error) => {
        assert.deepEqual(errorShape(error), {
          name: "Error",
          type: "permission_denied",
          code: "PERMISSION_DENIED",
          message:
            "ExampleTool is not allowed while running an idle-time task. Example alternative.",
          context: { toolCallId: "example-offpeak-call", toolName: "ExampleTool" },
          recoverable: recoverable ?? false,
          retryable: false,
        });
        return true;
      },
    );
});

test("port/input/accessor thrown values propagate unchanged and direct abort signals are not inspected", async () => {
  const failure = { example: "synthetic failure" };
  for (const operation of ["create", "list"] as const) {
    const f = direct();
    if (operation === "create") f.behavior.throwCreate = failure;
    else f.behavior.throwList = failure;
    await assert.rejects(
      entries[operation].handler(operation === "create" ? valid : {}, f.context),
      (error) => error === failure,
    );
    assert.equal(f.calls.length, 1);
  }
  const f = direct();
  await assert.rejects(
    entries.create.handler(
      {
        get title() {
          throw failure;
        },
      },
      f.context,
    ),
    (error) => error === failure,
  );
  Object.defineProperty(f.context, "abortSignal", {
    get() {
      assert.fail("executor owns cancellation");
    },
  });
  await entries.create.handler(valid, f.context);
  const closed = new AbortController();
  closed.abort();
  await entries.list.handler({}, { ...direct().context, abortSignal: closed.signal });
});

test("interleaved direct calls retain per-call task/session state and list ordering/duplicates", async () => {
  const first = direct(),
    second = direct(),
    entered = gate(),
    release = gate<contracts.OffPeakCreateOutcome>();
  first.port.create = async function (input, context) {
    first.calls.push({ method: "create", receiver: this === first.port, args: [input, context] });
    entered.resolve();
    return release.promise;
  };
  const pending = entries.create.handler(valid, first.context);
  await entered.promise;
  const other = await entries.create.handler(valid, second.context);
  release.resolve({
    ok: true,
    task: {
      ...contracts.OffPeakTaskSummarySchema.parse(
        (second.behavior.outcome as { task: unknown }).task,
      ),
      offPeakTaskId: "example-first",
    },
  });
  assert.equal(
    ((await pending) as { task: { offPeakTaskId: string } }).task.offPeakTaskId,
    "example-first",
  );
  assert.equal((other as { task: { offPeakTaskId: string } }).task.offPeakTaskId, "example-idle");
  second.behavior.tasks = [1, 1, 0];
  assert.equal(
    ((await entries.list.handler({}, second.context)) as { tasks: unknown }).tasks,
    second.behavior.tasks,
  );
});
