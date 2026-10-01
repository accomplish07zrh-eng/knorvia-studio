// Frozen retirement regressions: real RPC emitters, synthetic owned native/service ports only.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { IPty } from "node-pty";
import type { ITerminalService } from "../src/terminal/terminal.js";
import { lifecycleFixture } from "./terminal-lifecycle-fixture-fast-20261001.js";

const f = await lifecycleFixture(false);
const { TerminalServiceInstanceOwner } = await import(
  f.url("terminal/terminalServiceInstanceOwner")
);
const operations = ["write", "resize", "dataEvent", "exitEvent"] as const;
type Operation = (typeof operations)[number];
type Owner = InstanceType<typeof TerminalServiceInstanceOwner>;

function owned() {
  const owner = new TerminalServiceInstanceOwner(() => ({ dispose() {} }));
  const entry = owner.reserve();
  let exit = (_event: { exitCode: number }) => {};
  const state = {
    writes: [] as string[],
    sizes: [] as number[][],
    reads: [] as string[],
    kills: 0,
    disposals: 0,
    onKill: () => {},
  };
  const pty = {
    onData: () => ({ dispose: () => state.disposals++ }),
    onExit: (listener: typeof exit) => {
      exit = listener;
      return { dispose: () => state.disposals++ };
    },
    write: (data: string) => state.writes.push(data),
    resize: (cols: number, rows: number) => state.sizes.push([cols, rows]),
    kill: () => {
      state.kills++;
      state.onKill();
    },
  } as unknown as IPty;
  owner.prepare(entry);
  owner.attach(entry, pty);
  owner.publish(entry);
  return { owner, id: entry.id, state, exit: (code: number) => exit({ exitCode: code }) };
}

function invoke(owner: Owner, id: string, operation: Operation, reads: string[]) {
  if (operation === "write")
    return owner.write({
      id,
      get data() {
        reads.push("data");
        return "owned synthetic input";
      },
    });
  if (operation === "resize")
    return owner.resize({
      id,
      get cols() {
        reads.push("cols");
        return 82;
      },
      get rows() {
        reads.push("rows");
        return 28;
      },
    });
  return owner[operation](id)(() => assert.fail("new retired subscription"));
}

for (const trigger of ["native exit", "dispose", "disposeAll"] as const)
  for (const operation of operations)
    test(`${trigger} reentry rejects ${operation} before IO argument evaluation`, () => {
      const { owner, id, state, exit } = owned();
      const seen: number[] = [];
      const reject = () => {
        assert.equal(owner.count, trigger === "native exit" ? 0 : 1);
        assert.throws(() => invoke(owner, id, operation, state.reads), {
          message: `Terminal not found: ${id}`,
        });
        assert.deepEqual(state.reads, []);
      };
      owner.exitEvent(id)((code: number) => {
        seen.push(code);
        if (trigger === "native exit") reject();
      });
      owner.exitEvent(id)((code: number) => seen.push(code * 10));
      if (trigger === "native exit") exit(9);
      else {
        state.onKill = () => {
          reject();
          owner.dispose(id);
          exit(9);
        };
        if (trigger === "dispose") owner.dispose(id);
        else owner.disposeAll();
      }
      assert.deepEqual(seen, [9, 90]);
      assert.deepEqual(state.writes, []);
      assert.deepEqual(state.sizes, []);
      assert.equal(state.kills, trigger === "native exit" ? 0 : 1);
      assert.equal(state.disposals, 2);
      assert.equal(owner.count, 0);
      owner.dispose(id);
      owner.disposeAll();
      exit(10);
      assert.deepEqual(seen, [9, 90]);
    });

test("live lookup keeps raw IO and getter order with real emitter delivery", () => {
  const { owner, id, state, exit } = owned();
  assert.equal(invoke(owner, id, "write", state.reads), undefined);
  assert.equal(invoke(owner, id, "resize", state.reads), undefined);
  assert.deepEqual(state.reads, ["data", "cols", "rows"]);
  assert.deepEqual(state.writes, ["owned synthetic input"]);
  assert.deepEqual(state.sizes, [[82, 28]]);
  let observed = 0;
  owner.exitEvent(id)((code: number) => (observed = code));
  exit(11);
  assert.equal(observed, 11);
  assert.equal(state.kills, 0);
  assert.equal(state.disposals, 2);
});

test("failed kill remains retryable while every public admission stays closed", () => {
  const { owner, id, state } = owned();
  const error = new Error("owned kill error");
  state.onKill = () => {
    throw error;
  };
  assert.throws(
    () => owner.dispose(id),
    (value) => value === error,
  );
  assert.equal(owner.count, 1);
  for (const operation of operations)
    assert.throws(() => invoke(owner, id, operation, state.reads), {
      message: `Terminal not found: ${id}`,
    });
  assert.deepEqual(state.reads, []);
  state.onKill = () => {};
  owner.dispose(id);
  assert.equal(state.kills, 2);
  assert.equal(state.disposals, 2);
  assert.equal(owner.count, 0);
});

for (const operation of operations)
  test(`direct real RPC/service exit listener rejects reentrant ${operation}`, async (t) => {
    const service = f.service(t);
    const channel = f.rpc.ProxyChannel.fromService<string>(service);
    const remote = f.rpc.ProxyChannel.toService<ITerminalService>({
      call: (command, args) => channel.call("owned admission RPC", command, args),
      listen: (event, args) => channel.listen("owned admission RPC", event, args),
    });
    const { id } = await f.create(service);
    let rejected: Promise<void> | undefined;
    const seen: number[] = [];
    remote.onDynamicExit(id)((code) => {
      seen.push(code);
      assert.equal(f.open(), 0);
      if (operation === "write")
        rejected = assert.rejects(remote.write({ id, data: "owned synthetic input" }), {
          message: `Terminal not found: ${id}`,
        });
      else if (operation === "resize")
        rejected = assert.rejects(remote.resize({ id, cols: 82, rows: 28 }), {
          message: `Terminal not found: ${id}`,
        });
      else
        assert.throws(
          () => remote[operation === "dataEvent" ? "onDynamicData" : "onDynamicExit"](id)(() => {}),
          {
            message: `Terminal not found: ${id}`,
          },
        );
    });
    remote.onDynamicExit(id)((code) => seen.push(code * 10));
    f.state.ptys[0]!.exit({ exitCode: 12 });
    await rejected;
    assert.deepEqual(seen, [12, 120]);
    assert.deepEqual(f.state.ptys[0]!.writes, []);
    assert.deepEqual(f.state.ptys[0]!.sizes, []);
    assert.equal(f.state.ptys[0]!.kills, 0);
    assert.equal(f.state.ptys[0]!.nativeDisposals, 2);
  });
