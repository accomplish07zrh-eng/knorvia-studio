import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CoreErrorType, SessionEventType } from "@knorvia/contracts";
import { gate } from "./tool-invocation-fixture.js";
import {
  executorCases,
  names,
  outputs,
  resultSchema,
  validInputs,
  violations,
  type Operation,
} from "./collaboration-tool-cases.js";
import {
  batch,
  clock,
  createToolRegistry,
  entryFor,
  executeToolCall,
  executorFixture,
  handlers,
  json,
  modules,
  observeExecutor,
  permissionObservations,
  registryObservation,
  registryVariants,
  scheduler,
  withTerminalToolTurnStop,
} from "./collaboration-tool-fixture.js";
const frozen = JSON.parse(
  await readFile(new URL("./collaboration-tool-contract.json", import.meta.url), "utf8"),
);
const operations: Operation[] = ["send", "respond", "submit"];

test("real registry flags, typed/generic declarations and provider contracts match frozen consumers", () => {
  assert.deepEqual(registryVariants.map(registryObservation), frozen.registry);
  const registry = createToolRegistry();
  handlers.registerBuiltInTools(registry, {
    allowedTools: Object.values(names),
    includeSendMessage: true,
    includeRespondToCoordinator: true,
    includeSubmitResult: true,
    submitResultSchema: resultSchema,
  });
  for (const operation of operations)
    assert.equal(registry.get(names[operation]).handler, entryFor(operation).handler);
  assert.equal(registry.get(names.submit).strict, true);
  assert.equal(
    registry.toContracts().find((c: any) => c.name === names.submit).inputSchema,
    registry.get(names.submit).inputSchema,
  );
  assert.equal(entryFor("send").aliases, undefined);
  assert.equal(entryFor("respond").aliases, undefined);
  assert.equal(entryFor("submit").aliases, undefined);
});
test("actual source/strict emitted executor freezes errors, output, display, hooks, trace and terminal facts", async () => {
  await clock(async () => {
    for (const [index, { c, decision, typed }] of executorCases.entries())
      assert.deepEqual(
        await observeExecutor(c, decision, typed),
        frozen.executor[index].observed,
        c.label,
      );
  });
});
test("existing PermissionService preserves every mode/scope/deny decision and approval metadata", () => {
  assert.deepEqual(permissionObservations(), frozen.permissions);
  assert.equal(frozen.permissions.length, 60);
});
test("terminal control is success-only and metadata-driven; failed delivery remains nonterminal", () => {
  for (const operation of operations)
    for (const success of [true, false]) {
      const original = {
        success,
        toolCallId: "synthetic",
        toolName: names[operation],
        output: null,
      };
      const result = withTerminalToolTurnStop(original, { entry: entryFor(operation) });
      if (operation === "submit" && success)
        assert.deepEqual(result.turnControl, {
          reason: "subagent_terminal",
          stopTurnAfterResult: true,
        });
      else {
        assert.equal(result, original);
        assert.equal(result.turnControl, undefined);
      }
    }
});
test("generic engine rejection permits a separate repaired submission without declaration changes", async () => {
  await clock(async () => {
    const f = executorFixture({ label: "repair", operation: "submit" }),
      schema = f.entry.inputSchema;
    let count = 0;
    f.direct.port.respond = async function (request: any) {
      assert.equal(this, f.direct.port);
      assert.equal(request.result, f.call.input.result);
      count++;
      return count === 1 ? { accept: false, violations } : { accept: true };
    };
    const first = await f.execute();
    assert.equal(first.success, false);
    assert.equal(first.error.code, "1");
    assert.equal(first.turnControl, undefined);
    assert.equal(
      first.modelContent,
      "<tool_use_error>The submitted result does not match the required schema:\n$.syntheticValue: expected string, got number</tool_use_error>",
    );
    f.call.id = "synthetic-repaired-call" as any;
    f.call.input = { result: { syntheticValue: "repaired" } };
    const second = await f.execute();
    assert.equal(second.success, true);
    assert.deepEqual(second.output, { status: "accepted" });
    assert.deepEqual(second.turnControl, {
      reason: "subagent_terminal",
      stopTurnAfterResult: true,
    });
    assert.equal(f.entry.inputSchema, schema);
    assert.equal(count, 2);
  });
});
test("typed declaration stays fixed across executor calls while engine supplies rejection/acceptance", async () => {
  await clock(async () => {
    const f = executorFixture({ label: "typed actor", operation: "submit" }, "allow", true);
    const schema = f.entry.inputSchema,
      snapshot = json(schema);
    let count = 0;
    f.direct.port.respond = async () =>
      ++count === 1 ? { accept: false, violations } : { accept: true };
    assert.equal((await f.execute()).success, false);
    f.call.id = "synthetic-next-ask" as any;
    f.call.input = { result: { syntheticValue: "new fictional ask" } };
    assert.equal((await f.execute()).success, true);
    assert.equal(f.entry.inputSchema, schema);
    assert.deepEqual(json(schema), snapshot);
    assert.equal(count, 2);
    assert.equal(
      modules.submit.submitResultToolEntry.inputSchema.properties.result.type,
      undefined,
    );
  });
});
test("actual scheduler/batch/executor stops later groups on accept and permits them on rejection", async () => {
  await clock(async () => {
    for (const accept of [true, false]) {
      const f = executorFixture({
        label: "scheduled submit",
        operation: "submit",
        verdict: accept ? { accept: true } : { accept: false, violations },
      });
      f.deps.registry.register(entryFor("send"));
      const deliveries: string[] = [];
      const port = {
        async sendMessage(this: unknown, request: any, options: any) {
          assert.equal(this, port);
          assert.equal(options.signal.aborted, false);
          deliveries.push(request.parentToolCallId);
          return outputs.send;
        },
      };
      f.deps.subagentPort = port as any;
      const calls = [
        { id: "synthetic-before", name: names.send, input: validInputs.send },
        f.call,
        { id: "synthetic-after", name: names.send, input: validInputs.send },
      ] as any[];
      const plan = new scheduler.ToolScheduler().schedule(
        calls.map((call) => ({
          toolCallId: call.id,
          toolName: call.name,
          dependsOn: [],
          ...f.deps.registry.get(call.name).metadata,
        })),
      );
      assert.deepEqual(plan.parallelGroups, [
        ["synthetic-before"],
        ["fixture-call"],
        ["synthetic-after"],
      ]);
      const generator = batch.executeToolSchedule(
        f.deps,
        (group: any, options: any) =>
          batch.executeToolBatch(
            f.deps,
            (call: any, callOptions: any) =>
              executeToolCall(f.deps, f.background, call, callOptions),
            group,
            options,
          ),
        calls,
        plan,
      );
      let next = await generator.next();
      while (!next.done) next = await generator.next();
      assert.deepEqual(
        deliveries,
        accept ? ["synthetic-before"] : ["synthetic-before", "synthetic-after"],
      );
      assert.equal(next.value.length, 3);
      assert.equal(f.direct.calls.length, 1);
      if (accept) {
        assert.equal(next.value[2].error.type, CoreErrorType.ToolCancelled);
        assert.equal(next.value[1].turnControl.stopTurnAfterResult, true);
      } else {
        assert.equal(next.value[1].success, false);
        assert.equal(next.value[1].turnControl, undefined);
        assert.equal(next.value[2].success, true);
      }
    }
  });
});
test("delayed synthetic ports settle once with receiver, exact trace and no duplicate delivery", async () => {
  await clock(async () => {
    for (const operation of operations) {
      const f = executorFixture({ label: "delayed", operation }),
        entered = gate(),
        release = gate();
      let count = 0,
        settled = false;
      f.direct.port[f.direct.methodName] = async function (...args: any[]) {
        assert.equal(this, f.direct.port);
        assert.equal(args.length, operation === "send" ? 2 : 1);
        assert.equal(args[0].trace, f.observed.contexts[0].traceContext);
        count++;
        entered.resolve();
        await release.promise;
        return f.direct.reply;
      };
      const pending = f.execute().then((result) => {
        settled = true;
        return result;
      });
      await entered.promise;
      assert.equal(settled, false);
      assert.equal(count, 1);
      release.resolve();
      assert.equal((await pending).success, true);
      assert.equal(count, 1);
    }
  });
});
test("interruption preserves signal forwarding differences and blocks late success/turn stop", async () => {
  await clock(async () => {
    for (const operation of operations) {
      const f = executorFixture({ label: "interrupted", operation }),
        entered = gate(),
        release = gate();
      let count = 0;
      f.direct.port[f.direct.methodName] = async function (...args: any[]) {
        count++;
        if (operation === "send") assert.equal(args[1].signal, f.observed.contexts[0].abortSignal);
        else assert.equal(args.length, 1);
        entered.resolve();
        await release.promise;
        return f.direct.reply;
      };
      const controller = new AbortController(),
        pending = f.execute({ signal: controller.signal });
      await entered.promise;
      controller.abort("Synthetic interrupt");
      const result = await pending;
      assert.equal(result.error.type, CoreErrorType.ToolCancelled);
      assert.equal(result.turnControl, undefined);
      assert.equal(f.observed.contexts[0].abortSignal.aborted, true);
      release.resolve();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(count, 1);
      assert.equal(f.events.filter((e) => e.type === SessionEventType.ToolCallResult).length, 0);
      assert.equal(f.events.filter((e) => e.type === SessionEventType.ToolCallError).length, 1);
      assert.deepEqual(
        f.terminal().map((t) => t.name),
        ["finishCancelled"],
      );
    }
  });
});
test("pre-cancel, permission/approval rejection and hook refusal produce no port effects", async () => {
  await clock(async () => {
    for (const operation of operations)
      for (const refusal of ["abort", "deny", "ask", "hook"] as const) {
        const f = executorFixture(
          { label: refusal, operation },
          refusal === "deny" ? "deny" : refusal === "ask" ? "ask" : "allow",
        );
        const controller = new AbortController();
        if (refusal === "abort") controller.abort();
        if (refusal === "ask") f.behavior.reply = { decision: "deny" };
        if (refusal === "hook")
          f.behavior.hook = async () => ({ additionalContexts: [], permissionBehavior: "deny" });
        assert.equal((await f.execute({ signal: controller.signal })).success, false);
        assert.equal(f.direct.calls.length, 0);
      }
  });
});
test("response continuation survives actual executor truncation before a long failure explanation", async () => {
  await clock(async () => {
    const f = executorFixture({
      label: "long response",
      operation: "respond",
      output: { ...outputs.respond, status: "failed", error: "界".repeat(3000) },
    });
    const result = await f.execute();
    assert.equal(result.success, true);
    assert.equal(result.turnControl, undefined);
    assert.match(
      result.modelContent,
      /Continue the current task unless the coordinator explicitly changed or ended it\./u,
    );
    assert.equal(result.serialization.truncated, true);
    assert.deepEqual(result.display, { kind: "respond_to_coordinator", status: "failed" });
  });
});
test("existing ten-second deadlines versus no-timeout submit policy remain unchanged", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.UTC(2026, 0, 15, 12) });
  for (const operation of operations) {
    const f = executorFixture({ label: "deadline", operation }),
      entered = gate(),
      release = gate();
    f.direct.port[f.direct.methodName] = async () => {
      entered.resolve();
      await release.promise;
      return f.direct.reply;
    };
    const controller = new AbortController();
    let settled = false;
    const pending = f.execute({ signal: controller.signal }).then((result) => {
      settled = true;
      return result;
    });
    await entered.promise;
    t.mock.timers.tick(10001);
    await new Promise((resolve) => setImmediate(resolve));
    if (operation === "submit") {
      assert.equal(settled, false);
      controller.abort("Synthetic no-timeout cancellation");
    }
    assert.equal(
      (await pending).error.type,
      operation === "submit" ? CoreErrorType.ToolCancelled : CoreErrorType.ToolTimeout,
    );
    release.resolve();
    await new Promise((resolve) => setImmediate(resolve));
  }
});
