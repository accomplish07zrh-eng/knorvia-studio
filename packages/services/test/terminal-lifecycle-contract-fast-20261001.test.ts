// Frozen against 24aea53 before lifecycle replacement; actual service with fully fake native ports.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lifecycleFixture } from "./terminal-lifecycle-fixture-fast-20261001.js";
const f = await lifecycleFixture();
const { state, service, create, open, pair } = f;
const missing = (id: string) => ({ message: `Terminal not found: ${id}` });

test("public own keys, absent list, result field order and profile identity", async (t) => {
  const s = service(t);
  assert.deepEqual(Object.keys(s), [
    "create",
    "write",
    "resize",
    "dispose",
    "onDynamicData",
    "onDynamicExit",
    "disposeAll",
  ]);
  assert.equal("list" in s, false);
  const result = await create(s);
  assert.deepEqual(Object.keys(result), [
    "id",
    "shell",
    "fontFamily",
    "fontSize",
    "theme",
    "fontFamilySource",
    "windowsPty",
  ]);
  assert.deepEqual(result, {
    id: "0",
    shell: f.shell,
    fontFamily: "Owned monospace",
    fontSize: 17,
    theme: f.theme,
    fontFamilySource: "fallback",
    windowsPty: undefined,
  });
  assert.strictEqual(result.theme, f.theme);
});
test("factory diagnostics and independent ID sequences", async (t) => {
  const a = service(t);
  assert.equal(open(), 0);
  await create(a);
  assert.equal(open(), 1);
  const b = service(t);
  assert.equal(open(), 0);
  assert.equal((await create(b)).id, "0");
  await a.dispose({ id: "0" });
  assert.equal(open(), 1);
  a.disposeAll();
  assert.equal(open(), 1);
  b.disposeAll();
  assert.equal(open(), undefined);
});
test("create ordering allocates emitters before spawn and publishes before release", async (t) => {
  const s = service(t);
  await create(s);
  assert.deepEqual(state.trace, [
    "access",
    "home",
    "stat",
    "settings",
    "profile",
    "emitter:0",
    "emitter:1",
    "spawn",
    "onData",
    "onExit",
    "release",
  ]);
  assert.equal(open(), 1);
});
test("IDs consumed by shell admission failure before settings and allocation", async (t) => {
  const s = service(t);
  state.shellAvailable = false;
  await assert.rejects(create(s), { message: "No usable shell found for terminal startup" });
  assert.equal(state.trace.includes("settings"), false);
  assert.equal(pair().length, 0);
  state.shellAvailable = true;
  assert.equal((await create(s)).id, "1");
});
test("profile failure propagates unchanged before emitter allocation", async (t) => {
  const s = service(t),
    error = new Error("owned profile failure");
  state.profileError = error;
  await assert.rejects(create(s), (e) => e === error);
  assert.equal(state.emitters.length, 0);
  assert.equal(state.ptys.length, 0);
  state.profileError = undefined;
  assert.equal((await create(s)).id, "1");
});
test("settings synchronous throw propagates before profile", async (t) => {
  const error = new Error("owned synchronous settings failure");
  const s = service(t, () => {
    throw error;
  });
  await assert.rejects(create(s), (e) => e === error);
  assert.equal(state.trace.includes("profile"), false);
  assert.equal(open(), 0);
});
test("settings rejection still enters profile and native lifecycle", async (t) => {
  const s = service(t, async () => {
    throw new Error("owned settings rejection");
  });
  assert.equal((await create(s)).id, "0");
  assert.equal(open(), 1);
});
for (const index of [1, 2])
  test(`emitter constructor failure ${index} precedes spawn without cleanup`, async (t) => {
    const s = service(t);
    state.emitterFailure = index;
    await assert.rejects(create(s), { message: `emitter failure ${index - 1}` });
    assert.equal(state.trace.includes("spawn"), false);
    assert.equal(open(), 0);
    assert.ok(state.emitters.every((e) => e.disposals === 0));
  });
for (const error of [
  new Error("owned spawn failure"),
  "owned thrown string",
  { toString: () => "owned object" },
])
  test(`spawn failure wrapping and retained emitter allocation: ${String(error)}`, async (t) => {
    const s = service(t);
    state.spawnError = error;
    await assert.rejects(create(s), {
      message: `Failed to start terminal with shell '${f.shell}' in '${f.root}': ${error instanceof Error ? error.message : String(error)}`,
    });
    assert.equal(open(), 0);
    assert.deepEqual(
      pair().map((e) => e.disposals),
      [0, 0],
    );
    assert.equal(state.trace.includes("onData"), false);
    state.spawnError = undefined;
    assert.equal((await create(s)).id, "1");
  });
for (const phase of ["onData", "onExit"] as const)
  test(`${phase} failure is unwrapped and leaves unpublished native callbacks live`, async (t) => {
    const s = service(t),
      error = new Error(`owned ${phase} failure`);
    state.configure = (p) => {
      p[phase === "onData" ? "onDataAction" : "onExitAction"] = () => {
        throw error;
      };
    };
    await assert.rejects(create(s), (e) => e === error);
    assert.equal(open(), 0);
    assert.deepEqual(
      pair().map((e) => e.disposals),
      [0, 0],
    );
    assert.equal(state.trace.includes("release"), false);
    assert.equal(state.ptys[0]!.kills, 0);
    state.ptys[0]!.data("orphan");
    assert.equal(state.trace.at(-1), "fire:0:orphan");
    if (phase === "onExit") {
      state.ptys[0]!.exit({ exitCode: 4 });
      assert.deepEqual(
        pair().map((e) => e.disposals),
        [1, 1],
      );
    }
    assert.equal(state.ptys[0]!.nativeDisposals, 0);
  });
test("post-publication release failure rejects while preserving reachable terminal", async (t) => {
  const s = service(t),
    error = new Error("owned release failure");
  state.releaseError = error;
  await assert.rejects(create(s), (e) => e === error);
  assert.equal(open(), 1);
  assert.equal(await s.write({ id: "0", data: "reachable" }), undefined);
});
test("synchronous data before publication has no listener and does not buffer", async (t) => {
  const s = service(t);
  state.configure = (p) => {
    p.onDataAction = () => p.data("early");
  };
  const { id } = await create(s),
    seen: string[] = [];
  s.onDynamicData(id)((d) => seen.push(d));
  assert.deepEqual(seen, []);
  state.ptys[0]!.data("later");
  assert.deepEqual(seen, ["later"]);
});
test("synchronous pre-publication exit still publishes disposed emitter pair", async (t) => {
  const s = service(t);
  state.configure = (p) => {
    p.onExitAction = () => p.exit({ exitCode: 9 });
  };
  const { id } = await create(s),
    seen: unknown[] = [];
  assert.equal(open(), 1);
  assert.deepEqual(
    pair().map((e) => e.disposals),
    [1, 1],
  );
  s.onDynamicData(id)((d) => seen.push(d));
  s.onDynamicExit(id)((d) => seen.push(d));
  state.ptys[0]!.data("late");
  state.ptys[0]!.exit({ exitCode: 10 });
  assert.deepEqual(seen, []);
  assert.equal(open(), 0);
});
test("concurrent create reserves numeric order but publishes completion order", async (t) => {
  const resolvers: Array<(value: unknown) => void> = [];
  const s = service(t, () => new Promise((resolve) => resolvers.push(resolve)));
  const first = create(s),
    second = create(s);
  assert.equal(open(), 0);
  resolvers[1]!({});
  assert.equal((await second).id, "1");
  resolvers[0]!({});
  assert.equal((await first).id, "0");
  const killed: number[] = [];
  state.ptys.forEach((p, i) => {
    p.killAction = () => {
      killed.push(i);
    };
  });
  s.disposeAll();
  assert.deepEqual(killed, [0, 1]);
});
for (const id of ["missing", "", "00", "-1"])
  test(`unknown ID operations preserve error/no-op contracts: '${id}'`, async (t) => {
    const s = service(t);
    await assert.rejects(s.write({ id, data: "raw" }), missing(id));
    await assert.rejects(s.resize({ id, cols: 0, rows: -1 }), missing(id));
    assert.throws(() => s.onDynamicData(id), missing(id));
    assert.throws(() => s.onDynamicExit(id), missing(id));
    assert.equal(await s.dispose({ id }), undefined);
    assert.equal(open(), 0);
  });
test("write/resize raw forwarding and ignored native returns", async (t) => {
  const s = service(t),
    { id } = await create(s);
  assert.equal(await s.write({ id, data: "\0\x1b[31mowned\r\n" }), undefined);
  assert.equal(await s.resize({ id, cols: -3, rows: 0 }), undefined);
  assert.deepEqual(state.ptys[0]!.writes, ["\0\x1b[31mowned\r\n"]);
  assert.deepEqual(state.ptys[0]!.sizes, [[-3, 0]]);
});
for (const operation of ["write", "resize"] as const)
  test(`${operation} native exception preserves identity and ownership`, async (t) => {
    const s = service(t),
      { id } = await create(s),
      error = new Error(`owned ${operation} failure`);
    if (operation === "write")
      state.ptys[0]!.writeAction = () => {
        throw error;
      };
    else
      state.ptys[0]!.resizeAction = () => {
        throw error;
      };
    await assert.rejects(
      operation === "write" ? s.write({ id, data: "x" }) : s.resize({ id, cols: 2, rows: 3 }),
      (e) => e === error,
    );
    assert.equal(open(), 1);
  });
test("event getter identity, unsubscribe and data dispatch use real emitter snapshots", async (t) => {
  const s = service(t),
    { id } = await create(s),
    seen: string[] = [];
  assert.notStrictEqual(s.onDynamicData(id), s.onDynamicData(id));
  const a = s.onDynamicData(id)((data) => seen.push(`a:${data}`));
  const b = s.onDynamicData(id)((data) => seen.push(`b:${data}`));
  state.ptys[0]!.data("raw");
  a.dispose();
  a.dispose();
  state.ptys[0]!.data("two");
  b.dispose();
  assert.deepEqual(seen, ["a:raw", "b:raw", "b:two"]);
});
test("reentrant data dispatch completes nested snapshot before outer snapshot", async (t) => {
  const s = service(t),
    { id } = await create(s),
    seen: string[] = [];
  s.onDynamicData(id)((data) => {
    seen.push(`a:${data}`);
    if (data === "outer") state.ptys[0]!.data("inner");
  });
  s.onDynamicData(id)((data) => seen.push(`b:${data}`));
  state.ptys[0]!.data("outer");
  assert.deepEqual(seen, ["a:outer", "a:inner", "b:inner", "b:outer"]);
});
test("listener removal during dispatch does not cancel the existing snapshot", async (t) => {
  const s = service(t),
    { id } = await create(s),
    seen: string[] = [];
  s.onDynamicData(id)(() => {
    seen.push("a");
    b.dispose();
  });
  const b = s.onDynamicData(id)(() => seen.push("b"));
  state.ptys[0]!.data("one");
  state.ptys[0]!.data("two");
  assert.deepEqual(seen, ["a", "b", "a"]);
});
test("data listener throw interrupts snapshot without altering ownership", async (t) => {
  const s = service(t),
    { id } = await create(s),
    error = new Error("owned data listener");
  s.onDynamicData(id)(() => {
    throw error;
  });
  let later = 0;
  s.onDynamicData(id)(() => later++);
  assert.throws(
    () => state.ptys[0]!.data("owned"),
    (e) => e === error,
  );
  assert.equal(later, 0);
  assert.equal(open(), 1);
});
test("data listener reentrant dispose still completes current snapshot", async (t) => {
  const s = service(t),
    { id } = await create(s),
    seen: string[] = [];
  let disposal: Promise<void> | undefined;
  s.onDynamicData(id)(() => {
    seen.push("a");
    disposal = s.dispose({ id });
  });
  s.onDynamicData(id)(() => seen.push("b"));
  state.ptys[0]!.data("owned");
  await disposal;
  assert.deepEqual(seen, ["a", "b"]);
  assert.equal(open(), 0);
});
test("data listener reentrant exit completes remaining data snapshot after cleanup", async (t) => {
  const s = service(t),
    { id } = await create(s),
    seen: string[] = [];
  s.onDynamicData(id)(() => {
    seen.push("data-a");
    state.ptys[0]!.exit({ exitCode: 7 });
  });
  s.onDynamicData(id)(() => seen.push("data-b"));
  s.onDynamicExit(id)((code) => seen.push(`exit:${code}`));
  state.ptys[0]!.data("owned");
  assert.deepEqual(seen, ["data-a", "exit:7", "data-b"]);
  assert.equal(open(), 0);
});
test("native exit fires while registered then disposes data/exit and removes without kill", async (t) => {
  const s = service(t),
    { id } = await create(s),
    seen: number[] = [];
  let write: Promise<void> | undefined;
  s.onDynamicExit(id)((code) => {
    seen.push(code);
    assert.equal(open(), 1);
    assert.doesNotThrow(() => s.onDynamicData(id));
    write = s.write({ id, data: "during-exit" });
  });
  state.trace = [];
  state.ptys[0]!.exit({ exitCode: -17 });
  await write;
  assert.deepEqual(seen, [-17]);
  assert.deepEqual(state.trace, ["fire:1:-17", "write:during-exit", "dispose:0", "dispose:1"]);
  assert.equal(state.ptys[0]!.kills, 0);
  assert.equal(open(), 0);
  assert.throws(() => s.onDynamicExit(id), missing(id));
});
test("exit listener throw leaves instance and both emitters live", async (t) => {
  const s = service(t),
    { id } = await create(s),
    error = new Error("owned exit listener");
  s.onDynamicExit(id)(() => {
    throw error;
  });
  let data = 0;
  s.onDynamicData(id)(() => data++);
  assert.throws(
    () => state.ptys[0]!.exit({ exitCode: 3 }),
    (e) => e === error,
  );
  assert.equal(open(), 1);
  assert.deepEqual(
    pair().map((e) => e.disposals),
    [0, 0],
  );
  state.ptys[0]!.data("still live");
  assert.equal(data, 1);
});
test("reentrant exit dispatch retains nested ordering and repeated emitter disposal", async (t) => {
  const s = service(t),
    { id } = await create(s),
    seen: number[] = [];
  s.onDynamicExit(id)((code) => {
    seen.push(code);
    if (code === 1) state.ptys[0]!.exit({ exitCode: 2 });
  });
  s.onDynamicExit(id)((code) => seen.push(code * 10));
  state.ptys[0]!.exit({ exitCode: 1 });
  assert.deepEqual(seen, [1, 2, 20, 10]);
  assert.deepEqual(
    pair().map((e) => e.disposals),
    [2, 2],
  );
  assert.equal(open(), 0);
});
test("dispose kill precedes disposal/deletion; repeats and late callbacks are inert", async (t) => {
  const s = service(t),
    { id } = await create(s),
    seen: unknown[] = [];
  s.onDynamicData(id)((v) => seen.push(v));
  s.onDynamicExit(id)((v) => seen.push(v));
  state.ptys[0]!.killAction = () => {
    assert.equal(open(), 1);
    state.ptys[0]!.data("during kill");
  };
  state.trace = [];
  assert.equal(await s.dispose({ id }), undefined);
  assert.deepEqual(state.trace, ["kill", "fire:0:during kill", "dispose:0", "dispose:1"]);
  assert.equal(await s.dispose({ id }), undefined);
  state.ptys[0]!.data("late");
  state.ptys[0]!.exit({ exitCode: 9 });
  assert.deepEqual(seen, ["during kill"]);
  assert.equal(open(), 0);
  assert.equal(state.ptys[0]!.kills, 1);
  assert.equal(state.ptys[0]!.nativeDisposals, 0);
});
test("kill failure preserves emitter pair and ID until successful retry", async (t) => {
  const s = service(t),
    { id } = await create(s),
    error = new Error("owned kill failure");
  state.ptys[0]!.killAction = () => {
    throw error;
  };
  await assert.rejects(s.dispose({ id }), (e) => e === error);
  assert.equal(open(), 1);
  assert.deepEqual(
    pair().map((e) => e.disposals),
    [0, 0],
  );
  state.ptys[0]!.killAction = () => {};
  await s.dispose({ id });
  assert.equal(state.ptys[0]!.kills, 2);
  assert.equal(open(), 0);
});
test("synchronous kill exit preserves duplicate cleanup sequence", async (t) => {
  const s = service(t),
    { id } = await create(s),
    seen: number[] = [];
  s.onDynamicExit(id)((code) => seen.push(code));
  state.ptys[0]!.killAction = () => state.ptys[0]!.exit({ exitCode: 8 });
  state.trace = [];
  await s.dispose({ id });
  assert.deepEqual(state.trace, [
    "kill",
    "fire:1:8",
    "dispose:0",
    "dispose:1",
    "dispose:0",
    "dispose:1",
  ]);
  assert.deepEqual(seen, [8]);
  assert.equal(open(), 0);
});
test("reentrant dispose from kill observes still-owned ID and kills twice", async (t) => {
  const s = service(t),
    { id } = await create(s);
  let inner: Promise<void> | undefined;
  state.ptys[0]!.killAction = () => {
    if (state.ptys[0]!.kills === 1) inner = s.dispose({ id });
  };
  await s.dispose({ id });
  await inner;
  assert.equal(state.ptys[0]!.kills, 2);
  assert.deepEqual(
    pair().map((e) => e.disposals),
    [2, 2],
  );
});
test("disposeAll unregisters diagnostics before kill and is repeatable", async (t) => {
  const s = service(t);
  await create(s);
  await create(s);
  state.ptys.forEach((p) => {
    p.killAction = () => assert.equal(open(), undefined);
  });
  assert.equal(s.disposeAll(), undefined);
  assert.equal(s.disposeAll(), undefined);
  assert.deepEqual(
    state.ptys.map((p) => p.kills),
    [1, 1],
  );
});
test("disposeAll kill failure aborts remaining instances after unregister", async (t) => {
  const s = service(t);
  await create(s);
  await create(s);
  const error = new Error("owned first kill failure");
  state.ptys[0]!.killAction = () => {
    throw error;
  };
  assert.throws(
    () => s.disposeAll(),
    (e) => e === error,
  );
  assert.equal(open(), undefined);
  assert.deepEqual(
    state.ptys.map((p) => p.kills),
    [1, 0],
  );
  assert.doesNotThrow(() => s.onDynamicData("0"));
  assert.doesNotThrow(() => s.onDynamicData("1"));
  state.ptys[0]!.killAction = () => {};
  s.disposeAll();
  assert.deepEqual(
    state.ptys.map((p) => p.kills),
    [2, 1],
  );
});
test("create after disposeAll stays allowed, next ID continues without diagnostics", async (t) => {
  const s = service(t);
  await create(s);
  s.disposeAll();
  assert.equal((await create(s)).id, "1");
  assert.equal(open(), undefined);
  await s.write({ id: "1", data: "still supported" });
});
test("disposeAll snapshot excludes reentrant asynchronous creation", async (t) => {
  const s = service(t);
  await create(s);
  let later: ReturnType<typeof create> | undefined;
  state.ptys[0]!.killAction = () => {
    later = create(s);
  };
  s.disposeAll();
  assert.equal((await later!).id, "1");
  assert.equal(state.ptys[1]!.kills, 0);
  assert.doesNotThrow(() => s.onDynamicData("1"));
});
test("exit listener reentrant dispose retains kill and duplicate cleanup", async (t) => {
  const s = service(t),
    { id } = await create(s);
  let inner: Promise<void> | undefined;
  s.onDynamicExit(id)(() => {
    inner = s.dispose({ id });
  });
  state.ptys[0]!.exit({ exitCode: 6 });
  await inner;
  assert.equal(state.ptys[0]!.kills, 1);
  assert.deepEqual(
    pair().map((e) => e.disposals),
    [2, 2],
  );
  assert.equal(open(), 0);
});
test("kill reentrant exit listener failure propagates and interrupts caller cleanup", async (t) => {
  const s = service(t),
    { id } = await create(s),
    error = new Error("owned kill-exit-listener failure");
  s.onDynamicExit(id)(() => {
    throw error;
  });
  state.ptys[0]!.killAction = () => state.ptys[0]!.exit({ exitCode: 7 });
  await assert.rejects(s.dispose({ id }), (e) => e === error);
  assert.equal(open(), 1);
  assert.deepEqual(
    pair().map((e) => e.disposals),
    [0, 0],
  );
});
for (const operation of ["write", "resize"] as const) {
  test(`${operation} unknown-ID lookup precedes other parameter getters`, async (t) => {
    const s = service(t);
    let accessed = false;
    const params = {
      id: "missing",
      get data() {
        accessed = true;
        throw new Error("unexpected data getter");
      },
      get cols() {
        accessed = true;
        throw new Error("unexpected cols getter");
      },
      get rows() {
        accessed = true;
        throw new Error("unexpected rows getter");
      },
    };
    await assert.rejects(s[operation](params), missing("missing"));
    assert.equal(accessed, false);
  });
  test(`${operation} retains native target captured before a reentrant parameter getter`, async (t) => {
    const s = service(t),
      { id } = await create(s);
    let disposal: Promise<void> | undefined;
    const params = {
      id,
      get data() {
        disposal = s.dispose({ id });
        return "after removal";
      },
      get cols() {
        disposal = s.dispose({ id });
        return 13;
      },
      rows: 14,
    };
    assert.equal(await s[operation](params), undefined);
    await disposal;
    assert.equal(open(), 0);
    if (operation === "write") assert.deepEqual(state.ptys[0]!.writes, ["after removal"]);
    else assert.deepEqual(state.ptys[0]!.sizes, [[13, 14]]);
  });
}
