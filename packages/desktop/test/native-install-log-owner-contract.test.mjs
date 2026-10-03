import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadNativeOwner } from "./native-owner-fixture.mjs";

// Deferred scenarios only: native process/filesystem/logger ports are supplied.
// No real process query/termination, packaged file probe, Host or renderer runs.
const windowsModules = {
  "node:child_process": "export const execFile = port.execFile;",
  "node:util": "export const promisify = () => port.execFileAsync;",
  "node:fs":
    "export const existsSync = port.existsSync, readdirSync = port.readdirSync, renameSync = port.renameSync, rmSync = port.rmSync, writeFileSync = port.writeFileSync;",
};
function windowsPorts() {
  const state = {
    calls: [],
    now: () => 1234,
    random: () => 0.5,
    execFile() {},
    async execFileAsync(...args) {
      state.calls.push(["query", ...args]);
      return { stdout: "" };
    },
    existsSync(path) {
      state.calls.push(["exists", path]);
      return path.endsWith("knorvia");
    },
    readdirSync(...args) {
      state.calls.push(["list", ...args]);
      return Array.from({ length: 23 }, (_, index) => ({
        name: `entry-${index}`,
        isDirectory: () => index === 0,
      }));
    },
    renameSync(...args) {
      state.calls.push(["rename", ...args]);
    },
    rmSync(...args) {
      state.calls.push(["remove", ...args]);
    },
    writeFileSync(...args) {
      state.calls.push(["write", ...args]);
    },
  };
  return state;
}
const windowsClock =
  "const process = {pid:7301}; const Date = {now:nativeFixture.now}; const Math = {random:nativeFixture.random};";

test("Windows cleanup gates resource references and PID projection while retaining live callbacks and result arrays", async () => {
  const state = windowsPorts();
  const { runWindowsUpdateProcessCleanup } = await loadNativeOwner(
    "windowsInstallResourceLocks",
    state,
    windowsModules,
    windowsClock,
  );
  const markers = [" C:/Fixture/Knorvia ", " "];
  const one = { pid: 17, commandLine: "C:\\fixture\\KNORVIA\\host.exe" };
  const duplicate = { pid: 17, executablePath: "C:/fixture/knorvia/agent.exe" };
  const unsafe = { pid: Number.MAX_SAFE_INTEGER + 1, commandLine: "C:/fixture/knorvia/tool" };
  const zero = { pid: 0, commandLine: "C:/fixture/knorvia/tool" };
  const foreign = { pid: 99, commandLine: "C:/different/tool" };
  const remaining = [foreign];
  const terminated = [{ retained: true }];
  const events = [];
  const nextMarkers = ["D:/Fixture/tools"];
  const options = {
    resourceLockMarkers: markers,
    lockReleaseGraceMs: 750,
    async scan(value) {
      assert.equal(this, options);
      events.push(["scan", value]);
      return events.length === 1 ? [one, duplicate, unsafe, zero, foreign] : remaining;
    },
    async terminate(pids) {
      assert.equal(this, options);
      events.push(["terminate", pids]);
      options.lockReleaseGraceMs = 23;
      options.resourceLockMarkers = nextMarkers;
      return terminated;
    },
    async delay(ms) {
      assert.equal(this, options);
      events.push(["delay", ms]);
    },
  };
  const result = await runWindowsUpdateProcessCleanup(options);
  assert.deepEqual(result.initialLockProcesses, [one, duplicate, unsafe, zero]);
  assert.equal(result.initialLockProcesses[0], one);
  assert.deepEqual(result.terminationPids, [17]);
  assert.equal(events[1][1], result.terminationPids);
  assert.equal(result.terminationResults, terminated);
  assert.equal(result.remainingLockProcesses, remaining);
  assert.deepEqual(
    events.map(([kind]) => kind),
    ["scan", "terminate", "delay", "scan"],
  );
  assert.equal(events[0][1], markers);
  assert.equal(events[2][1], 23);
  assert.equal(events[3][1], nextMarkers);
});

test("Windows cleanup preserves ordered phase errors and empty-PID early return", async () => {
  const state = windowsPorts();
  const { runWindowsUpdateProcessCleanup } = await loadNativeOwner(
    "windowsInstallResourceLocks",
    state,
    windowsModules,
    windowsClock,
  );
  const markers = ["C:/fixture/tools"];
  let scans = 0;
  const calls = [];
  const result = await runWindowsUpdateProcessCleanup({
    resourceLockMarkers: markers,
    lockReleaseGraceMs: 750,
    async scan() {
      calls.push("scan");
      if (++scans === 1) return [{ pid: 11, executablePath: "C:/fixture/tools/a" }];
      throw "fixture rescan";
    },
    async terminate() {
      calls.push("terminate");
      throw new Error("fixture terminate");
    },
    async delay() {
      calls.push("delay");
      throw new Error("fixture grace");
    },
  });
  assert.deepEqual(calls, ["scan", "terminate", "delay", "scan"]);
  assert.deepEqual(result.errors, [
    "terminate: fixture terminate",
    "release-grace: fixture grace",
    "rescan: fixture rescan",
  ]);
  const empty = await runWindowsUpdateProcessCleanup({
    resourceLockMarkers: markers,
    lockReleaseGraceMs: 750,
    async scan() {
      throw new Error("fixture initial");
    },
    async terminate() {
      assert.fail("no initial PID");
    },
    async delay() {
      assert.fail("no initial PID");
    },
  });
  assert.deepEqual(empty.errors, ["initial-scan: fixture initial"]);
  assert.deepEqual(empty.terminationPids, []);
  assert.deepEqual(empty.remainingLockProcesses, []);
});

test("Windows native query and sync probes retain command data, marker order and sentinel-only cleanup", async () => {
  const state = windowsPorts();
  state.execFileAsync = async (...args) => {
    state.calls.push(["query", ...args]);
    return {
      stdout: JSON.stringify([
        { ProcessId: 21, CommandLine: null },
        { ProcessId: -1 },
        { ProcessId: 0 },
      ]),
    };
  };
  const owner = await loadNativeOwner(
    "windowsInstallResourceLocks",
    state,
    windowsModules,
    windowsClock,
  );
  assert.deepEqual(await owner.findWindowsProcessesReferencingResourceMarkers([]), []);
  assert.equal(state.calls.length, 0);
  const rows = await owner.findWindowsProcessesReferencingResourceMarkers(
    ["C:/Fixture/O'Brien"],
    17,
  );
  assert.deepEqual(rows, [{ pid: 21, commandLine: undefined, executablePath: undefined }]);
  const [, command, args, options] = state.calls[0];
  assert.equal(command, "powershell.exe");
  assert.deepEqual(args.slice(0, 5), [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
  ]);
  assert.ok(args[5].includes("$markers = @('C:/Fixture/O''Brien')"));
  assert.deepEqual(options, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 17,
    maxBuffer: 2097152,
  });
  const resources = resolve("fixture-resources");
  assert.deepEqual(owner.resolveWindowsPackagedResourceLockMarkers(resources), [
    join(resources, "knorvia"),
    join(resources, "tools"),
  ]);
  const snapshot = owner.snapshotWindowsPackagedResources(resources);
  assert.equal(snapshot[0].entries.length, 20);
  assert.equal(snapshot[0].entries[0], "entry-0/");
  assert.deepEqual(snapshot[1].entries, []);
  let renames = 0;
  state.renameSync = (...values) => {
    state.calls.push(["rename", ...values]);
    if (++renames === 2) throw new Error("fixture restore failed");
  };
  state.rmSync = (...values) => {
    state.calls.push(["remove", ...values]);
    throw new Error("fixture removal failed");
  };
  // Fresh loading captures the supplied updated filesystem functions.
  const probeOwner = await loadNativeOwner(
    "windowsInstallResourceLocks",
    state,
    windowsModules,
    windowsClock,
  );
  const before = state.calls.length;
  const probes = probeOwner.probeWindowsPackagedResourceWritable(resources);
  assert.equal(probes[0].writable, false);
  assert.equal(probes[0].error, "fixture restore failed");
  assert.equal(probes[1].exists, false);
  assert.equal(probes[1].writable, false);
  const effects = state.calls
    .slice(before)
    .filter(([kind]) => ["write", "rename", "remove"].includes(kind));
  assert.deepEqual(
    effects.map(([kind]) => kind),
    ["write", "rename", "rename", "remove", "remove"],
  );
  assert.ok(effects[0][1].endsWith(".knorvia_resource_probe_7301_1234_8"));
  assert.deepEqual(effects[0].slice(2), ["probe\n", "utf8"]);
  assert.equal(effects[3][1], effects[0][1]);
  assert.equal(effects[4][1], `${effects[0][1]}.renamed`);
});

const logClock =
  "const Date = class {toLocaleTimeString(locale, options) {return nativeFixture.formatTime(locale, options)}};";
function logPorts() {
  const state = {
    calls: [],
    published: [],
    formatTime(locale, options) {
      assert.equal(locale, undefined);
      assert.deepEqual(options, {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      return "01:02:03";
    },
  };
  state.logger = Object.fromEntries(
    ["info", "warn", "error"].map((level) => [
      level,
      function (...values) {
        assert.equal(this, state.logger);
        state.calls.push([level, ...values]);
      },
    ]),
  );
  return state;
}

test("Host raw logs replay by severity and structured ownership clears both streams before publishing", async () => {
  const state = logPorts();
  const { createHostLogRelay } = await loadNativeOwner("hostLogRelay", state, {}, logClock);
  const relay = createHostLogRelay("fixture-host", state.logger, function (entry) {
    assert.equal(this, undefined);
    state.published.push(entry);
  });
  relay.onStdout("raw output\n");
  relay.onStderr("  (node:17) ExperimentalWarning: fixture\r\ntrace hint\n");
  relay.onStderr("fixture failure");
  relay.flushRawLogs();
  assert.deepEqual(state.calls, [
    ["info", "[host-stdout] (fixture-host):", "raw output\n"],
    ["warn", "[host-stderr] (fixture-host):", "(node:17) ExperimentalWarning: fixture"],
    ["error", "[host-stderr] (fixture-host):", "fixture failure"],
  ]);
  relay.onStdout("discarded");
  relay.onStructuredLog({
    level: "warn",
    source: "fixture",
    message: "structured",
    retained: 7,
    timestamp: "replace",
  });
  assert.deepEqual(state.published[0], {
    level: "warn",
    source: "fixture",
    message: "structured",
    retained: 7,
    timestamp: "01:02:03",
  });
  assert.deepEqual(state.calls.at(-1), ["warn", "[host-log] (fixture-host) [fixture] structured"]);
  const size = state.calls.length;
  relay.onStderr("ignored");
  relay.flushRawLogs();
  assert.equal(state.calls.length, size);
});

test("Host live raw-buffer reentrancy and thrown logger keep original replay and irreversible structured phase", async () => {
  const state = logPorts();
  const { createHostLogRelay } = await loadNativeOwner("hostLogRelay", state, {}, logClock);
  let relay;
  let fail = true;
  let appended = false;
  const original = new Error("fixture logger failure");
  state.logger.info = function (...values) {
    assert.equal(this, state.logger);
    state.calls.push(["info", ...values]);
    if (!appended) {
      appended = true;
      relay.onStdout("third");
    }
    if (values[1] === "second" && fail) throw original;
  };
  relay = createHostLogRelay("fixture", state.logger);
  relay.onStdout("first");
  relay.onStdout("second");
  assert.throws(
    () => relay.flushRawLogs(),
    (error) => error === original,
  );
  fail = false;
  relay.flushRawLogs();
  assert.deepEqual(
    state.calls.map((row) => row[2]),
    ["first", "second", "first", "second", "third"],
  );
  state.logger.error = () => {
    throw original;
  };
  relay.onStderr("will be discarded");
  assert.throws(
    () => relay.onStructuredLog({ level: "error", source: "fixture", message: "failed" }),
    (error) => error === original,
  );
  const size = state.calls.length;
  relay.onStdout("ignored");
  relay.flushRawLogs();
  assert.equal(state.calls.length, size);
});
