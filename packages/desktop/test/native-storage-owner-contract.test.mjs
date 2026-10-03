import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { resolve } from "node:path";
import test from "node:test";
import { deferred, flush, loadNativeOwner } from "./native-owner-fixture.mjs";

// All scenarios are newly authored and unexecuted. They supply Worker/IPC/scan
// ports and cannot certify real services, Electron, disk scans or platform IO.
function workerPorts() {
  const state = { workers: [], timers: [], cleared: [], events: [] };
  state.Worker = class extends EventEmitter {
    constructor(url, options) { super(); this.url = url; this.options = options; this.posts = []; this.terminations = 0; this.unrefs = 0; state.workers.push(this); }
    postMessage(value) { this.posts.push(value); }
    terminate() { this.terminations++; state.events.push("terminate"); return Promise.resolve(); }
    unref() { this.unrefs++; }
  };
  state.setTimeout = (callback, ms) => {
    const timer = { callback, ms, unrefed: false, unref() { this.unrefed = true; } };
    state.timers.push(timer); return timer;
  };
  state.clearTimeout = (timer) => state.cleared.push(timer);
  return state;
}
const workerModule = { "node:worker_threads": "export const Worker = port.Worker;" };
const workerTimers = "const setTimeout = nativeFixture.setTimeout, clearTimeout = nativeFixture.clearTimeout;";

test("Worker runner snapshots options, retains roots/progress identity and owns first settlement", async () => {
  const state = workerPorts();
  const { createStorageScanWorkerRunner } = await loadNativeOwner("storageScanWorkerClient", state, workerModule, workerTimers);
  const url = new URL("file:///fixture/storage-worker.js");
  const options = { workerUrl: url, progressIntervalMs: 23 };
  const runner = createStorageScanWorkerRunner(options); options.progressIntervalMs = 99;
  const roots = [{ path: "/fixture/root" }]; const signal = new AbortController(); const seen = [];
  const result = runner.run({ roots, signal: signal.signal, onProgress: function (value) { assert.equal(this, undefined); seen.push(value); } });
  const worker = state.workers[0];
  assert.equal(worker.url, url); assert.equal(worker.options.workerData.roots, roots);
  assert.equal(worker.options.workerData.progressIntervalMs, 23);
  assert.deepEqual(worker.eventNames(), ["message", "error", "exit"]);
  const progress = { roots: [], errors: [] };
  worker.emit("message", { type: "not-admitted" });
  worker.emit("message", { type: "progress", progress });
  assert.equal(seen[0], progress);
  worker.emit("message", { type: "done", progress });
  assert.equal(await result, progress); assert.equal(worker.terminations, 1);
  signal.abort(); assert.equal(worker.posts.length, 0);
  worker.emit("message", { type: "progress", progress });
  worker.emit("error", new Error("late fixture error"));
  assert.equal(seen.length, 1); assert.equal(worker.terminations, 1);
});

test("Worker abort keeps grace ordering and a done result may win before timeout", async () => {
  const state = workerPorts();
  const { createStorageScanWorkerRunner } = await loadNativeOwner("storageScanWorkerClient", state, workerModule, workerTimers);
  const runner = createStorageScanWorkerRunner({ workerUrl: new URL("file:///fixture/worker.js") });
  const signal = new AbortController();
  const result = runner.run({ roots: [], signal: signal.signal, onProgress() {} });
  signal.abort(); const worker = state.workers[0];
  assert.deepEqual(worker.posts, [{ type: "abort" }]);
  assert.equal(state.timers[0].ms, 500); assert.equal(state.timers[0].unrefed, true);
  const progress = { roots: [], errors: [] }; worker.emit("message", { type: "done", progress });
  assert.equal(await result, progress); assert.equal(state.cleared[0], state.timers[0]);
  state.timers[0].callback(); assert.equal(worker.terminations, 1);

  const initially = new AbortController(); initially.abort();
  const refused = runner.run({ roots: [], signal: initially.signal, onProgress() {} }).catch((error) => error);
  assert.equal((await refused).name, "AbortError");
  assert.equal(state.workers[1].unrefs, 0); assert.equal(state.workers[1].terminations, 1);
  const timed = new AbortController();
  const expired = runner.run({ roots: [], signal: timed.signal, onProgress() {} }).catch((error) => error);
  timed.abort(); state.timers[1].callback();
  assert.equal((await expired).message, "storage scan aborted");
});

test("Worker native error identity and zero-exit pending behavior remain", async () => {
  const state = workerPorts();
  const { createStorageScanWorkerRunner } = await loadNativeOwner("storageScanWorkerClient", state, workerModule, workerTimers);
  const runner = createStorageScanWorkerRunner({ workerUrl: new URL("file:///fixture/worker.js") });
  let settled = false; const original = new Error("fixture Worker failure");
  const result = runner.run({ roots: [], signal: new AbortController().signal, onProgress() {} }).catch((error) => { settled = true; return error; });
  state.workers[0].emit("exit", 0); await flush(); assert.equal(settled, false);
  state.workers[0].emit("error", original); assert.equal(await result, original);
  const failure = runner.run({ roots: [], signal: new AbortController().signal, onProgress() {} }).catch((error) => error);
  state.workers[1].emit("message", { type: "error", message: "fixture", code: undefined });
  assert.equal(Object.hasOwn(await failure, "code"), true);
});

test("Worker entry preserves module gate, cancellation port and done-post failure envelope", async () => {
  const port = new EventEmitter(); const scan = deferred(); const posts = [];
  const state = {
    isMainThread: false, parentPort: port, workerData: { roots: [], progressIntervalMs: 18 },
    runStorageScan(options) { assert.equal(this, undefined); state.input = options; return scan.promise; },
  };
  port.postMessage = (message) => { if (message.type === "done") throw new Error("fixture done post failed"); posts.push(message); };
  const modules = {
    "node:worker_threads": "export const isMainThread = port.isMainThread, parentPort = port.parentPort, workerData = port.workerData;",
    "@knorvia/services/node": "export const runStorageScan = port.runStorageScan;",
  };
  await loadNativeOwner("storageScanWorker", state, modules);
  assert.equal(state.input.roots, state.workerData.roots); assert.equal(state.input.progressIntervalMs, 18);
  port.emit("message", { type: "not-abort" }); assert.equal(state.input.signal.aborted, false);
  port.emit("message", { type: "abort" }); assert.equal(state.input.signal.aborted, true);
  const progress = { roots: [], errors: [] }; state.input.onProgress(progress);
  assert.equal(posts[0].progress, progress);
  scan.resolve(progress); await flush();
  assert.deepEqual(posts[1], { type: "error", message: "fixture done post failed", code: undefined });
  const main = { ...state, isMainThread: true, input: undefined, runStorageScan() { assert.fail("main thread must not scan"); } };
  await loadNativeOwner("storageScanWorker", main, modules); assert.equal(main.input, undefined);
});

function ipcPorts() {
  const registrations = new Map(); const windows = new Map(); const calls = [];
  const roots = { async resolveRoots() { calls.push(["roots"]); return [{ path: resolve("fixture-storage") }]; } };
  const service = {
    onScanProgress(callback) { state.progress = callback; return { dispose() {} }; },
    async startScan() { return { jobId: `job-${++state.starts}` }; },
    async cancelScan(id) { calls.push(["cancel", id]); },
    getSnapshot() { return state.snapshot; },
    clean(request) { calls.push(["clean", request]); return request; },
  };
  const state = {
    registrations, windows, calls, starts: 0, creates: 0, roots, service, snapshot: { fixture: true },
    ipcMain: { handle(name, callback) { registrations.set(name, callback); } },
    BrowserWindow: { fromWebContents(sender) { return windows.get(sender); } },
    shell: { showItemInFolder(path) { calls.push(["reveal", path]); } },
    logger: { warn(...args) { calls.push(["warn", ...args]); } },
    createStorageRootsResolver(options) { state.rootOptions = options; return roots; },
    createStorageScanWorkerRunner() { calls.push(["runner"]); return { fixtureRunner: true }; },
    createFsStorageCleaner() { calls.push(["cleaner"]); return { fixtureCleaner: true }; },
    createStorageService(options) { state.creates++; state.serviceOptions = options; return service; },
  };
  return state;
}
const ipcModules = {
  electron: "export const ipcMain = port.ipcMain, BrowserWindow = port.BrowserWindow, shell = port.shell;",
  "node:os": "export const homedir = () => '/fixture/home';",
  "@knorvia/shared": "export const PlatformChannels = {StorageStartScan:'start',StorageCancelScan:'cancel',StorageGetSnapshot:'snapshot',StorageClean:'clean',StorageRevealPath:'reveal',StorageScanProgress:'progress'};",
  "@knorvia/services/node": "export const createStorageRootsResolver = port.createStorageRootsResolver, createFsStorageCleaner = port.createFsStorageCleaner, createStorageService = port.createStorageService, getDataBaseDir = () => '/fixture/data';",
  "./logger.js": "export const logger = port.logger;",
  "./storageScanWorkerClient.js": "export const createStorageScanWorkerRunner = port.createStorageScanWorkerRunner;",
};

test("storage IPC keeps singleton service and new subscriber retirement without an extra business queue", async () => {
  const state = ipcPorts();
  const { registerResourceManagerStorageIpc } = await loadNativeOwner("resourceManagerStorage", state, ipcModules);
  registerResourceManagerStorageIpc();
  const { registrations } = state;
  assert.deepEqual([...registrations.keys()], ["start", "cancel", "snapshot", "clean", "reveal"]);
  assert.deepEqual([...registrations.values()].map((callback) => callback.length), [1, 2, 0, 2, 2]);
  assert.equal(await registrations.get("snapshot")(), null); assert.equal(state.creates, 0);
  const received = [];
  const sender = () => ({ isDestroyed() { return false; }, send(channel, snapshot) { received.push([this, channel, snapshot]); } });
  const one = sender(); const two = sender(); const firstWindow = new EventEmitter(); const nextWindow = new EventEmitter();
  state.windows.set(one, firstWindow); state.windows.set(two, nextWindow);
  await registrations.get("start")({ sender: one }); await registrations.get("start")({ sender: two });
  assert.equal(state.creates, 1); assert.equal(state.serviceOptions.roots, state.roots);
  firstWindow.emit("closed"); assert.equal(state.calls.some(([kind]) => kind === "cancel"), false);
  const snapshot = { same: true }; state.progress(snapshot);
  assert.equal(received[0][0], two); assert.equal(received[0][2], snapshot);
  const request = { fixture: "clean" };
  assert.equal(await registrations.get("clean")({ sender: two }, request), request);
  await registrations.get("cancel")({}, "other-job");
  nextWindow.emit("closed");
  assert.deepEqual(state.calls.filter(([kind]) => kind === "cancel"), [["cancel", "other-job"], ["cancel", "job-2"]]);
});

test("storage reveal queries roots before rejecting malformed/outside paths and forwards original allowed path", async () => {
  const state = ipcPorts();
  const { registerResourceManagerStorageIpc } = await loadNativeOwner("resourceManagerStorage", state, ipcModules);
  registerResourceManagerStorageIpc(); const reveal = state.registrations.get("reveal");
  await reveal({}, 17); assert.equal(state.calls[0][0], "roots"); assert.equal(state.calls[1][0], "warn");
  const inside = resolve("fixture-storage", "./folder"); await reveal({}, inside);
  assert.deepEqual(state.calls.at(-1), ["reveal", inside]);
  await reveal({}, resolve("fixture-outside")); assert.equal(state.calls.at(-1)[0], "warn");
  assert.equal(state.creates, 0);
});
