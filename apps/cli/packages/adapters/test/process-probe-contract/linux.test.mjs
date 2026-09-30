// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { target } from "./subject.mjs";
import { deferred, flush, proc, readers, rows, stat, world } from "./fixture.mjs";
const loaded = await target();
after(() => loaded.dispose());
const { linux } = loaded.subject;

test("Linux completes relationship pass before reading only requested tree status", async () => {
  const w = world({ ...proc(11, 0, 7, 10), ...proc(12, 11, 7, 20), ...proc(13, 0, 8, 30) }, [
    "13",
    "11",
    "self",
    "12",
  ]);
  assert.deepEqual(rows(await linux.sampleLinuxProcessTrees(readers(w), [11])), [
    [
      11,
      [
        { pid: 11, rssKb: 10, cpuTimeMs: 50 },
        { pid: 12, rssKb: 20, cpuTimeMs: 50 },
      ],
    ],
  ]);
  assert.deepEqual(w.trace, [
    ["list", "/proc"],
    ["read", "/proc/13/stat", "utf8"],
    ["read", "/proc/11/stat", "utf8"],
    ["read", "/proc/12/stat", "utf8"],
    ["read", "/proc/11/status", "utf8"],
    ["read", "/proc/12/status", "utf8"],
  ]);
});
test("Linux tree output retains root request order and DFS child order", async () => {
  const w = world({ ...proc(11), ...proc(12, 11), ...proc(13, 11), ...proc(14, 12) }, [
    "11",
    "12",
    "13",
    "14",
  ]);
  const sampled = await linux.sampleLinuxProcessTrees(readers(w), [13, 11, 99]);
  assert.deepEqual(
    rows(sampled).map(([root, samples]) => [root, samples.map((x) => x.pid)]),
    [
      [13, [13]],
      [11, [11, 12, 14, 13]],
    ],
  );
});
test("Linux process group matches group id independently from parent tree", async () => {
  const w = world({ ...proc(11, 0, 7, 1), ...proc(12, 11, 8, 2), ...proc(13, 99, 7, 3) }, [
    "11",
    "12",
    "13",
  ]);
  assert.deepEqual(await linux.sampleLinuxProcessGroup(readers(w), 7), [
    { pid: 11, rssKb: 1, cpuTimeMs: 50 },
    { pid: 13, rssKb: 3, cpuTimeMs: 50 },
  ]);
  assert.deepEqual(
    w.trace.filter((x) => x[1].endsWith("/status")).map((x) => x[1]),
    ["/proc/11/status", "/proc/13/status"],
  );
});
test("Linux command parentheses do not shift relationship or CPU fields", async () => {
  const w = world({ ...proc(11, 0, 7, 5, [12, 4]) }, ["11"]);
  assert.equal(w.trace.length, 0);
  assert.deepEqual(await linux.sampleLinuxProcessGroup(readers(w), 7), [
    { pid: 11, rssKb: 5, cpuTimeMs: 160 },
  ]);
});
test("Linux unreadable stat and malformed rows disappear without failing the scan", async () => {
  const w = world({ ...proc(11), "/proc/12/stat": "bad", "/proc/13/stat": stat(13, -1, 7) }, [
    "11",
    "12",
    "13",
    "14",
    "self",
  ]);
  assert.deepEqual(rows(await linux.sampleLinuxProcessTrees(readers(w), [11, 12, 13, 14])), [
    [11, [{ pid: 11, rssKb: 12, cpuTimeMs: 50 }]],
  ]);
});
test("Linux existing root with missing status keeps an empty tree", async () => {
  const w = world({ "/proc/11/stat": stat(11) }, ["11"]);
  assert.deepEqual(rows(await linux.sampleLinuxProcessTrees(readers(w), [11])), [[11, []]]);
});
test("Linux nonnumeric, negative and fractional VmRSS yield empty existing trees", async () => {
  for (const rss of ["N/A", "-2", "1.5"]) {
    const w = world({ ...proc(11), "/proc/11/status": `VmRSS:\t${rss} kB\n` }, ["11"]);
    assert.deepEqual(rows(await linux.sampleLinuxProcessTrees(readers(w), [11])), [[11, []]]);
  }
});
test("Linux disappearing parent status still permits readable children", async () => {
  const w = world({ "/proc/11/stat": stat(11), ...proc(12, 11, 7, 2) }, ["11", "12"]);
  assert.deepEqual(rows(await linux.sampleLinuxProcessTrees(readers(w), [11])), [
    [11, [{ pid: 12, rssKb: 2, cpuTimeMs: 50 }]],
  ]);
});
test("Linux missing root and missing group are valid empty results", async () => {
  const w = world(proc(11), ["11"]);
  assert.deepEqual(rows(await linux.sampleLinuxProcessTrees(readers(w), [99])), []);
  assert.deepEqual(await linux.sampleLinuxProcessGroup(readers(w), 99), []);
});
test("Linux directory failure preserves its public diagnostic wrapper", async () => {
  const error = new Error("Controlled directory failure");
  await assert.rejects(
    linux.sampleLinuxProcessTrees(
      {
        listProcDirectory: async () => {
          throw error;
        },
        readProcFile: async () => "",
      },
      [11],
    ),
    (value) =>
      value.name === "Error" &&
      value.message === "/proc 不可读: Error: Controlled directory failure",
  );
});
test("Linux expired before scan never reads a proc file", async () => {
  const w = world(proc(11), ["11"]);
  await assert.rejects(
    linux.sampleLinuxProcessTrees({ ...readers(w), isExpired: () => true }, [11]),
    /\/proc 扫描超时/,
  );
  assert.equal(w.trace.filter((x) => x[0] === "read").length, 0);
});
test("Linux expiration after a stat read stops the next phase", async () => {
  const w = world({ ...proc(11), ...proc(12, 11) }, ["11", "12"]);
  let expired = false;
  const ports = {
    ...readers(w),
    readProcFile: async (path) => {
      const data = await w.readFile(path, "utf8");
      expired = true;
      return data;
    },
    isExpired: () => expired,
  };
  await assert.rejects(linux.sampleLinuxProcessTrees(ports, [11]), /\/proc 扫描超时/);
  assert.deepEqual(
    w.trace.filter((x) => x[0] === "read").map((x) => x[1]),
    ["/proc/11/stat", "/proc/12/stat"],
  );
});
test("Linux accepts at most 64 concurrent stat reads and checks expiry before the next batch", async () => {
  const gate = deferred();
  const starts = [];
  let expired = false;
  const ports = {
    listProcDirectory: async () => Array.from({ length: 130 }, (_, i) => String(i + 11)),
    readProcFile: async (path) => {
      starts.push(path);
      await gate.promise;
      return stat(Number(path.split("/")[2]));
    },
    isExpired: () => expired,
  };
  const pending = linux.sampleLinuxProcessTrees(ports, [11]);
  await flush();
  assert.equal(starts.length, 64);
  expired = true;
  gate.resolve();
  await assert.rejects(pending, /\/proc 扫描超时/);
  assert.equal(starts.length, 64);
});
