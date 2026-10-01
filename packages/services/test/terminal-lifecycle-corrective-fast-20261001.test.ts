// Intended corrections committed before source changes; all ports come from the owned fake fixture.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { IMessagePassingProtocol, VSBuffer } from "@knorvia/rpc";
import type { ITerminalService } from "../src/terminal/terminal.js";
import { lifecycleFixture } from "./terminal-lifecycle-fixture-fast-20261001.js";
const f = await lifecycleFixture();
const { state, service, create, open, pair, rpc } = f;
const missing = (id: string) => ({ message: `Terminal not found: ${id}` });
const retired = (index = 0) =>
  assert.deepEqual(
    pair(index).map((e) => e.disposals),
    [1, 1],
  );

test("synchronous startup exit rejects, releases returned subscriptions and never publishes", async (t) => {
  const s = service(t);
  state.configure = (p) => {
    p.onExitAction = () => p.exit({ exitCode: 9 });
  };
  await assert.rejects(create(s), { message: "Terminal exited during startup: 0" });
  assert.equal(open(), 0);
  retired();
  assert.equal(state.ptys[0]!.kills, 0);
  assert.equal(state.ptys[0]!.nativeDisposals, 2);
  assert.throws(() => s.onDynamicData("0"), missing("0"));
  state.ptys[0]!.exit({ exitCode: 10 });
  retired();
  state.configure = () => {};
  assert.equal((await create(s)).id, "1");
});
test("throwing exit listener still retires everything and propagates original error", async (t) => {
  const s = service(t),
    { id } = await create(s),
    error = new Error("owned exit listener");
  s.onDynamicExit(id)(() => {
    throw error;
  });
  assert.throws(
    () => state.ptys[0]!.exit({ exitCode: 4 }),
    (e) => e === error,
  );
  assert.equal(open(), 0);
  retired();
  assert.equal(state.ptys[0]!.nativeDisposals, 2);
  assert.throws(() => s.onDynamicExit(id), missing(id));
  assert.doesNotThrow(() => state.ptys[0]!.exit({ exitCode: 5 }));
});
test("reentrant native exit notifies once and disposes once", async (t) => {
  const s = service(t),
    { id } = await create(s),
    seen: number[] = [];
  s.onDynamicExit(id)((code) => {
    seen.push(code);
    state.ptys[0]!.exit({ exitCode: 2 });
  });
  s.onDynamicExit(id)((code) => seen.push(code * 10));
  state.ptys[0]!.exit({ exitCode: 1 });
  assert.deepEqual(seen, [1, 10]);
  retired();
});
test("exit listener reentrant dispose never kills an already exited PTY", async (t) => {
  const s = service(t),
    { id } = await create(s);
  let inner: Promise<void> | undefined;
  s.onDynamicExit(id)(() => {
    inner = s.dispose({ id });
  });
  state.ptys[0]!.exit({ exitCode: 5 });
  await inner;
  assert.equal(state.ptys[0]!.kills, 0);
  retired();
});
test("kill callback reentrant dispose and synchronous exit cannot duplicate kill or cleanup", async (t) => {
  const s = service(t),
    { id } = await create(s);
  let inner: Promise<void> | undefined;
  state.ptys[0]!.killAction = () => {
    if (state.ptys[0]!.kills === 1) inner = s.dispose({ id });
    state.ptys[0]!.exit({ exitCode: 6 });
  };
  await s.dispose({ id });
  await inner;
  await s.dispose({ id });
  assert.equal(state.ptys[0]!.kills, 1);
  retired();
  assert.equal(state.ptys[0]!.nativeDisposals, 2);
});
test("listener failure during kill cleans up an observed exit and never retries dead PTY", async (t) => {
  const s = service(t),
    { id } = await create(s),
    error = new Error("owned kill exit listener");
  s.onDynamicExit(id)(() => {
    throw error;
  });
  state.ptys[0]!.killAction = () => state.ptys[0]!.exit({ exitCode: 7 });
  await assert.rejects(s.dispose({ id }), (e) => e === error);
  assert.equal(open(), 0);
  retired();
  await s.dispose({ id });
  assert.equal(state.ptys[0]!.kills, 1);
});
test("failed spawn retires both emitters and keeps existing wrapper", async (t) => {
  const s = service(t);
  state.spawnError = new Error("owned spawn failure");
  await assert.rejects(create(s), {
    message: `Failed to start terminal with shell '${f.shell}' in '${f.root}': owned spawn failure`,
  });
  retired();
  assert.equal(open(), 0);
});
test("partial emitter construction retires the first emitter", async (t) => {
  const s = service(t);
  state.emitterFailure = 2;
  await assert.rejects(create(s), { message: "emitter failure 1" });
  assert.equal(pair()[0]!.disposals, 1);
  assert.equal(state.ptys.length, 0);
});
for (const phase of ["onData", "onExit"] as const)
  test(`${phase} setup failure kills and retires each acquired resource`, async (t) => {
    const s = service(t),
      error = new Error(`owned ${phase} setup`);
    state.configure = (p) => {
      p[phase === "onData" ? "onDataAction" : "onExitAction"] = () => {
        throw error;
      };
    };
    await assert.rejects(create(s), (e) => e === error);
    assert.equal(state.ptys[0]!.kills, 1);
    retired();
    assert.equal(state.ptys[0]!.nativeDisposals, phase === "onData" ? 0 : 1);
    state.trace = [];
    state.ptys[0]!.data("late orphan");
    assert.deepEqual(state.trace, []);
    assert.equal(open(), 0);
  });
test("metadata failure retires unpublished PTY and preserves original error", async (t) => {
  const s = service(t),
    error = new Error("owned metadata failure");
  state.releaseError = error;
  await assert.rejects(create(s), (e) => e === error);
  assert.equal(open(), 0);
  retired();
  assert.equal(state.ptys[0]!.kills, 1);
  assert.equal(state.ptys[0]!.nativeDisposals, 2);
  await assert.rejects(s.write({ id: "0", data: "lost" }), missing("0"));
});
test("kill failure keeps tracked retryable PTY while retiring event resources", async (t) => {
  const s = service(t),
    { id } = await create(s),
    error = new Error("owned retryable kill");
  state.ptys[0]!.killAction = () => {
    throw error;
  };
  await assert.rejects(s.dispose({ id }), (e) => e === error);
  assert.equal(open(), 1);
  retired();
  assert.equal(state.ptys[0]!.nativeDisposals, 2);
  assert.throws(() => s.onDynamicData(id), missing(id));
  await assert.rejects(s.write({ id, data: "retiring" }), missing(id));
  state.ptys[0]!.killAction = () => {};
  await s.dispose({ id });
  assert.equal(open(), 0);
  assert.equal(state.ptys[0]!.kills, 2);
  retired();
});
test("failed setup plus failed kill retains unpublished PTY and both errors", async (t) => {
  const s = service(t),
    setup = new Error("owned setup primary"),
    kill = new Error("owned cleanup kill");
  state.configure = (p) => {
    p.onExitAction = () => {
      throw setup;
    };
    p.killAction = () => {
      throw kill;
    };
  };
  await assert.rejects(create(s), (e) => {
    assert.ok(e instanceof AggregateError);
    assert.equal(e.message, setup.message);
    assert.equal(e.cause, setup);
    assert.deepEqual(e.errors, [setup, kill]);
    return true;
  });
  assert.equal(open(), 1);
  retired();
  assert.equal(state.ptys[0]!.nativeDisposals, 1);
  assert.throws(() => s.onDynamicData("0"), missing("0"));
  state.ptys[0]!.killAction = () => {};
  s.disposeAll();
  assert.equal(state.ptys[0]!.kills, 2);
  assert.equal(open(), undefined);
});
test("disposeAll attempts every entry, preserves failed kill and keeps diagnostics", async (t) => {
  const s = service(t);
  await create(s);
  await create(s);
  await create(s);
  const error = new Error("owned first bulk kill");
  state.ptys[0]!.killAction = () => {
    throw error;
  };
  assert.throws(
    () => s.disposeAll(),
    (e) => e === error,
  );
  assert.deepEqual(
    state.ptys.map((p) => p.kills),
    [1, 1, 1],
  );
  assert.equal(open(), 1);
  retired(0);
  retired(1);
  retired(2);
  state.ptys[0]!.killAction = () => {};
  s.disposeAll();
  assert.deepEqual(
    state.ptys.map((p) => p.kills),
    [2, 1, 1],
  );
  assert.equal(open(), undefined);
});
test("disposeAll aggregates multiple errors in snapshot order", async (t) => {
  const s = service(t);
  await create(s);
  await create(s);
  await create(s);
  const a = new Error("owned bulk a"),
    b = new Error("owned bulk b");
  state.ptys[0]!.killAction = () => {
    throw a;
  };
  state.ptys[1]!.killAction = () => {
    throw b;
  };
  assert.throws(
    () => s.disposeAll(),
    (e) => {
      assert.ok(e instanceof AggregateError);
      assert.equal(e.message, "Failed to dispose all terminals");
      assert.deepEqual(e.errors, [a, b]);
      return true;
    },
  );
  assert.deepEqual(
    state.ptys.map((p) => p.kills),
    [1, 1, 1],
  );
  assert.equal(open(), 2);
});
test("normal disposeAll unregisters after cleanup and reuse registers again", async (t) => {
  const s = service(t);
  await create(s);
  state.ptys[0]!.killAction = () => assert.equal(open(), 1);
  s.disposeAll();
  assert.equal(open(), undefined);
  const { id } = await create(s);
  assert.equal(id, "1");
  assert.equal(open(), 1);
  await s.dispose({ id });
  assert.equal(open(), 0);
});
test("bulk cancels all older pending creates before any PTY is spawned", async (t) => {
  const resolveSettings: Array<(settings: unknown) => void> = [];
  const s = service(t, () => new Promise((resolve) => resolveSettings.push(resolve)));
  const a = create(s),
    b = create(s);
  const rejectedA = assert.rejects(a, { message: "Terminal creation cancelled: 0" });
  const rejectedB = assert.rejects(b, { message: "Terminal creation cancelled: 1" });
  s.disposeAll();
  assert.equal(open(), undefined);
  resolveSettings[0]!({});
  resolveSettings[1]!({});
  await rejectedA;
  await rejectedB;
  assert.equal(state.ptys.length, 0);
  assert.equal(state.emitters.length, 0);
  assert.equal(state.trace.includes("profile"), false);
  const c = create(s);
  resolveSettings[2]!({});
  assert.equal((await c).id, "2");
  assert.equal(open(), 1);
});
test("reentrant bulk during spawn adopts and retires returned PTY without publication", async (t) => {
  const s = service(t);
  state.configure = () => s.disposeAll();
  await assert.rejects(create(s), { message: "Terminal creation cancelled: 0" });
  assert.equal(state.ptys[0]!.kills, 1);
  retired();
  assert.equal(open(), undefined);
  assert.throws(() => s.onDynamicData("0"), missing("0"));
});
test("cancelled spawn with kill failure remains owned and diagnosable until retry", async (t) => {
  const s = service(t),
    kill = new Error("owned cancelled-spawn kill");
  state.configure = (p) => {
    s.disposeAll();
    p.killAction = () => {
      throw kill;
    };
  };
  await assert.rejects(create(s), (e) => {
    assert.ok(e instanceof AggregateError);
    assert.equal(e.message, "Terminal creation cancelled: 0");
    assert.equal(e.errors[1], kill);
    return true;
  });
  assert.equal(open(), 1);
  retired();
  assert.equal(state.ptys[0]!.kills, 1);
  state.ptys[0]!.killAction = () => {};
  s.disposeAll();
  assert.equal(open(), undefined);
});
test("new create admitted reentrantly after bulk boundary remains legitimate reuse", async (t) => {
  const s = service(t);
  await create(s);
  let next: ReturnType<typeof create> | undefined;
  state.ptys[0]!.killAction = () => {
    next = create(s);
  };
  s.disposeAll();
  assert.equal((await next!).id, "1");
  assert.equal(open(), 1);
  assert.equal(state.ptys[1]!.kills, 0);
});
test("nested disposeAll never duplicates active kill and still cleans other entries", async (t) => {
  const s = service(t);
  await create(s);
  await create(s);
  state.ptys[0]!.killAction = () => {
    if (state.ptys[0]!.kills === 1) s.disposeAll();
  };
  s.disposeAll();
  assert.deepEqual(
    state.ptys.map((p) => p.kills),
    [1, 1],
  );
  retired(0);
  retired(1);
  assert.equal(open(), undefined);
});
test("cleanup attempts both native subscriptions even when one disposer throws, then retries only failure", async (t) => {
  const s = service(t),
    error = new Error("owned subscription disposal"),
    attempts = [0, 0];
  state.configure = (p) => {
    const data = p.onData.bind(p),
      exit = p.onExit.bind(p);
    p.onData = (callback) => {
      const handle = data(callback);
      return {
        dispose: () => {
          attempts[0]++;
          if (attempts[0] === 1) throw error;
          handle.dispose();
        },
      };
    };
    p.onExit = (callback) => {
      const handle = exit(callback);
      return {
        dispose: () => {
          attempts[1]++;
          handle.dispose();
        },
      };
    };
  };
  const { id } = await create(s);
  await assert.rejects(s.dispose({ id }), (e) => e === error);
  assert.deepEqual(attempts, [1, 1]);
  retired();
  assert.equal(state.ptys[0]!.kills, 1);
  assert.equal(open(), 0);
  await s.dispose({ id });
  assert.deepEqual(attempts, [2, 1]);
  assert.equal(state.ptys[0]!.kills, 1);
  retired();
  s.disposeAll();
  assert.equal(open(), undefined);
});
test("exit listener error precedes subscription cleanup error while every resource is attempted", async (t) => {
  const s = service(t),
    listener = new Error("owned listener primary"),
    disposal = new Error("owned disposal secondary");
  let tries = 0;
  state.configure = (p) => {
    const data = p.onData.bind(p);
    p.onData = (callback) => {
      const handle = data(callback);
      return {
        dispose: () => {
          if (++tries === 1) throw disposal;
          handle.dispose();
        },
      };
    };
  };
  const { id } = await create(s);
  s.onDynamicExit(id)(() => {
    throw listener;
  });
  assert.throws(
    () => state.ptys[0]!.exit({ exitCode: 2 }),
    (e) => {
      assert.ok(e instanceof AggregateError);
      assert.deepEqual(e.errors, [listener, disposal]);
      assert.equal(e.cause, listener);
      assert.equal(e.message, listener.message);
      return true;
    },
  );
  retired();
  assert.equal(state.ptys[0]!.nativeDisposals, 1);
  await s.dispose({ id });
  assert.equal(state.ptys[0]!.nativeDisposals, 2);
  assert.equal(state.ptys[0]!.kills, 0);
});
test("subscription returned after synchronous exit is disposed even if that disposer initially throws", async (t) => {
  const s = service(t),
    error = new Error("owned late-handle disposal");
  let attempts = 0;
  state.configure = (p) => {
    p.onExitAction = () => p.exit({ exitCode: 3 });
    const exit = p.onExit.bind(p);
    p.onExit = (callback) => {
      const handle = exit(callback);
      return {
        dispose: () => {
          attempts++;
          if (attempts === 1) throw error;
          handle.dispose();
        },
      };
    };
  };
  await assert.rejects(create(s), (e) => e === error);
  assert.equal(state.ptys[0]!.kills, 0);
  retired();
  // Failed setup gets one cleanup pass, which retries the just-returned failed handle.
  assert.equal(attempts, 2);
  assert.equal(state.ptys[0]!.nativeDisposals, 2);
  assert.equal(open(), 0);
});
test("an observed exit followed by kill error is retired without a second kill", async (t) => {
  const s = service(t),
    { id } = await create(s),
    error = new Error("owned post-exit kill error");
  state.ptys[0]!.killAction = () => {
    state.ptys[0]!.exit({ exitCode: 8 });
    throw error;
  };
  await assert.rejects(s.dispose({ id }), (e) => e === error);
  await s.dispose({ id });
  assert.equal(state.ptys[0]!.kills, 1);
  assert.equal(open(), 0);
  retired();
});

async function consumer(t: { after(fn: () => void): void }) {
  const s = service(t),
    { ITerminalService: descriptor } = await import(f.url("terminal/terminal"));
  const toServer = new rpc.Emitter<VSBuffer>(),
    toClient = new rpc.Emitter<VSBuffer>();
  const serverProtocol: IMessagePassingProtocol = {
    onMessage: toServer.event,
    send: (data) => queueMicrotask(() => toClient.fire(data)),
  };
  const clientProtocol: IMessagePassingProtocol = {
    onMessage: toClient.event,
    send: (data) => queueMicrotask(() => toServer.fire(data)),
  };
  const server = new rpc.ChannelServer(serverProtocol, "owned-corrective-host");
  server.registerChannel(descriptor.channelName, rpc.ProxyChannel.fromService(s));
  const client = new rpc.ChannelClient(clientProtocol);
  const remote = rpc.ProxyChannel.toService<ITerminalService>(
    client.getChannel(descriptor.channelName),
  );
  t.after(() => {
    client.dispose();
    server.dispose();
    toServer.dispose();
    toClient.dispose();
  });
  return { s, remote };
}
const params = () => ({ cols: 81, rows: 27, cwd: f.root });
test("actual binary RPC rejects synchronously exited create and allows a later live create", async (t) => {
  const { remote } = await consumer(t);
  state.configure = (p) => {
    p.onExitAction = () => p.exit({ exitCode: 2 });
  };
  await assert.rejects(remote.create(params()), { message: "Terminal exited during startup: 0" });
  assert.equal(open(), 0);
  state.configure = () => {};
  const { id } = await remote.create(params());
  assert.equal(id, "1");
  await remote.write({ id, data: "owned" });
  await remote.resize({ id, cols: 5, rows: 6 });
  await remote.dispose({ id });
  assert.equal(open(), 0);
  assert.equal(state.ptys[1]!.nativeDisposals, 2);
});
test("actual binary RPC preserves setup-plus-cleanup aggregate primary wording and tracked retry", async (t) => {
  const { s, remote } = await consumer(t);
  const setup = new Error("owned RPC listener failure"),
    kill = new Error("owned RPC kill failure");
  state.configure = (p) => {
    p.onExitAction = () => {
      throw setup;
    };
    p.killAction = () => {
      throw kill;
    };
  };
  await assert.rejects(remote.create(params()), { name: "AggregateError", message: setup.message });
  assert.equal(open(), 1);
  retired();
  state.ptys[0]!.killAction = () => {};
  s.disposeAll();
  assert.equal(open(), undefined);
});
test("actual binary RPC bulk cancellation rejects an in-flight create without spawn", async (t) => {
  let release: (settings: unknown) => void = () => assert.fail("settings not requested");
  const s = service(
    t,
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const channel = rpc.ProxyChannel.fromService<string>(s);
  const remote = rpc.ProxyChannel.toService<ITerminalService>({
    call: (command, args) => channel.call("owned pending", command, args),
    listen: (event, args) => channel.listen("owned pending", event, args),
  });
  const pending = remote.create(params()),
    rejected = assert.rejects(pending, { message: "Terminal creation cancelled: 0" });
  s.disposeAll();
  release({});
  await rejected;
  assert.equal(state.ptys.length, 0);
  assert.equal(open(), undefined);
});
for (const phase of ["onData", "onExit"] as const)
  test(`bulk cancellation during ${phase} setup cannot publish and releases a late returned handle`, async (t) => {
    const s = service(t);
    state.configure = (p) => {
      p[phase === "onData" ? "onDataAction" : "onExitAction"] = () => s.disposeAll();
    };
    await assert.rejects(create(s), { message: "Terminal creation cancelled: 0" });
    assert.equal(state.ptys[0]!.kills, 1);
    retired();
    assert.equal(state.ptys[0]!.nativeDisposals, phase === "onData" ? 1 : 2);
    assert.equal(open(), undefined);
    assert.throws(() => s.onDynamicData("0"), missing("0"));
  });
test("disposing an owned pending reservation cancels that create without affecting reuse", async (t) => {
  const resolvers: Array<(settings: unknown) => void> = [];
  const s = service(t, () => new Promise((resolve) => resolvers.push(resolve)));
  const first = create(s),
    rejected = assert.rejects(first, { message: "Terminal creation cancelled: 0" });
  await s.dispose({ id: "0" });
  resolvers[0]!({});
  await rejected;
  assert.equal(state.ptys.length, 0);
  assert.equal(open(), 0);
  const second = create(s);
  resolvers[1]!({});
  assert.equal((await second).id, "1");
});
test("data after an observed exit is ignored while the current data snapshot still finishes", async (t) => {
  const s = service(t),
    { id } = await create(s),
    seen: string[] = [];
  s.onDynamicData(id)((value) => {
    seen.push(`a:${value}`);
    state.ptys[0]!.exit({ exitCode: 6 });
  });
  s.onDynamicData(id)((value) => seen.push(`b:${value}`));
  s.onDynamicExit(id)(() => {
    state.ptys[0]!.data("after exit");
  });
  state.ptys[0]!.data("before exit");
  assert.deepEqual(seen, ["a:before exit", "b:before exit"]);
  retired();
});
test("failed reentrant bulk kill during listener setup is not automatically killed a second time by create failure", async (t) => {
  const s = service(t),
    error = new Error("owned reentrant setup kill failure");
  state.configure = (p) => {
    p.killAction = () => {
      throw error;
    };
    p.onDataAction = () => s.disposeAll();
  };
  await assert.rejects(create(s), (e) => e === error);
  assert.equal(state.ptys[0]!.kills, 1);
  assert.equal(open(), 1);
  retired();
  state.ptys[0]!.killAction = () => {};
  s.disposeAll();
  assert.equal(state.ptys[0]!.kills, 2);
  assert.equal(open(), undefined);
});
test("cancellation at lazy-load await prevents allocation/helper/spawn after the pending load", async (t) => {
  const s = service(t),
    push = state.trace.push.bind(state.trace);
  state.trace.push = (...steps) => {
    if (steps.includes("profile")) queueMicrotask(() => s.disposeAll());
    return push(...steps);
  };
  await assert.rejects(create(s), { message: "Terminal creation cancelled: 0" });
  assert.equal(state.emitters.length, 0);
  assert.equal(state.ptys.length, 0);
  assert.equal(open(), undefined);
});
test("all emitter and subscription disposers are attempted and preserved in primary-first order", async (t) => {
  const s = service(t),
    listener = new Error("owned all-resources listener");
  const errors = [0, 1, 2, 3].map((i) => new Error(`owned cleanup ${i}`)),
    calls: number[] = [];
  let failing = true;
  state.configure = (p) => {
    const data = p.onData.bind(p),
      exit = p.onExit.bind(p);
    p.onData = (callback) => {
      const handle = data(callback);
      return {
        dispose: () => {
          calls.push(2);
          if (failing) throw errors[2];
          handle.dispose();
        },
      };
    };
    p.onExit = (callback) => {
      const handle = exit(callback);
      return {
        dispose: () => {
          calls.push(3);
          if (failing) throw errors[3];
          handle.dispose();
        },
      };
    };
  };
  const { id } = await create(s);
  pair().forEach((emitter, index) => {
    const dispose = emitter.dispose.bind(emitter);
    emitter.dispose = () => {
      calls.push(index);
      if (failing) throw errors[index];
      dispose();
    };
  });
  s.onDynamicExit(id)(() => {
    throw listener;
  });
  try {
    assert.throws(
      () => state.ptys[0]!.exit({ exitCode: 3 }),
      (e) => {
        assert.ok(e instanceof AggregateError);
        assert.deepEqual(e.errors, [listener, ...errors]);
        return true;
      },
    );
    assert.deepEqual(calls, [0, 1, 2, 3]);
    assert.equal(open(), 0);
  } finally {
    failing = false;
  }
  await s.dispose({ id });
  assert.deepEqual(calls, [0, 1, 2, 3, 0, 1, 2, 3]);
  assert.equal(state.ptys[0]!.kills, 0);
  retired();
});
