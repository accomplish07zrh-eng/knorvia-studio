// New boundary tests written before the IO port exists; no OS watcher is opened here.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import type { FileWatchEvent } from "@knorvia/shared";
import type { FileWatcherRuntime } from "../src/fileWatcher/fileWatcherRuntime.js";

const emitted = process.env.KNORVIA_FILE_WATCHER_TARGET === "dist";
const { createFileWatcherService }: typeof import("../src/fileWatcher/fileWatcherService.js") =
  await import(
    new URL(
      `../${emitted ? "dist" : "src"}/fileWatcher/fileWatcherService.${emitted ? "js" : "ts"}`,
      import.meta.url,
    ).href
  );

function syntheticRuntime() {
  const watches: Array<{
    path: string;
    recursive: boolean;
    signals: Parameters<FileWatcherRuntime["open"]>[2];
    closed: number;
  }> = [];
  const turns: Array<{ delay: number; run: () => void; cancelled: number }> = [];
  const runtime: FileWatcherRuntime = {
    open(path, recursive, signals) {
      const record = { path, recursive, signals, closed: 0 };
      watches.push(record);
      return {
        dispose: () => {
          record.closed++;
        },
      };
    },
    schedule(delay, run) {
      const record = { delay, run, cancelled: 0 };
      turns.push(record);
      return {
        dispose: () => {
          record.cancelled++;
        },
      };
    },
  };
  const logger = { warn() {}, error() {}, debug() {}, info() {} };
  return { runtime, watches, turns, logger };
}

test("injected IO receives unchanged paths, recursion and the existing debounce budget", async (t) => {
  const { runtime, watches, turns, logger } = syntheticRuntime();
  const service = createFileWatcherService({ runtime, logger });
  t.after(() => service.disposeAll());
  const path = "port-only/not-an-os-directory";
  const { id } = await service.watch({ path, recursive: true });
  const events: FileWatchEvent[] = [];
  service.onDynamicChange(id)((event) => events.push(event));
  assert.equal(watches[0]!.path, path);
  assert.equal(watches[0]!.recursive, true);
  watches[0]!.signals.change(Buffer.from("file"));
  assert.equal(turns[0]!.delay, 150);
  turns[0]!.run();
  assert.deepEqual(events, [{ dirPath: path, changedPath: resolve(path, "file") }]);
});

test("cancelled scheduled callbacks cannot flush a newer batch or repeat its delivery", async (t) => {
  const { runtime, watches, turns, logger } = syntheticRuntime();
  const service = createFileWatcherService({ runtime, logger });
  t.after(() => service.disposeAll());
  const { id } = await service.watch({ path: "port-only/workspace" });
  const events: FileWatchEvent[] = [];
  service.onDynamicChange(id)((event) => events.push(event));
  watches[0]!.signals.change("a");
  watches[0]!.signals.change("b");
  assert.equal(turns[0]!.cancelled, 1);
  turns[0]!.run();
  assert.deepEqual(events, []);
  turns[1]!.run();
  turns[1]!.run();
  assert.deepEqual(events, [{ dirPath: "port-only/workspace" }]);
});

test("retired native and scheduled callbacks cannot revive an owner", async (t) => {
  const { runtime, watches, turns, logger } = syntheticRuntime();
  const service = createFileWatcherService({ runtime, logger });
  t.after(() => service.disposeAll());
  const { id } = await service.watch({ path: "port-only/workspace" });
  const events: FileWatchEvent[] = [];
  service.onDynamicChange(id)((event) => events.push(event));
  watches[0]!.signals.change("pending");
  await service.unwatch({ id });
  turns[0]!.run();
  watches[0]!.signals.change("late");
  watches[0]!.signals.error(new Error("late"));
  assert.deepEqual(events, []);
  assert.equal(watches[0]!.closed, 1);
  assert.equal(turns[0]!.cancelled, 1);
  assert.equal(turns.length, 1);
});

test("open failure does not admit callbacks or leak a pending turn", async (t) => {
  const { runtime, turns, logger } = syntheticRuntime();
  runtime.open = (_path, _recursive, signals) => {
    signals.change("early");
    signals.error(new Error("early"));
    throw new Error("port failure");
  };
  const service = createFileWatcherService({ runtime, logger });
  t.after(() => service.disposeAll());
  await assert.rejects(service.watch({ path: "port-only/workspace" }), {
    message: "无法监视目录 'port-only/workspace': port failure",
  });
  assert.deepEqual(turns, []);
  service
    .onDynamicChange("0")(() => assert.fail("failed admission event"))
    .dispose();
});

test("a large multi-file burst remains ambiguous until the next batch", async (t) => {
  const { runtime, watches, turns, logger } = syntheticRuntime();
  const service = createFileWatcherService({ runtime, logger });
  t.after(() => service.disposeAll());
  const { id } = await service.watch({ path: "port-only/burst" });
  const events: FileWatchEvent[] = [];
  service.onDynamicChange(id)((event) => events.push(event));
  for (let i = 0; i < 10_000; i++) watches[0]!.signals.change(`file-${i}`);
  turns.at(-1)!.run();
  watches[0]!.signals.change("single");
  turns.at(-1)!.run();
  assert.deepEqual(events, [
    { dirPath: "port-only/burst" },
    { dirPath: "port-only/burst", changedPath: resolve("port-only/burst", "single") },
  ]);
});
