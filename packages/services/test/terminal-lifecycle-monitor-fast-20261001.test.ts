// Intended monitor policy, frozen before production changes; all effectful ports are synthetic.
import assert from "node:assert/strict";
import { test } from "node:test";
import { monitoredPty } from "./terminal-lifecycle-monitor-ports-fast-20261001.js";
import { lifecycleFixture } from "./terminal-lifecycle-fixture-fast-20261001.js";

const f = await lifecycleFixture(false);
const { TerminalServiceInstanceOwner } = await import(
  f.url("terminal/terminalServiceInstanceOwner")
);
type Owner = InstanceType<typeof TerminalServiceInstanceOwner>;
function owned() {
  const diagnostic = {
    registered: 0,
    disposed: 0,
    read: undefined as undefined | (() => { open: number }),
  };
  const owner = new TerminalServiceInstanceOwner((read) => {
    diagnostic.registered++;
    diagnostic.read = read;
    return {
      dispose: () => {
        diagnostic.disposed++;
        diagnostic.read = undefined;
      },
    };
  });
  const port = monitoredPty(),
    entry = owner.reserve();
  owner.prepare(entry);
  owner.attach(entry, port.pty);
  owner.publish(entry);
  return { owner, id: entry.id, port, diagnostic };
}
function closed(owner: Owner, id: string) {
  let evaluated = false;
  assert.throws(
    () =>
      owner.write({
        id,
        get data() {
          evaluated = true;
          return "owned";
        },
      }),
    { message: `Terminal not found: ${id}` },
  );
  assert.throws(
    () =>
      owner.resize({
        id,
        get cols() {
          evaluated = true;
          return 82;
        },
        rows: 28,
      }),
    { message: `Terminal not found: ${id}` },
  );
  assert.throws(() => owner.dataEvent(id), { message: `Terminal not found: ${id}` });
  assert.throws(() => owner.exitEvent(id), { message: `Terminal not found: ${id}` });
  assert.equal(evaluated, false);
}
for (const boundary of ["before kill", "after native teardown"] as const)
  for (const bulk of [false, true])
    test(`${boundary}: ${bulk ? "bulk" : "single"} failed kill keeps deferred exit owned`, async () => {
      const { owner, id, port, diagnostic } = owned();
      const error = new Error(`owned failure ${boundary}`);
      let nativeLive = true;
      const seen: unknown[] = [];
      owner.dataEvent(id)((value: string) => seen.push(value));
      owner.exitEvent(id)((code: number) => seen.push(code));
      port.state.kill = () => {
        if (boundary === "after native teardown") nativeLive = false;
        throw error;
      };
      assert.throws(
        () => (bulk ? owner.disposeAll() : owner.dispose(id)),
        (value) => value === error,
      );
      assert.equal(nativeLive, boundary === "before kill");
      assert.equal(owner.count, 1);
      assert.equal(port.state.dataDisposals, 1);
      assert.equal(port.state.monitorDisposals, 0);
      closed(owner, id);
      port.data("retired data");
      await Promise.resolve().then(() => port.exit(31));
      assert.equal(port.state.deliveries, 1);
      assert.equal(owner.count, 0);
      assert.equal(port.state.monitorDisposals, 1);
      assert.deepEqual(seen, []);
      assert.equal(diagnostic.disposed, bulk ? 1 : 0);
      owner.dispose(id);
      owner.disposeAll();
      port.exit(32);
      assert.equal(port.state.deliveries, 1);
      assert.equal(port.state.kills, 1);
    });

test("explicit retries keep monitor until accepted kill, without duplicate disposal", () => {
  const { owner, id, port } = owned(),
    error = new Error("owned repeated failure");
  port.state.kill = () => {
    throw error;
  };
  for (let retry = 1; retry <= 2; retry++) {
    assert.throws(
      () => owner.dispose(id),
      (value) => value === error,
    );
    assert.equal(port.state.kills, retry);
    assert.equal(port.state.dataDisposals, 1);
    assert.equal(port.state.monitorDisposals, 0);
  }
  port.state.kill = () => {};
  owner.dispose(id);
  owner.dispose(id);
  owner.disposeAll();
  port.exit(32);
  assert.equal(port.state.kills, 3);
  assert.equal(port.state.monitorDisposals, 1);
  assert.equal(port.state.deliveries, 0);
});

test("deferred exit cancels permanently failing retries and bulk unregisters diagnostics", () => {
  const { owner, id, port, diagnostic } = owned(),
    error = new Error("owned permanent failure");
  port.state.kill = () => {
    throw error;
  };
  assert.throws(
    () => owner.disposeAll(),
    (value) => value === error,
  );
  assert.throws(
    () => owner.disposeAll(),
    (value) => value === error,
  );
  assert.equal(diagnostic.read?.().open, 1);
  port.exit(33);
  assert.equal(diagnostic.read, undefined);
  assert.equal(diagnostic.disposed, 1);
  owner.dispose(id);
  owner.disposeAll();
  assert.equal(port.state.kills, 2);
});

for (const failsAfterUnsubscribe of [false, true])
  test(`failed monitor disposal ${failsAfterUnsubscribe ? "after" : "before"} unsubscribe retains cleanup, no new kill`, () => {
    const { owner, id, port, diagnostic } = owned();
    const kill = new Error("owned kill"),
      cleanup = new Error("owned monitor cleanup");
    port.state.kill = () => {
      throw kill;
    };
    assert.throws(
      () => owner.disposeAll(),
      (value) => value === kill,
    );
    port.state.monitorAfterUnsubscribe = failsAfterUnsubscribe;
    port.state.monitorDispose = () => {
      throw cleanup;
    };
    // An adapter may remove its listener and then throw; the owner must still keep its handle.
    assert.throws(
      () => port.exit(34),
      (value) => value === cleanup,
    );
    assert.equal(owner.count, 0);
    assert.equal(diagnostic.read?.().open, 0);
    assert.equal(diagnostic.disposed, 0);
    port.state.monitorDispose = () => {};
    owner.dispose(id);
    owner.disposeAll();
    assert.equal(port.state.monitorDisposals, 2);
    assert.equal(port.state.kills, 1);
    assert.equal(diagnostic.disposed, 1);
  });

for (const trigger of ["accepted kill", "ordinary exit"] as const)
  test(`${trigger} control releases both handles and preserves normal notifications`, () => {
    const { owner, id, port } = owned(),
      seen: unknown[] = [];
    owner.dataEvent(id)((value: string) => seen.push(value));
    owner.exitEvent(id)((value: number) => seen.push(value));
    owner.write({ id, data: "owned live" });
    owner.resize({ id, cols: 82, rows: 28 });
    port.data("owned live data");
    if (trigger === "accepted kill") owner.dispose(id);
    else port.exit(40);
    assert.deepEqual(
      seen,
      trigger === "accepted kill" ? ["owned live data"] : ["owned live data", 40],
    );
    assert.deepEqual(port.state.writes, ["owned live"]);
    assert.deepEqual(port.state.sizes, [[82, 28]]);
    assert.equal(port.state.dataDisposals, 1);
    assert.equal(port.state.monitorDisposals, 1);
    assert.equal(owner.count, 0);
    owner.disposeAll();
    assert.equal(port.state.kills, trigger === "accepted kill" ? 1 : 0);
  });

test("reentrant failed kill cannot duplicate kill and retained exit retires bulk intent", () => {
  const { owner, id, port, diagnostic } = owned(),
    kill = new Error("owned reentry kill");
  port.state.kill = () => {
    owner.dispose(id);
    owner.disposeAll();
    throw kill;
  };
  assert.throws(
    () => owner.dispose(id),
    (value) => value === kill,
  );
  assert.equal(port.state.kills, 1);
  assert.equal(port.state.monitorDisposals, 0);
  port.exit(41);
  assert.equal(diagnostic.disposed, 1);
  owner.disposeAll();
  assert.equal(port.state.kills, 1);
});

test("bulk attempts every entry and only unconfirmed PTYs retain monitors", () => {
  const { owner, id, port, diagnostic } = owned(),
    second = monitoredPty(),
    entry = owner.reserve();
  owner.prepare(entry);
  owner.attach(entry, second.pty);
  owner.publish(entry);
  const kill = new Error("owned first bulk failure");
  port.state.kill = () => {
    throw kill;
  };
  assert.throws(
    () => owner.disposeAll(),
    (value) => value === kill,
  );
  assert.equal(second.state.kills, 1);
  assert.equal(second.state.monitorDisposals, 1);
  assert.equal(port.state.monitorDisposals, 0);
  assert.equal(diagnostic.read?.().open, 1);
  port.exit(42);
  assert.equal(diagnostic.disposed, 1);
  owner.dispose(id);
  owner.dispose(entry.id);
  owner.disposeAll();
  assert.equal(port.state.kills, 1);
  assert.equal(second.state.kills, 1);
});

test("bulk deferred-exit retirement permits legitimate owner reuse", () => {
  const { owner, port, diagnostic } = owned(),
    kill = new Error("owned bulk reuse failure");
  port.state.kill = () => {
    throw kill;
  };
  assert.throws(
    () => owner.disposeAll(),
    (value) => value === kill,
  );
  port.exit(43);
  const second = monitoredPty(),
    entry = owner.reserve();
  owner.prepare(entry);
  owner.attach(entry, second.pty);
  owner.publish(entry);
  assert.equal(entry.id, "1");
  assert.equal(diagnostic.registered, 2);
  assert.equal(diagnostic.read?.().open, 1);
  owner.write({ id: entry.id, data: "owned reuse" });
  owner.disposeAll();
  assert.equal(diagnostic.disposed, 2);
  assert.deepEqual(second.state.writes, ["owned reuse"]);
});

test("kill error precedes data cleanup error, exit monitor is not attempted while live", () => {
  const { owner, id, port } = owned();
  const kill = new Error("owned kill primary"),
    data = new Error("owned data secondary");
  port.state.kill = () => {
    throw kill;
  };
  port.state.dataDispose = () => {
    throw data;
  };
  assert.throws(
    () => owner.dispose(id),
    (value) => {
      assert.ok(value instanceof AggregateError);
      assert.deepEqual(value.errors, [kill, data]);
      assert.equal(value.cause, kill);
      return true;
    },
  );
  assert.equal(port.state.monitorDisposals, 0);
  port.state.dataDispose = () => {};
  port.exit(35);
  assert.equal(owner.count, 0);
  assert.equal(port.state.kills, 1);
  assert.equal(port.state.monitorDisposals, 1);
});

test("data cleanup reentry observes exit and releases monitor in the same finite pass", () => {
  const { owner, id, port } = owned(),
    kill = new Error("owned kill before cleanup exit");
  port.state.kill = () => {
    throw kill;
  };
  port.state.dataDispose = () => {
    closed(owner, id);
    port.exit(36);
    owner.dispose(id);
    owner.disposeAll();
  };
  assert.throws(
    () => owner.dispose(id),
    (value) => value === kill,
  );
  assert.equal(owner.count, 0);
  assert.equal(port.state.kills, 1);
  assert.equal(port.state.dataDisposals, 1);
  assert.equal(port.state.monitorDisposals, 1);
});

test("synchronous exit then throwing kill keeps ordinary exit delivery and no retry kill", () => {
  const { owner, id, port } = owned(),
    kill = new Error("owned post-exit failure");
  const seen: number[] = [];
  owner.exitEvent(id)((value: number) => seen.push(value));
  port.state.kill = () => {
    port.exit(37);
    owner.dispose(id);
    throw kill;
  };
  assert.throws(
    () => owner.dispose(id),
    (value) => value === kill,
  );
  owner.dispose(id);
  owner.disposeAll();
  assert.deepEqual(seen, [37]);
  assert.equal(owner.count, 0);
  assert.equal(port.state.monitorDisposals, 1);
  assert.equal(port.state.kills, 1);
});

test("late acquired exit handle after reentrant bulk failed kill retains eventual exit", () => {
  const diagnostic = { disposed: 0 },
    kill = new Error("owned setup cancellation kill");
  const owner = new TerminalServiceInstanceOwner(() => ({ dispose: () => diagnostic.disposed++ }));
  const entry = owner.reserve(),
    port = monitoredPty();
  owner.prepare(entry);
  port.state.kill = () => {
    throw kill;
  };
  port.state.registerExit = () =>
    assert.throws(
      () => owner.disposeAll(),
      (value) => value === kill,
    );
  assert.throws(() => owner.attach(entry, port.pty), { message: "Terminal creation cancelled: 0" });
  assert.throws(() => owner.fail(entry, new Error("owned cancellation")), {
    message: "owned cancellation",
  });
  assert.equal(port.state.kills, 1);
  assert.equal(port.state.monitorDisposals, 0);
  port.exit(38);
  assert.equal(owner.count, 0);
  assert.equal(diagnostic.disposed, 1);
  assert.equal(port.state.monitorDisposals, 1);
});
