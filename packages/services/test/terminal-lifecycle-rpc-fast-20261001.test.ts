// Actual binary RPC/service consumers with owned in-memory protocols and fake native ports.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { IMessagePassingProtocol, VSBuffer } from "@knorvia/rpc";
import type { ITerminalService } from "../src/terminal/terminal.js";
import { lifecycleFixture } from "./terminal-lifecycle-fixture-fast-20261001.js";
const f = await lifecycleFixture(false);
const { rpc, state } = f;
const { ITerminalService: descriptor } = await import(f.url("terminal/terminal"));
function consumer(t: { after(fn: () => void): void }) {
  const service = f.service(t);
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
  const server = new rpc.ChannelServer(serverProtocol, "owned-terminal-host");
  server.registerChannel(descriptor.channelName, rpc.ProxyChannel.fromService(service));
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
  return { service, remote };
}
const params = () => ({ cols: 81, rows: 27, cwd: f.root });
test("public descriptor and binary create/write/resize/dispose preserve service result", async (t) => {
  const { remote } = consumer(t);
  const created = await remote.create(params());
  assert.equal(created.id, "0");
  assert.equal(created.shell, f.shell);
  assert.deepEqual(created.theme, f.theme);
  assert.equal(created.fontFamily, "Owned monospace");
  assert.equal(await remote.write({ id: created.id, data: "owned\0\r\n" }), undefined);
  assert.equal(await remote.resize({ id: created.id, cols: 0, rows: -5 }), undefined);
  assert.deepEqual(state.ptys[0]!.writes, ["owned\0\r\n"]);
  assert.deepEqual(state.ptys[0]!.sizes, [[0, -5]]);
  assert.equal(await remote.dispose({ id: created.id }), undefined);
  assert.equal(await remote.dispose({ id: created.id }), undefined);
  assert.equal(f.open(), 0);
  assert.equal(state.ptys[0]!.kills, 1);
});
test("RPC dynamic subscriptions, cancellation and late events retain ordering", async (t) => {
  const { remote } = consumer(t),
    { id } = await remote.create(params()),
    seen: string[] = [];
  const data = remote.onDynamicData(id)((value) => seen.push(`data:${value}`));
  const exit = remote.onDynamicExit(id)((value) => seen.push(`exit:${value}`));
  await remote.write({ id, data: "subscription barrier" });
  state.ptys[0]!.data("one");
  state.ptys[0]!.data("two");
  await remote.resize({ id, cols: 1, rows: 2 });
  assert.deepEqual(seen, ["data:one", "data:two"]);
  data.dispose();
  await remote.write({ id, data: "cancellation barrier" });
  state.ptys[0]!.data("ignored");
  state.ptys[0]!.exit({ exitCode: 23 });
  await remote.dispose({ id: "barrier-only-unknown" });
  assert.deepEqual(seen, ["data:one", "data:two", "exit:23"]);
  assert.equal(f.open(), 0);
  assert.equal(state.ptys[0]!.kills, 0);
  state.ptys[0]!.data("late");
  state.ptys[0]!.exit({ exitCode: 24 });
  await remote.dispose({ id });
  assert.deepEqual(seen, ["data:one", "data:two", "exit:23"]);
  exit.dispose();
});
test("RPC unknown IDs and missing list retain serialized errors", async (t) => {
  const { remote } = consumer(t);
  await assert.rejects(remote.write({ id: "unknown", data: "x" }), {
    message: "Terminal not found: unknown",
  });
  await assert.rejects(remote.resize({ id: "unknown", cols: 1, rows: 1 }), {
    message: "Terminal not found: unknown",
  });
  await assert.rejects((remote as unknown as { list(): Promise<unknown> }).list(), {
    message: "Method not found: list",
  });
  assert.equal(await remote.dispose({ id: "unknown" }), undefined);
});
test("RPC spawn and kill failures preserve wrapping, IDs and ownership", async (t) => {
  const { remote } = consumer(t);
  state.spawnError = new Error("owned RPC spawn failure");
  await assert.rejects(remote.create(params()), {
    message: `Failed to start terminal with shell '${f.shell}' in '${f.root}': owned RPC spawn failure`,
  });
  state.spawnError = undefined;
  const { id } = await remote.create(params());
  assert.equal(id, "1");
  state.ptys[0]!.killAction = () => {
    throw new Error("owned RPC kill failure");
  };
  await assert.rejects(remote.dispose({ id }), { message: "owned RPC kill failure" });
  assert.equal(f.open(), 1);
  state.ptys[0]!.killAction = () => {};
  await remote.dispose({ id });
  assert.equal(f.open(), 0);
});
test("RPC event cancellation retains service ownership and direct lookup errors", async (t) => {
  const s = f.service(t),
    channel = rpc.ProxyChannel.fromService<string>(s);
  const remote = rpc.ProxyChannel.toService<ITerminalService>({
    call: (command, args) => channel.call("owned direct RPC", command, args),
    listen: (event, args) => channel.listen("owned direct RPC", event, args),
  });
  const { id } = await remote.create(params());
  const subscription = remote.onDynamicData(id)(() => {});
  subscription.dispose();
  assert.equal(f.open(), 1);
  assert.equal(state.ptys[0]!.kills, 0);
  assert.throws(() => remote.onDynamicData("missing"), { message: "Terminal not found: missing" });
  assert.throws(() => remote.onDynamicExit("missing"), { message: "Terminal not found: missing" });
  await remote.dispose({ id });
  assert.equal(f.open(), 0);
});
