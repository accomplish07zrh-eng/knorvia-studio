import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { CoreErrorType, createFileSystemError } from "@knorvia/contracts";
import { gate } from "./tool-invocation-fixture.js";
import { entryFor, fixture, validPlan } from "./plan-mode-fixture.js";

test("approved raw plan persists with exact host path/flags/signal/trace before exit", async () => {
  const f = fixture({ label: "write ordering" }),
    entered = gate(),
    release = gate();
  const original = f.fs.writeTextFile;
  let request: any, options: any;
  f.fs.writeTextFile = async function (req, opts) {
    assert.equal(this, f.fs);
    request = req;
    options = opts;
    f.tape.push("pending-write");
    entered.resolve();
    await release.promise;
    return Reflect.apply(original, this, [req, opts]);
  };
  const pending = entryFor("exit").handler({ plan: validPlan }, f.context);
  await entered.promise;
  assert.deepEqual(f.tape, ["isPlanEnabled", "pending-write"]);
  assert.equal(f.calls.filter((c) => c.phase === "exit").length, 0);
  assert.equal(request.content, validPlan);
  assert.equal(
    request.path,
    join("fixture-workspace", ".knorvia-studio", "plans", "plan-synthetic-session.md"),
  );
  assert.equal(request.atomic, true);
  assert.equal(request.createParents, true);
  assert.equal(request.encoding, "utf8");
  assert.equal(options.signal, f.controller.signal);
  assert.deepEqual(request.trace, {
    traceId: "synthetic-trace",
    spanId: "synthetic-span",
    parentSpanId: "synthetic-parent",
    turnId: "synthetic-turn",
  });
  release.resolve();
  await pending;
  assert.deepEqual(f.tape, ["isPlanEnabled", "pending-write", "write", "exit"]);
  assert.deepEqual(f.calls.at(-1).request.traceContext, request.trace);
  assert.equal(f.calls.at(-1).receiver, true);
});
test("interrupted rejected persistence classifies cancellation and prevents exit", async () => {
  const f = fixture({ label: "interrupted" }),
    entered = gate(),
    release = gate();
  const cause = new Error("Synthetic interrupted write");
  f.fs.writeTextFile = async () => {
    entered.resolve();
    await release.promise;
    throw cause;
  };
  const pending = entryFor("exit").handler({ plan: validPlan }, f.context);
  const rejected = assert.rejects(pending, (error: any) => {
    assert.equal(error.type, CoreErrorType.ToolCancelled);
    assert.equal(error.cause, cause);
    assert.equal(error.recoverable, true);
    return true;
  });
  await entered.promise;
  f.controller.abort();
  release.resolve();
  await rejected;
  assert.equal(
    f.calls.some((c) => c.phase === "exit"),
    false,
  );
});
test("only actual filesystem cancellation or aborted signal blocks rejected persistence", async () => {
  for (const error of [
    createFileSystemError({ code: "cancelled", message: "Synthetic cancellation" }),
    { code: "cancelled" },
    new Error("Synthetic rejection"),
    "Synthetic value",
  ]) {
    const f = fixture({ label: "classification" });
    f.fs.writeTextFile = async () => {
      throw error;
    };
    if (error instanceof Error && error.name === "FileSystemPortError") {
      await assert.rejects(
        entryFor("exit").handler({ plan: validPlan }, f.context),
        (received: any) => {
          assert.equal(received.type, CoreErrorType.ToolCancelled);
          assert.equal(received.cause, error);
          return true;
        },
      );
      assert.equal(
        f.calls.some((c) => c.phase === "exit"),
        false,
      );
    } else {
      assert.equal((await entryFor("exit").handler({ plan: validPlan }, f.context)).approved, true);
      assert.equal(f.calls.filter((c) => c.phase === "exit").length, 1);
    }
  }
});
test("transition thrown values propagate by identity after the original persistence boundary", async () => {
  for (const operation of ["enter", "exit"] as const)
    for (const thrown of [new Error("Synthetic transition refusal"), { synthetic: true }, 0]) {
      const f = fixture({ label: "port throw", operation });
      (f.port as any)[operation === "enter" ? "enterPlanMode" : "exitPlanMode"] = function () {
        assert.equal(this, f.port);
        throw thrown;
      };
      try {
        await entryFor(operation).handler(
          operation === "enter" ? {} : { plan: validPlan },
          f.context,
        );
        assert.fail("Expected transition failure");
      } catch (error) {
        assert.equal(error, thrown);
      }
      assert.equal(f.writes.length, operation === "exit" ? 1 : 0);
    }
});
test("optional enabled method has receiver binding and nullish-only mode fallback", async () => {
  for (const enabled of [true, false, null, undefined]) {
    const f = fixture({ label: "fallback", enabled, mode: "plan", noFileSystem: true });
    if (enabled === false)
      await assert.rejects(
        entryFor("exit").handler({ plan: validPlan }, f.context),
        (e: any) => e.type === CoreErrorType.InvalidStateTransition,
      );
    else await entryFor("exit").handler({ plan: validPlan }, f.context);
    assert.equal(f.calls[0].receiver, true);
    assert.equal(
      f.calls.some((c) => c.phase === "getMode"),
      enabled == null,
    );
  }
  const f = fixture({ label: "getter throw" });
  const error = new Error("Synthetic enabled getter");
  Object.defineProperty(f.port, "isPlanEnabled", {
    get() {
      throw error;
    },
  });
  await assert.rejects(
    entryFor("exit").handler({ plan: validPlan }, f.context),
    (e) => e === error,
  );
  assert.deepEqual(f.writes, []);
});
test("valid repeated enter/exit operations keep session port as the only state owner", async () => {
  const f = fixture({ label: "repeat", enabled: false });
  const enter = () => entryFor("enter").handler({}, f.context),
    exit = () => entryFor("exit").handler({ plan: validPlan }, f.context);
  assert.equal((await enter()).previousPlanEnabled, false);
  assert.equal((await enter()).previousPlanEnabled, true);
  assert.equal((await exit()).previousPlanEnabled, true);
  await assert.rejects(exit(), (e: any) => e.type === CoreErrorType.InvalidStateTransition);
  assert.equal((await enter()).previousPlanEnabled, false);
  await exit();
  assert.equal(f.writes.length, 2);
  assert.deepEqual(
    f.calls.filter((c) => ["enter", "exit"].includes(c.phase)).map((c) => c.phase),
    ["enter", "enter", "exit", "enter", "exit"],
  );
});
test("transition projection getter order and failures happen after one port effect", async () => {
  for (const operation of ["enter", "exit"] as const) {
    const f = fixture({ label: "projection", operation, noFileSystem: true }),
      reads: string[] = [];
    const transition: any = {};
    for (const key of ["mode", "previousMode", "planEnabled", "previousPlanEnabled"])
      Object.defineProperty(transition, key, {
        get() {
          reads.push(key);
          if (key === "previousPlanEnabled") throw new Error("Synthetic transition getter");
          return key.endsWith("Mode") || key === "mode" ? "build" : true;
        },
      });
    (f.port as any)[operation === "enter" ? "enterPlanMode" : "exitPlanMode"] = async () => {
      f.tape.push("transition");
      return transition;
    };
    await assert.rejects(
      entryFor(operation).handler(operation === "enter" ? {} : { plan: validPlan }, f.context),
      { message: "Synthetic transition getter" },
    );
    assert.deepEqual(
      reads,
      operation === "enter"
        ? ["mode", "previousMode", "planEnabled", "previousPlanEnabled"]
        : ["planEnabled", "previousPlanEnabled"],
    );
    assert.equal(f.tape.filter((t) => t === "transition").length, 1);
  }
});
