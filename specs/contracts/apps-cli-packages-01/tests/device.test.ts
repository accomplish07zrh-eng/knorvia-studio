// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01 合同测试：device/*（B79–B87）。
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { load } from "./entry.mjs";

const probe = await load("device/process-probe");
const shared = await load("device/process-probe-shared");
const linux = await load("device/process-probe-linux");
const windows = await load("device/process-probe-windows");
const darwin = await load("device/process-probe-darwin");
const deviceMid = await load("device/cli-device-mid");

async function tempDir(t, prefix = "knorvia-contract-device-") {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  t.after(async () => await rm(directory, { recursive: true, force: true }));
  return directory;
}

function failingExecFile() {
  let calls = 0;
  const executor = async () => {
    calls += 1;
    throw new Error("fixture failure");
  };
  return { executor, calls: () => calls };
}

function scriptedExecFile(responses) {
  const calls = [];
  const executor = async (file, args) => {
    calls.push({ args: [...args], file });
    const match = responses.find((response) => response.file === file);
    if (!match) throw new Error(`unexpected command: ${file}`);
    const value = typeof match.value === "function" ? match.value(args) : match.value;
    return { status: 0, stderr: "", stdout: "", ...value };
  };
  return { calls, executor };
}

test("B79 进程探测的失败预算与单次截止", async () => {
  const failures = [];
  const { executor, calls } = failingExecFile();
  const instance = probe.createProcessProbe({
    platform: "win32",
    execFile: executor,
    onSampleFailed: (reason) => failures.push(reason),
  });
  for (let index = 0; index < 3; index += 1) {
    assert.equal(await instance.sampleProcessTrees([1]), undefined);
  }
  assert.equal(calls(), 3);
  assert.equal(failures.length, 3);
  assert.equal(await instance.sampleProcessTrees([1]), undefined);
  assert.equal(calls(), 3, "失败预算用尽后不再发起调用");
  instance.reset();
  assert.equal(await instance.sampleProcessTrees([1]), undefined);
  assert.equal(calls(), 4);
  const never = probe.createProcessProbe({
    platform: "win32",
    execFile: () => new Promise(() => {}),
    onSampleFailed: (reason) => failures.push(reason),
  });
  const startedAt = Date.now();
  assert.equal(await never.sampleProcessTrees([1]), undefined);
  assert.equal(Date.now() - startedAt >= shardTimeout() - 200, true);
  assert.equal(
    failures.some((reason) => reason.includes("1000")),
    true,
  );
  const throwingObserver = probe.createProcessProbe({
    platform: "win32",
    execFile: async () => {
      throw new Error("boom");
    },
    onSampleFailed: () => {
      throw new Error("observer boom");
    },
  });
  assert.equal(await throwingObserver.sampleProcessTrees([1]), undefined);
});

function shardTimeout() {
  return shared.PROCESS_PROBE_SAMPLE_TIMEOUT_MS;
}

test("B80 sampleProcessTrees 的入口处理与平台分派", async () => {
  const emptyMap = new Map();
  const emptyLinux = probe.createProcessProbe({
    platform: "linux",
    listProcDirectory: async () => [],
    readProcFile: async () => "",
  });
  assert.deepEqual(await emptyLinux.sampleProcessTrees([]), emptyMap);
  assert.equal(emptyLinux.treeScope, "process_tree");
  const { executor } = scriptedExecFile([
    {
      file: "tasklist",
      value: { stdout: '"a.exe","1234","Console","1","10 K"\n"b.exe","9","Console","1","1 K"\n' },
    },
  ]);
  const win = probe.createProcessProbe({ platform: "win32", execFile: executor });
  assert.equal(win.treeScope, "direct_process");
  const winResult = await win.sampleProcessTrees([1234, 0, -3, 1.5, 1234]);
  assert.deepEqual([...winResult.keys()], [1234]);
  assert.deepEqual(winResult.get(1234), [{ pid: 1234, rssKb: 10 }]);
  const darwinScript = scriptedExecFile([
    { file: "ps", value: { stdout: "1 0 100 01:00\n2 1 200 02:00\n" } },
  ]);
  const mac = probe.createProcessProbe({ platform: "darwin", execFile: darwinScript.executor });
  const macResult = await mac.sampleProcessTrees([1]);
  assert.deepEqual(macResult.get(1), [
    { pid: 1, rssKb: 100, cpuTimeMs: 60000 },
    { pid: 2, rssKb: 200, cpuTimeMs: 120000 },
  ]);
});

test("B81 sampleProcessGroup 的平台与 PID 约束", async () => {
  const { executor, calls } = scriptedExecFile([]);
  const win = probe.createProcessProbe({ platform: "win32", execFile: executor });
  assert.equal(await win.sampleProcessGroup(1), undefined);
  assert.equal(calls.length, 0);
  const linuxInstance = probe.createProcessProbe({
    platform: "linux",
    listProcDirectory: async () => ["1", "2", "3"],
    readProcFile: async (path) => {
      if (path.endsWith("/stat")) {
        if (path.includes("/1/")) return "1 (init) S 0 3 3 0 0 0 0 0 0 0 10 20";
        if (path.includes("/2/")) return "2 (a) S 1 3 3 0 0 0 0 0 0 0 30 40";
        return "3 (b) S 1 4 4 0 0 0 0 0 0 0 0 0";
      }
      return "Name:\tx\nVmRSS:\t  128 kB\n";
    },
  });
  assert.equal(await linuxInstance.sampleProcessGroup(0), undefined);
  assert.equal(await linuxInstance.sampleProcessGroup(1.5), undefined);
  const group = await linuxInstance.sampleProcessGroup(3);
  assert.deepEqual(
    group.map((row) => row.pid),
    [1, 2],
  );
  assert.equal(
    group.every((row) => row.rssKb === 128),
    true,
  );
});

test("B82 共享纯函数与命令契约", async () => {
  assert.equal(shared.PROCESS_PROBE_SAMPLE_TIMEOUT_MS, 1000);
  assert.equal(shared.isSamplablePid(1), true);
  assert.equal(shared.isSamplablePid(0), false);
  assert.equal(shared.isSamplablePid(1.5), false);
  assert.deepEqual(shared.toSample({ pid: 1, rssKb: 2 }), { pid: 1, rssKb: 2 });
  assert.deepEqual(shared.toSample({ pid: 1, rssKb: 2, cpuTimeMs: 3 }), {
    pid: 1,
    rssKb: 2,
    cpuTimeMs: 3,
  });
  const trees = shared.collectProcessTreePids(
    [
      { pid: 1, parentPid: 0 },
      { pid: 2, parentPid: 1 },
      { pid: 3, parentPid: 1 },
      { pid: 2, parentPid: 9 },
    ],
    [1, 99],
  );
  assert.deepEqual([...trees.keys()], [1]);
  assert.deepEqual(trees.get(1), [1, 2, 3]);
  const grouped = shared.groupProcessTrees(
    [
      { pid: 1, rssKb: 10 },
      { pid: 2, parentPid: 1, rssKb: 20 },
      { pid: 2, parentPid: 1, rssKb: 99 },
    ],
    [1],
  );
  assert.deepEqual(grouped.get(1), [
    { pid: 1, rssKb: 10 },
    { pid: 2, rssKb: 99 },
  ]);
  const failing = async () => ({ status: 1, stderr: "boom", stdout: "" });
  await assert.rejects(
    () => shared.runProbeCommand(failing, "tasklist", []),
    (error) =>
      error instanceof shared.ProcessProbeFailure && error.message.includes("采样失败: boom"),
  );
  const emptyStderr = async () => ({ status: 1, stderr: "", stdout: "" });
  await assert.rejects(
    () => shared.runProbeCommand(emptyStderr, "tasklist", []),
    (error) => error.message.includes("tasklist 采样失败: 1"),
  );
  const missing = await shared.defaultProbeExecFile("knorvia-definitely-missing-command", [], {
    encoding: "utf8",
  });
  assert.equal(missing.status, null);
  assert.equal(missing.error !== undefined, true);
});

test("B83 Linux /proc 解析契约", async () => {
  const files = new Map([
    ["/proc/1/stat", "1 (init) S 0 1 1 0 0 0 0 0 0 0 100 200"],
    ["/proc/2/stat", "2 (child) S 1 1 1 0 0 0 0 0 0 0 50 50"],
    ["/proc/3/stat", "3 (other) S 1 2 2 0 0 0 0 0 0 0 10 10"],
    ["/proc/1/status", "Name:\tinit\nVmRSS:\t  512 kB\n"],
    ["/proc/2/status", "Name:\tchild\n"],
    ["/proc/3/status", "Name:\tother\nVmRSS:\t64 kB\n"],
  ]);
  const readers = {
    listProcDirectory: async () => ["1", "2", "3", "not-a-pid"],
    readProcFile: async (path) => {
      const value = files.get(path);
      if (value === undefined) throw new Error(`missing ${path}`);
      return value;
    },
  };
  const sample = await linux.sampleLinuxProcessTrees(readers, [1]);
  assert.deepEqual(
    sample.get(1).map((row) => [row.pid, row.rssKb]),
    [
      [1, 512],
      [3, 64],
    ],
  );
  assert.equal(sample.get(1).find((row) => row.pid === 1).cpuTimeMs, 3000);
  assert.equal(
    sample.get(1).some((row) => row.pid === 2),
    false,
  );
  const group = await linux.sampleLinuxProcessGroup(readers, 2);
  assert.deepEqual(group, [{ pid: 3, rssKb: 64, cpuTimeMs: 200 }]);
  await assert.rejects(
    () => linux.sampleLinuxProcessTrees({ ...readers, isExpired: () => true }, [1]),
    (error) => error instanceof shared.ProcessProbeFailure,
  );
  const failingReaders = {
    listProcDirectory: async () => {
      throw new Error("no proc");
    },
    readProcFile: async () => "",
  };
  await assert.rejects(
    () => linux.sampleLinuxProcessTrees(failingReaders, [1]),
    (error) => error.message.includes("/proc 不可读"),
  );
});

test("B84 Windows tasklist CSV 解析", async () => {
  const { executor } = scriptedExecFile([
    {
      file: "tasklist",
      value: {
        stdout: [
          '"node.exe","1234","Console","1","12,345 K"',
          '"other.exe","9999","Console","1","1 K"',
          '"broken","1","Console","1","2 K',
          '"no-mem.exe","2","Console","1","N/A"',
        ].join("\r\n"),
      },
    },
  ]);
  const rows = await windows.readWindowsProcessMemory(executor, [1234, 2]);
  assert.deepEqual(rows, [{ pid: 1234, rssKb: 12345 }]);
});

test("B85 Darwin ps 解析", async () => {
  const tableScript = scriptedExecFile([
    {
      file: "ps",
      value: {
        stdout: [
          "1 0 100 01:02",
          "2 1 200 1-00:00:01",
          "3 1 300 bogus",
          "4 1 400 00:01 extra",
          "5 1 500 1-2-3",
        ].join("\n"),
      },
    },
  ]);
  const table = await darwin.readDarwinProcessTable(tableScript.executor);
  assert.equal(table.length, 4);
  assert.deepEqual(table[0], { pid: 1, rssKb: 100, parentPid: 0, cpuTimeMs: 62000 });
  assert.deepEqual(table[1], { pid: 2, rssKb: 200, parentPid: 1, cpuTimeMs: 86401000 });
  assert.equal(table[2].pid, 3);
  assert.equal(table[2].cpuTimeMs, undefined);
  assert.equal(table[3].pid, 5);
  assert.equal(table[3].cpuTimeMs, undefined);
  const groupScript = scriptedExecFile([{ file: "ps", value: { stdout: "1 100 01:00\n" } }]);
  const group = await darwin.readDarwinProcessGroup(groupScript.executor, 5);
  assert.deepEqual(group, [{ pid: 1, rssKb: 100, cpuTimeMs: 60000 }]);
  assert.equal(groupScript.calls[0].args.includes("-g"), true);
});

test("B86 device 导出面", async () => {
  assert.deepEqual(Object.keys(linux).sort(), [
    "sampleLinuxProcessGroup",
    "sampleLinuxProcessTrees",
  ]);
  assert.deepEqual(Object.keys(windows), ["readWindowsProcessMemory"]);
  assert.deepEqual(Object.keys(darwin).sort(), [
    "readDarwinProcessGroup",
    "readDarwinProcessTable",
  ]);
  assert.deepEqual(Object.keys(deviceMid), ["ensureCliDeviceMid"]);
  assert.deepEqual(Object.keys(probe).sort(), [
    "PROCESS_PROBE_SAMPLE_TIMEOUT_MS",
    "createProcessProbe",
  ]);
  for (const name of [
    "ProcessProbeFailure",
    "collectProcessTreePids",
    "defaultProbeExecFile",
    "groupProcessTrees",
    "isSamplablePid",
    "runProbeCommand",
    "toSample",
  ]) {
    assert.equal(typeof shared[name] !== "undefined", true, `shared 应导出 ${name}`);
  }
  assert.equal(typeof probe.createProcessProbe, "function");
  assert.equal(shared.isSamplablePid(1), true);
  assert.deepEqual(shared.toSample({ pid: 1, rssKb: 2 }), { pid: 1, rssKb: 2 });
  assert.equal(probe.CreateProcessProbeOptions, undefined);
});

test("B87 设备标识生成、单飞与落盘", async (t) => {
  const first = await tempDir(t);
  const created = await deviceMid.ensureCliDeviceMid({ baseDir: first, createId: () => "id-1" });
  assert.equal(created, "id-1");
  const statePath = join(first, ".knorvia-studio", "v2", "telemetry-state.json");
  assert.equal(await readFile(statePath, "utf8"), '{\n  "deviceMid": "id-1"\n}');
  assert.deepEqual(
    await (await import("node:fs/promises")).readdir(join(first, ".knorvia-studio", "v2")),
    ["telemetry-state.json"],
  );
  const cached = await deviceMid.ensureCliDeviceMid({ baseDir: first, createId: () => "id-2" });
  assert.equal(cached, "id-1");
  const [a, b] = await Promise.all([
    deviceMid.ensureCliDeviceMid({ baseDir: first, createId: () => "id-3" }),
    deviceMid.ensureCliDeviceMid({ baseDir: first, createId: () => "id-4" }),
  ]);
  assert.equal(a, b);
  const kept = await tempDir(t);
  const keptState = join(kept, ".knorvia-studio", "v2", "telemetry-state.json");
  await (
    await import("node:fs/promises")
  ).mkdir(join(kept, ".knorvia-studio", "v2"), { recursive: true });
  await writeFile(keptState, '{"deviceMid":"keep"}');
  assert.equal(
    await deviceMid.ensureCliDeviceMid({ baseDir: kept, createId: () => "ignored" }),
    "keep",
  );
  assert.equal(await readFile(keptState, "utf8"), '{"deviceMid":"keep"}');
  const stale = await tempDir(t);
  const staleDir = join(stale, ".knorvia-studio", "v2");
  await (await import("node:fs/promises")).mkdir(staleDir, { recursive: true });
  await writeFile(
    join(staleDir, "telemetry-state.lock"),
    JSON.stringify({ createdAt: Date.now(), pid: 2147483647 }),
  );
  assert.equal(
    await deviceMid.ensureCliDeviceMid({ baseDir: stale, createId: () => "reclaimed" }),
    "reclaimed",
  );
  assert.equal(
    JSON.parse(await readFile(join(staleDir, "telemetry-state.json"), "utf8")).deviceMid,
    "reclaimed",
  );
  const stuck = await tempDir(t);
  const stuckDir = join(stuck, ".knorvia-studio", "v2");
  await (await import("node:fs/promises")).mkdir(stuckDir, { recursive: true });
  await writeFile(join(stuckDir, "telemetry-state.lock"), "not json");
  const startedAt = Date.now();
  assert.equal(
    await deviceMid.ensureCliDeviceMid({ baseDir: stuck, createId: () => "fallback" }),
    "fallback",
  );
  assert.equal(Date.now() - startedAt >= 1500, true, "锁超时后走同一请求的生成值");
});
