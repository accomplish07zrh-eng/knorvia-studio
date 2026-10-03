// Later clarification only: actual Emitter subscriptions, all PTY/effectful ports owned fake.
import assert from "node:assert/strict";
import { test } from "node:test";
import { monitoredPty } from "./terminal-lifecycle-monitor-ports-fast-20261001.js";
import { lifecycleFixture } from "./terminal-lifecycle-fixture-fast-20261001.js";

const f = await lifecycleFixture(false);
const { TerminalServiceInstanceOwner } = await import(
  f.url("terminal/terminalServiceInstanceOwner")
);

for (const secondPassThrows of [false, true])
  test(`failed data handle requeues after retained exit; accepted retry ${secondPassThrows ? "errors" : "success"} follows that order`, () => {
    let registrations = 0,
      unregistrations = 0;
    const owner = new TerminalServiceInstanceOwner(() => {
      registrations++;
      return { dispose: () => unregistrations++ };
    });
    const entry = owner.reserve(),
      port = monitoredPty(),
      trace: string[] = [];
    const kill = new Error("owned first kill"),
      data = new Error("owned data cleanup"),
      exit = new Error("owned exit cleanup");
    let retry = false,
      cleanupOnly = false;
    port.state.kill = () => {
      trace.push("kill");
      if (!retry) throw kill;
    };
    port.state.dataDispose = () => {
      trace.push("data");
      if (!cleanupOnly && (!retry || secondPassThrows)) throw data;
    };
    port.state.monitorDispose = () => {
      trace.push("exit");
      if (retry && secondPassThrows && !cleanupOnly) throw exit;
    };
    owner.prepare(entry);
    owner.attach(entry, port.pty);
    owner.publish(entry);
    assert.throws(
      () => owner.disposeAll(),
      (value) => {
        assert.ok(value instanceof AggregateError);
        assert.deepEqual(value.errors, [kill, data]);
        assert.equal(value.cause, kill);
        assert.equal(value.message, "Failed to dispose all terminals");
        return true;
      },
    );
    assert.deepEqual(trace, ["kill", "data"]);
    assert.equal(owner.count, 1);
    assert.equal(port.state.monitorDisposals, 0);
    assert.equal(unregistrations, 0);
    retry = true;
    if (secondPassThrows)
      assert.throws(
        () => owner.dispose(entry.id),
        (value) => {
          assert.ok(value instanceof AggregateError);
          assert.deepEqual(value.errors, [exit, data]);
          assert.equal(value.cause, exit);
          assert.equal(value.message, exit.message);
          return true;
        },
      );
    else owner.dispose(entry.id);
    assert.deepEqual(trace, ["kill", "data", "kill", "exit", "data"]);
    assert.equal(owner.count, 0);
    assert.throws(() => owner.write({ id: entry.id, data: "owned denied" }), {
      message: `Terminal not found: ${entry.id}`,
    });
    assert.equal(unregistrations, secondPassThrows ? 0 : 1);
    cleanupOnly = true;
    owner.dispose(entry.id);
    owner.disposeAll();
    port.exit(45);
    assert.equal(port.state.kills, 2);
    assert.equal(registrations, 1);
    assert.equal(unregistrations, 1);
    assert.deepEqual(
      trace,
      secondPassThrows
        ? ["kill", "data", "kill", "exit", "data", "exit", "data"]
        : ["kill", "data", "kill", "exit", "data"],
    );
  });
