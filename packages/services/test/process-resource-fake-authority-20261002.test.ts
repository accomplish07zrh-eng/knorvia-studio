import assert from "node:assert/strict";
import { mock, test } from "node:test";

test("synthetic resource ports preserve cancellation, baselines and attributed PID containment", async () => {
  const forbidden = () => {
    throw new Error("real process/filesystem/resource access forbidden");
  };
  mock.module("node:child_process", { namedExports: { execFile: forbidden } });
  mock.module("node:fs/promises", { namedExports: { readdir: forbidden, readFile: forbidden } });
  mock.module("node:os", { defaultExport: { cpus: forbidden } });
  mock.module("@knorvia/shared", {
    namedExports: {
      formatKnorviaAgentProcessName: (provider: string, path: string) => `fake:${provider}:${path}`,
    },
  });
  const owner = await import("../src/process/processResourceSampler.js");
  const reads: string[] = [];
  const fields = ["S", "1", ...Array<string>(9).fill("0"), "12", "8"];
  const linux = owner.createProcessResourceTableReader({
    platform: "linux",
    readdir: async (path) => {
      assert.equal(path, "/proc");
      return ["123", "not-pid", "124"];
    },
    readFile: async (path) => {
      reads.push(path);
      if (path.includes("124"))
        throw Object.assign(new Error("synthetic denied"), { code: "EACCES" });
      return path.endsWith("stat") ? `123 (a (b)) ${fields.join(" ")}` : "VmRSS:\t2048 kB\n";
    },
  });
  assert.deepEqual(await linux(), [
    { pid: 123, ppid: 1, command: "a (b)", cpuTimeMs: 200, rssKb: 2048 },
  ]);
  assert.deepEqual(reads, [
    "/proc/123/stat",
    "/proc/123/status",
    "/proc/124/stat",
    "/proc/124/status",
  ]);
  assert.equal(owner.parseLinuxVmRssKb("other VmRSS: 10 kB\nVmRSS: 7 kB extra"), 7);
  assert.equal(owner.parseLinuxVmRssKb("VmRSS: denied"), 0);
  assert.equal(owner.parseLinuxVmRssKb("VmRSS:9kB"), 9);
  const denied = new Error("synthetic table permission failure");
  assert.equal(
    await owner.createProcessResourceTableReader({
      platform: "linux",
      readdir: async () => {
        throw denied;
      },
    })(),
    undefined,
  );
  const windows = owner.createProcessResourceTableReader({
    platform: "win32",
    execFile: async (file, args, options) => {
      assert.equal(file, "powershell.exe");
      assert.deepEqual(args.slice(0, 4), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"]);
      assert.match(args[4]!, /^Get-CimInstance Win32_Process \|/);
      assert.deepEqual(options, {
        timeout: 5000,
        maxBuffer: 16777216,
        windowsHide: true,
        signal: undefined,
      });
      return { stdout: "501 1 2048 10000000\u2028fake command\nbad row" };
    },
  });
  assert.deepEqual(await windows(), [
    { pid: 501, ppid: 1, rssKb: 2, cpuTimeMs: 1000, command: "fake command" },
  ]);
  const posix = owner.createProcessResourceTableReader({
    platform: "darwin",
    execFile: async (file, args, options) => {
      assert.equal(file, "ps");
      assert.deepEqual(args, ["-axo", "pid=,ppid=,rss=,cputime=,comm="]);
      assert.deepEqual(options, { timeout: 3000, maxBuffer: 16777216, signal: undefined });
      return { stdout: "601 1 50 1-02:03:04.5 /fake command" };
    },
  });
  assert.equal((await posix())?.[0]?.cpuTimeMs, 93784500);
  const rejected = owner.createProcessResourceTableReader({
    platform: "win32",
    execFile: async () => {
      throw denied;
    },
  });
  await assert.rejects(rejected(), (error) => error === denied);
  let at = 1000;
  let cpuTimeMs = 100;
  let present = true;
  const sampler = owner.createProcessResourceSampler({
    now: () => at,
    logicalCpuCount: 2,
    readTable: async () =>
      present ? [{ pid: 10, ppid: 1, rssKb: 2, cpuTimeMs, command: "fake" }] : [],
  });
  assert.equal((await sampler.sample())?.get(10)?.cpuPercent, 0);
  const cancellation = new Error("synthetic late cancellation");
  const abort = new AbortController();
  abort.abort(cancellation);
  at = 2000;
  cpuTimeMs = 600;
  await assert.rejects(sampler.sample(abort.signal), (error) => error === cancellation);
  at = 3000;
  cpuTimeMs = 200;
  assert.equal((await sampler.sample())?.get(10)?.cpuPercent, 2.5);
  at = 63000;
  present = false;
  await sampler.sample();
  at = 64000;
  present = true;
  cpuTimeMs = 300;
  assert.equal((await sampler.sample())?.get(10)?.cpuPercent, 0.1);
  at = 124001;
  present = false;
  await sampler.sample();
  at = 125000;
  present = true;
  cpuTimeMs = 400;
  assert.equal((await sampler.sample())?.get(10)?.cpuPercent, 0);
  cpuTimeMs = 1;
  at++;
  assert.equal((await sampler.sample())?.get(10)?.cpuPercent, 0);

  const samples = new Map(
    [
      [1, 21],
      [10, 1],
      [20, 10],
      [21, 20],
      [30, 1],
      [50, 99],
      [51, 50],
      [90, 99],
    ].map(([pid, ppid]) => [
      pid!,
      { pid: pid!, ppid: ppid!, rssKb: 2, cpuPercent: 1, command: "/synthetic/worker.exe" },
    ]),
  );
  const rows = owner.attributeHostProcessTree({
    samples,
    hostPid: 1,
    agents: [
      {
        pid: 10,
        provider: "fake",
        workspacePath: "/synthetic",
        children: [
          { pid: 20, serverName: "fake-mcp", mcpSource: "plugin", pluginName: "community" },
        ],
      },
      { pid: 50, provider: "detached", workspacePath: "/synthetic", children: [] },
    ],
    builtinPluginPids: new Map([[30, "builtin"]]),
  });
  assert.deepEqual(
    rows.map((row) => row.pid),
    [10, 20, 21, 30, 50, 51],
  );
  assert.deepEqual(
    rows.map((row) => [row.pid, row.category, row.groupKey, row.name]),
    [
      [10, "base", "cli", "fake:fake:/synthetic"],
      [20, "community-plugin", "plugin:community", "fake-mcp"],
      [21, "community-plugin", "plugin:community", "worker"],
      [30, "builtin-plugin", "builtin", "worker"],
      [50, "base", "cli", "fake:detached:/synthetic"],
      [51, "base", "cli", "worker"],
    ],
  );
  assert.ok(rows.every((row) => row.memoryBytes === 2048 && row.cpuPercent === 1));
});
