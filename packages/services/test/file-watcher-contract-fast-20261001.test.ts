// Frozen before service replacement. Baseline source exposure is disclosed in the spec.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { resolve } from "node:path";
import { mock, test, type TestContext } from "node:test";
import { ProxyChannel, type IChannel } from "@knorvia/rpc";
import type { FileWatchEvent } from "@knorvia/shared";
import type { IFileWatcherService } from "../src/fileWatcher/fileWatcher.js";

type Signal = (kind: string, name: string | Buffer | null) => void;
class NativeFixture extends EventEmitter {
  closes = 0;
  constructor(
    readonly path: string,
    readonly options: { recursive: boolean },
    readonly signal: Signal,
  ) {
    super();
  }
  close() {
    this.closes++;
  }
}
let handles: NativeFixture[] = [];
let openFailure: unknown;
mock.module("node:fs", {
  namedExports: {
    watch: (path: string, options: { recursive: boolean }, signal: Signal) => {
      if (openFailure !== undefined) throw openFailure;
      const handle = new NativeFixture(path, options, signal);
      handles.push(handle);
      return handle;
    },
  },
});
const emitted = process.env.KNORVIA_FILE_WATCHER_TARGET === "dist";
const folder = emitted ? "dist" : "src";
const suffix = emitted ? "js" : "ts";
const { createFileWatcherService }: typeof import("../src/fileWatcher/fileWatcherService.js") =
  await import(
    new URL(`../${folder}/fileWatcher/fileWatcherService.${suffix}`, import.meta.url).href
  );
const { collectServiceMemoryDiagnostics }: typeof import("../src/memoryDiagnostics.js") =
  await import(new URL(`../${folder}/memoryDiagnostics.${suffix}`, import.meta.url).href);

function fixture(t: TestContext) {
  handles = [];
  openFailure = undefined;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const warnings: unknown[][] = [];
  const logger = {
    debug() {},
    info() {},
    error() {},
    warn: (...args: unknown[]) => warnings.push(args),
  };
  const service = createFileWatcherService({ logger });
  t.after(() => service.disposeAll());
  return { service, logger, warnings, tick: (ms: number) => t.mock.timers.tick(ms) };
}
async function subscribe(service: IFileWatcherService, path = "synthetic/workspace") {
  const { id } = await service.watch({ path });
  const events: FileWatchEvent[] = [];
  const subscription = service.onDynamicChange(id)((event) => events.push(event));
  return { id, path, events, subscription, handle: handles.at(-1)! };
}

test("IDs consume failed attempts; paths and recursion are forwarded unchanged", async (t) => {
  const { service } = fixture(t);
  openFailure = new Error("synthetic unavailable");
  await assert.rejects(service.watch({ path: "  synthetic/path  " }), {
    message: "无法监视目录 '  synthetic/path  ': synthetic unavailable",
  });
  assert.equal(collectServiceMemoryDiagnostics()["fileWatcher.open"], 0);
  openFailure = "non-error failure";
  await assert.rejects(service.watch({ path: "other" }), {
    message: "无法监视目录 'other': non-error failure",
  });
  openFailure = undefined;
  const first = await service.watch({ path: "  synthetic/path  " });
  const second = await service.watch({ path: "  synthetic/path  ", recursive: true });
  const third = await service.watch({ path: "C:\\synthetic\\workspace", recursive: false });
  assert.deepEqual([first.id, second.id, third.id], ["2", "3", "4"]);
  assert.deepEqual(
    handles.map((h) => [h.path, h.options]),
    [
      ["  synthetic/path  ", { recursive: false }],
      ["  synthetic/path  ", { recursive: true }],
      ["C:\\synthetic\\workspace", { recursive: false }],
    ],
  );
  assert.equal(collectServiceMemoryDiagnostics()["fileWatcher.open"], 3);
});

test("trailing debounce is exactly 150 ms and repeated paths retain precision", async (t) => {
  const { service, tick } = fixture(t);
  const { handle, path, events } = await subscribe(service);
  handle.signal("rename", " a.txt ");
  tick(149);
  assert.deepEqual(events, []);
  handle.signal("change", Buffer.from("a.txt"));
  tick(149);
  assert.deepEqual(events, []);
  tick(1);
  assert.deepEqual(events, [{ dirPath: path, changedPath: resolve(path, "a.txt") }]);
  tick(150);
  assert.equal(events.length, 1);
});

test("distinct, unknown and blank names make the whole batch ambiguous", async (t) => {
  const { service, tick } = fixture(t);
  const { handle, path, events } = await subscribe(service);
  for (const names of [
    ["a", "b", "a"],
    [null, "a"],
    ["a", ""],
    [Buffer.from(" \t "), "a"],
  ]) {
    for (const name of names) handle.signal("change", name);
    tick(150);
  }
  assert.deepEqual(
    events,
    Array.from({ length: 4 }, () => ({ dirPath: path })),
  );
  handle.signal("rename", "a");
  tick(150);
  assert.deepEqual(events.at(-1), { dirPath: path, changedPath: resolve(path, "a") });
});

test("filename resolution keeps platform-native absolute and dot-segment rules", async (t) => {
  const { service, tick } = fixture(t);
  const { handle, path, events } = await subscribe(service, "synthetic/workspace/../workspace");
  for (const name of ["nested/../file", resolve("synthetic/absolute"), "C:\\synthetic\\file"]) {
    handle.signal("rename", name);
    tick(150);
    assert.deepEqual(events.at(-1), { dirPath: path, changedPath: resolve(path, name) });
  }
});

test("duplicate paths own distinct handles and subscriptions can detach independently", async (t) => {
  const { service, tick } = fixture(t);
  const a = await subscribe(service);
  const b = await subscribe(service);
  a.handle.signal("change", "a");
  tick(150);
  assert.equal(a.events.length, 1);
  assert.equal(b.events.length, 0);
  a.subscription.dispose();
  a.handle.signal("change", "b");
  b.handle.signal("rename", null);
  tick(150);
  assert.equal(a.events.length, 1);
  assert.deepEqual(b.events, [{ dirPath: b.path }]);
  await service.unwatch({ id: a.id });
  assert.equal(a.handle.closes, 1);
  assert.equal(b.handle.closes, 0);
});

test("flush clears batch before delivery and preserves listener order", async (t) => {
  const { service, tick } = fixture(t);
  const { id, handle, path } = await subscribe(service);
  const trace: string[] = [];
  service.onDynamicChange(id)((event) => {
    trace.push(`first:${event.changedPath}`);
    if (event.changedPath === resolve(path, "a")) handle.signal("change", "b");
  });
  service.onDynamicChange(id)((event) => trace.push(`second:${event.changedPath}`));
  handle.signal("change", "a");
  tick(150);
  assert.deepEqual(trace, [`first:${resolve(path, "a")}`, `second:${resolve(path, "a")}`]);
  tick(150);
  assert.deepEqual(trace.slice(2), [`first:${resolve(path, "b")}`, `second:${resolve(path, "b")}`]);
});

test("unwatch is idempotent, cancels pending batches and tolerates stale subscriptions", async (t) => {
  const { service, tick, warnings } = fixture(t);
  const { id, handle, events } = await subscribe(service);
  handle.signal("change", "a");
  await service.unwatch({ id });
  await service.unwatch({ id });
  await service.unwatch({ id: "unknown" });
  handle.signal("change", "late");
  tick(150);
  assert.deepEqual(events, []);
  assert.equal(handle.closes, 1);
  const stale = service.onDynamicChange(id)(() => assert.fail("stale event"));
  stale.dispose();
  assert.equal(warnings.length, 1);
  assert.equal(collectServiceMemoryDiagnostics()["fileWatcher.open"], 0);
});

test("native error warns, sends final directory-only event and retires pending work", async (t) => {
  const { service, tick, warnings } = fixture(t);
  const { id, handle, path, events } = await subscribe(service);
  handle.signal("change", "a");
  handle.emit("error", new Error("synthetic watch error"));
  assert.deepEqual(events, [{ dirPath: path }]);
  assert.equal(handle.closes, 1);
  assert.equal(warnings.length, 1);
  handle.emit("error", new Error("late error"));
  tick(150);
  assert.equal(events.length, 1);
  assert.equal(warnings.length, 1);
  service
    .onDynamicChange(id)(() => assert.fail("retired subscription"))
    .dispose();
  assert.equal(collectServiceMemoryDiagnostics()["fileWatcher.open"], 0);
});

test("error before subscription returns a disposable empty event", async (t) => {
  const { service } = fixture(t);
  const { id } = await service.watch({ path: "synthetic" });
  handles[0]!.emit("error", new Error("before subscribe"));
  service
    .onDynamicChange(id)(() => assert.fail("stale event"))
    .dispose();
  await service.unwatch({ id });
  assert.equal(handles[0]!.closes, 1);
});

test("reentrant unwatch during final error delivery closes exactly once", async (t) => {
  const { service } = fixture(t);
  const { id, handle, events } = await subscribe(service);
  service.onDynamicChange(id)(() => {
    void service.unwatch({ id });
  });
  handle.emit("error", new Error("synthetic"));
  assert.equal(events.length, 1);
  assert.equal(handle.closes, 1);
});

test("disposeAll cancels all owners, unregisters diagnostics and preserves ID continuity", async (t) => {
  const { service, tick } = fixture(t);
  const a = await subscribe(service);
  const b = await subscribe(service, "synthetic/second");
  a.handle.signal("rename", "a");
  b.handle.signal("change", "b");
  service.disposeAll();
  service.disposeAll();
  tick(150);
  assert.deepEqual([a.events, b.events], [[], []]);
  assert.deepEqual(
    handles.map((h) => h.closes),
    [1, 1],
  );
  assert.equal(collectServiceMemoryDiagnostics()["fileWatcher.open"], undefined);
  assert.deepEqual(await service.watch({ path: "synthetic/reuse" }), { id: "2" });
});

test("separate service owners isolate identical paths and IDs", async (t) => {
  const { service, logger, tick } = fixture(t);
  const other = createFileWatcherService({ logger });
  t.after(() => other.disposeAll());
  const a = await subscribe(service);
  const b = await subscribe(other);
  assert.equal(a.id, b.id);
  await service.unwatch({ id: a.id });
  b.handle.signal("change", "b");
  tick(150);
  assert.deepEqual(a.events, []);
  assert.equal(b.events.length, 1);
  assert.equal(b.handle.closes, 0);
});

test("real RPC proxy consumers route watcher IDs and unsubscribe dynamic events", async (t) => {
  const { service, tick } = fixture(t);
  const server = ProxyChannel.fromService<string>(service);
  const channel: IChannel = {
    call: (command, args) => server.call("synthetic-host", command, args),
    listen: (event, arg) => server.listen("synthetic-host", event, arg),
  };
  const client = ProxyChannel.toService<IFileWatcherService>(channel);
  const { id } = await client.watch({ path: "synthetic/rpc" });
  const events: FileWatchEvent[] = [];
  const subscription = client.onDynamicChange(id)((event) => events.push(event));
  handles[0]!.signal("change", "file");
  tick(150);
  assert.deepEqual(events, [
    { dirPath: "synthetic/rpc", changedPath: resolve("synthetic/rpc", "file") },
  ]);
  subscription.dispose();
  handles[0]!.signal("change", "other");
  tick(150);
  assert.equal(events.length, 1);
  await client.unwatch({ id });
  client
    .onDynamicChange(id)(() => assert.fail("stale RPC event"))
    .dispose();
  assert.equal(handles[0]!.closes, 1);
});
