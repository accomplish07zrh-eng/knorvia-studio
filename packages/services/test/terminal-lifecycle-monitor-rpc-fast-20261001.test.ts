// Installed JavaScript and actual service/RPC; every runtime/native port is owned fake.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ITerminalService } from "../src/terminal/terminal.js";
import {
  installedAgentReceipt,
  installedWinptyTeardown,
  monitoredPty,
} from "./terminal-lifecycle-monitor-ports-fast-20261001.js";
import { lifecycleFixture } from "./terminal-lifecycle-fixture-fast-20261001.js";
const f = await lifecycleFixture(false);

for (const bulk of [false, true])
  test(`installed WinPTY teardown throw through real service/RPC, ${bulk ? "bulk" : "single"}`, async (t) => {
    assert.equal(installedAgentReceipt.version, "1.1.0");
    const native = installedWinptyTeardown(),
      port = monitoredPty();
    f.state.configure = (pty) => {
      pty.onData = port.onData;
      pty.onExit = port.onExit;
      pty.killAction = native.kill;
    };
    const service = f.service(t),
      channel = f.rpc.ProxyChannel.fromService<string>(service);
    const remote = f.rpc.ProxyChannel.toService<ITerminalService>({
      call: (command, args) => channel.call("owned monitor RPC", command, args),
      listen: (event, args) => channel.listen("owned monitor RPC", event, args),
    });
    const { id } = await f.create(service),
      seen: number[] = [];
    remote.onDynamicExit(id)((value) => seen.push(value));
    if (bulk)
      assert.throws(() => service.disposeAll(), {
        name: "TypeError",
        message: "processList.forEach is not a function",
      });
    else
      await assert.rejects(remote.dispose({ id }), {
        name: "TypeError",
        message: "processList.forEach is not a function",
      });
    assert.equal(native.state.handle, false);
    assert.equal(f.open(), 1);
    await assert.rejects(remote.dispose({ id }), {
      message: "Pty seems to have been killed already",
    });
    assert.equal(port.state.monitorDisposals, 0);
    await assert.rejects(remote.write({ id, data: "owned denied" }), {
      message: `Terminal not found: ${id}`,
    });
    await assert.rejects(remote.resize({ id, cols: 82, rows: 28 }), {
      message: `Terminal not found: ${id}`,
    });
    await Promise.resolve().then(() => port.exit(39));
    assert.equal(f.open(), bulk ? undefined : 0);
    assert.deepEqual(seen, []);
    await remote.dispose({ id });
    service.disposeAll();
    assert.equal(native.state.nativeKills, 2);
    assert.equal(port.state.monitorDisposals, 1);
    assert.equal(port.state.deliveries, 1);
    assert.equal(f.open(), undefined);
  });

test("failed create after acquired monitor retains unpublished PTY until deferred exit", async (t) => {
  const port = monitoredPty(),
    setup = new Error("owned post-attach setup"),
    kill = new Error("owned failed-create kill");
  f.state.configure = (pty) => {
    pty.onData = port.onData;
    pty.onExit = port.onExit;
    pty.killAction = () => {
      throw kill;
    };
  };
  f.state.releaseError = setup;
  const service = f.service(t);
  await assert.rejects(f.create(service), (value) => {
    assert.ok(value instanceof AggregateError);
    assert.deepEqual(value.errors, [setup, kill]);
    assert.equal(value.cause, setup);
    return true;
  });
  assert.equal(f.open(), 1);
  assert.equal(port.state.dataDisposals, 1);
  assert.equal(port.state.monitorDisposals, 0);
  assert.throws(() => service.onDynamicExit("0"), { message: "Terminal not found: 0" });
  port.exit(44);
  assert.equal(f.open(), 0);
  service.disposeAll();
  assert.equal(f.open(), undefined);
  assert.equal(port.state.monitorDisposals, 1);
  assert.equal(f.state.ptys[0]!.kills, 1);
});
