// Frozen inherited observations; source exposure and retained prose are disclosed in the spec.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as contracts from "@knorvia/contracts";
import { gate } from "./tool-invocation-fixture.js";
import {
  admissionCases,
  cron,
  direct,
  entries,
  errorShape,
  handlers,
  json,
  observe,
  registryModule,
  valid,
} from "./cron-fixture.js";

const frozen = JSON.parse(await readFile(new URL("./cron-contract.json", import.meta.url), "utf8"));
test("Cron exports, declarations/schema identities and opt-in registry remain frozen", () => {
  assert.equal(frozen.baseline, "bf0cc48");
  assert.deepEqual(Object.keys(cron).sort(), [
    "cronCreateToolEntry",
    "cronDeleteToolEntry",
    "cronListToolEntry",
    "cronUpdateToolEntry",
  ]);
  for (const [operation, entry] of Object.entries(entries)) {
    const before = frozen.declarations[operation];
    assert.deepEqual(Object.keys(entry), before.keys);
    assert.deepEqual(Object.keys(entry.permission), before.permissionKeys);
    assert.deepEqual(json(entry), before.data);
    const prefix = `Cron${operation[0].toUpperCase()}${operation.slice(1)}`;
    for (const [key, suffix] of [
      ["inputSchema", "InputJsonSchema"],
      ["outputSchema", "OutputJsonSchema"],
      ["runtimeInputSchema", "InputSchema"],
      ["runtimeOutputSchema", "OutputSchema"],
    ] as const)
      assert.equal(entry[key], contracts[`${prefix}${suffix}` as keyof typeof contracts]);
    assert.equal(
      handlers.builtInTools.find((e: typeof entry) => e.metadata.name === entry.metadata.name),
      entry,
    );
  }
  for (const includeAutomation of [undefined, false, true]) {
    const registry = registryModule.createToolRegistry();
    handlers.registerBuiltInTools(registry, { includeAutomation, includeDynamicWorkflow: false });
    for (const entry of Object.values(entries))
      assert.equal(
        registry.get(entry.metadata.name),
        includeAutomation === true ? entry : undefined,
      );
  }
});
test("520 frozen cases preserve per-operation schema/guard order, outputs and full errors", async () => {
  assert.equal(admissionCases.length, frozen.cases.length);
  for (const [index, c] of admissionCases.entries()) {
    const before = json(c);
    assert.deepEqual(await observe(c), frozen.cases[index].observed, c.label);
    assert.deepEqual(json(c), before);
  }
});
test("automation mutation denial precedes input/port/session; offPeakTurn is never inspected", async () => {
  const forbidden = () => assert.fail("unexpected guarded read");
  for (const operation of ["create", "update", "delete"] as const) {
    const f = direct();
    Object.defineProperties(f.context, {
      automationTurn: { value: true },
      automationPort: { get: forbidden },
      model: { get: forbidden },
      sessionId: { get: forbidden },
      offPeakTurn: { get: forbidden },
    });
    await assert.rejects(
      entries[operation].handler(
        {
          get title() {
            return forbidden();
          },
        },
        f.context,
      ),
      (e) => {
        assert.equal(errorShape(e).type, contracts.CoreErrorType.PermissionDenied);
        assert.equal(errorShape(e).recoverable, false);
        assert.equal(errorShape(e).retryable, false);
        return true;
      },
    );
  }
  for (const operation of Object.keys(entries) as (keyof typeof entries)[]) {
    const f = direct();
    Object.defineProperty(f.context, "offPeakTurn", { get: forbidden });
    if (operation === "list")
      Object.defineProperty(f.context, "automationTurn", { get: forbidden });
    await entries[operation].handler(valid[operation], f.context);
    assert.equal(f.calls.length, 1);
  }
});
test("port receiver, argument counts, context reads and optional own output keys stay frozen", async () => {
  for (const operation of Object.keys(entries) as (keyof typeof entries)[]) {
    const f = direct(),
      reads: string[] = [];
    const context = new Proxy(f.context, {
      get(target, key) {
        reads.push(String(key));
        return Reflect.get(target, key);
      },
    });
    const output = await entries[operation].handler(valid[operation], context);
    assert.deepEqual(
      reads,
      operation === "create"
        ? ["automationTurn", "automationPort", "automationPort", "model", "sessionId"]
        : operation === "list"
          ? ["automationPort", "automationPort"]
          : ["automationTurn", "automationPort", "automationPort"],
    );
    assert.equal(f.calls[0].receiver, true);
    assert.equal(f.calls[0].args.length, operation === "create" ? 2 : operation === "list" ? 0 : 1);
    if (operation !== "list") assert.notEqual(f.calls[0].args[0], valid[operation]);
    if (operation === "create" || operation === "update")
      assert.deepEqual(Object.keys((output as { automation: object }).automation), [
        "automationId",
        "title",
        "cronExpr",
        "prompt",
        "enabled",
        "lifecycleStatus",
        "nextRunAt",
        "lastRunAt",
        "runCount",
        "recurring",
        "maxRuns",
        "scheduleRule",
      ]);
  }
  const f = direct(),
    reads: string[] = [];
  Object.defineProperty(f.context, "model", {
    get() {
      reads.push("model");
      return { providerId: "runtime-provider", modelId: "runtime-model" };
    },
  });
  delete f.context.sessionId;
  await entries.create.handler(valid.create, f.context);
  assert.deepEqual(reads, ["model", "model", "model"]);
  assert.deepEqual(f.calls[0].args[1], {
    model: "runtime-provider/runtime-model",
    sessionId: undefined,
  });
  assert.deepEqual(Object.keys(f.calls[0].args[1] as object), ["model", "sessionId"]);
});
test("projection accessor order, list duplicates and delete truthiness remain frozen", async () => {
  const f = direct(),
    reads: string[] = [];
  f.behavior.result = new Proxy(f.behavior.result as object, {
    get(target, key) {
      reads.push(String(key));
      return Reflect.get(target, key);
    },
  });
  await entries.create.handler(valid.create, f.context);
  assert.deepEqual(reads, [
    "then",
    "automationId",
    "title",
    "cronExpr",
    "prompt",
    "enabled",
    "lifecycleStatus",
    "nextRunAt",
    "lastRunAt",
    "runCount",
    "recurring",
    "maxRuns",
    "scheduleRule",
    "automationId",
  ]);
  for (const deleted of [false, true, 0, 1, "example", null, undefined]) {
    f.behavior.deleted = deleted;
    const output = (await entries.delete.handler(valid.delete, f.context)) as {
      deleted: unknown;
      message: string;
    };
    assert.equal(output.deleted, deleted);
    assert.equal(
      output.message,
      deleted
        ? "Deleted automation example-id."
        : "Automation example-id was not found in the current workspace.",
    );
  }
  const result = (await entries.list.handler({}, f.context)) as { automations: object[] };
  assert.equal(result.automations.length, 2);
  assert.notEqual(result.automations[0], result.automations[1]);
  assert.deepEqual(result.automations[0], result.automations[1]);
});
test("port throws retain identity; malformed responses are direct-handler failures; abort is executor-owned", async () => {
  const failure = { example: "synthetic throw" };
  for (const operation of Object.keys(entries) as (keyof typeof entries)[]) {
    const f = direct();
    f.behavior.failure = failure;
    await assert.rejects(
      entries[operation].handler(valid[operation], f.context),
      (e) => e === failure,
    );
    assert.equal(f.calls.length, 1);
    f.behavior.failure = undefined;
    Object.defineProperty(f.context, "abortSignal", {
      get() {
        assert.fail("direct handler cannot inspect abort");
      },
    });
    await entries[operation].handler(valid[operation], f.context);
  }
  for (const operation of ["create", "update", "list"] as const) {
    const f = direct();
    f.behavior.result = null;
    f.behavior.list = null;
    await assert.rejects(entries[operation].handler(valid[operation], f.context), TypeError);
  }
});
test("interleaved effects retain per-call session/result state without extra writes", async () => {
  const first = direct(),
    other = direct(),
    entered = gate(),
    release = gate<contracts.CronAutomation>();
  first.port.create = async function (input, context) {
    first.calls.push({ method: "create", receiver: this === first.port, args: [input, context] });
    entered.resolve();
    return release.promise;
  };
  first.context.sessionId = "first-session";
  const pending = entries.create.handler(valid.create, first.context);
  await entered.promise;
  const second = await entries.update.handler(valid.update, other.context);
  release.resolve({
    ...(other.behavior.result as contracts.CronAutomation),
    automationId: "first-id",
  });
  assert.equal(
    ((await pending) as { automation: contracts.CronAutomation }).automation.automationId,
    "first-id",
  );
  assert.equal(
    (second as { automation: contracts.CronAutomation }).automation.automationId,
    "example-id",
  );
  assert.deepEqual(first.calls[0].args[1], { sessionId: "first-session" });
  assert.equal(first.calls.length, 1);
  assert.equal(other.calls.length, 1);
});
