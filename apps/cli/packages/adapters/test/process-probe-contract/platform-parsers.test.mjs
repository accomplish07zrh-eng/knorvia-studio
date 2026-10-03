// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { target } from "./subject.mjs";
import { result } from "./fixture.mjs";
const loaded = await target();
after(() => loaded.dispose());
const { darwin, windows } = loaded.subject;

test("Darwin table invokes exactly one ps with fixed fields", async () => {
  const calls = [];
  const data = await darwin.readDarwinProcessTable(async (...args) => {
    calls.push(args);
    return result("11 0 12 0:02\n12 11 3 invalid\n");
  });
  assert.deepEqual(data, [
    { pid: 11, rssKb: 12, parentPid: 0, cpuTimeMs: 2000 },
    { pid: 12, rssKb: 3, parentPid: 11 },
  ]);
  assert.deepEqual(calls, [
    [
      "ps",
      ["-eo", "pid=,ppid=,rss=,cputime="],
      { encoding: "utf8", maxBuffer: 8388608, timeout: 1000 },
    ],
  ]);
});
test("Darwin CPU supports seconds, minute/hour/day components and historical permissive limits", async () => {
  const values = [
    "00:02",
    "02.125",
    "1:02.5",
    "2:03:04",
    "1-02:03:04.5",
    "1:99",
    "-2:03",
    "0:0",
    "1:2:3:4",
  ];
  const data = await darwin.readDarwinProcessTable(async () =>
    result(values.map((v, i) => `${i + 11} 0 4 ${v}`).join("\n")),
  );
  assert.deepEqual(
    data.map((x) => x.cpuTimeMs),
    [2000, 2125, 62500, 7384000, 93784500, 159000, 123000, 0, undefined],
  );
});
test("Darwin malformed identifiers and RSS skip rows without making invalid CPU discard valid rows", async () => {
  const data = await darwin.readDarwinProcessTable(async () =>
    result("bad\n0 0 4 0:1\n-1 0 4 0:1\n11.5 0 4 0:1\n11 -1 4 0:1\n11 0 -4 0:1\n12 0 0 bad\n"),
  );
  assert.deepEqual(data, [{ pid: 12, rssKb: 0, parentPid: 0 }]);
});
test("Darwin group projection has no parent and retains command/argument sequence", async () => {
  const calls = [];
  assert.deepEqual(
    await darwin.readDarwinProcessGroup(async (...args) => {
      calls.push(args);
      return result("11 6 1:02\n12 0 invalid\n");
    }, 7),
    [
      { pid: 11, rssKb: 6, cpuTimeMs: 62000 },
      { pid: 12, rssKb: 0 },
    ],
  );
  assert.deepEqual(calls[0][1], ["-o", "pid=,rss=,cputime=", "-g", "7"]);
  assert.equal(calls.length, 1);
});
test("platform wrappers propagate a command failure", async () => {
  await assert.rejects(
    darwin.readDarwinProcessTable(async () => result("", { status: 2 })),
    /ps 采样失败: 2/,
  );
  await assert.rejects(
    windows.readWindowsProcessMemory(async () => result("", { status: 2 }), [11]),
    /tasklist 采样失败: 2/,
  );
});
test("Windows tasklist output order and CSV quoting are preserved; only requested direct processes", async () => {
  const calls = [];
  const text =
    '"controlled, worker","42","Console","1","1,024 K"\r\n"other","43","Console","1","2 K"\r\n"skipped","44","Console","1","9 K"';
  assert.deepEqual(
    await windows.readWindowsProcessMemory(
      async (...args) => {
        calls.push(args);
        return result(text);
      },
      [43, 42],
    ),
    [
      { pid: 42, rssKb: 1024 },
      { pid: 43, rssKb: 2 },
    ],
  );
  assert.deepEqual(calls, [
    [
      "tasklist",
      ["/FO", "CSV", "/NH"],
      { encoding: "utf8", maxBuffer: 8388608, timeout: 1000, windowsHide: true },
    ],
  ]);
});
test("Windows low-level reader still makes one command for each request; factory owns early validation", async () => {
  let calls = 0;
  for (const pids of [[], [0, -1, NaN, 1.5]])
    assert.deepEqual(
      await windows.readWindowsProcessMemory(async () => {
        calls++;
        return result();
      }, pids),
      [],
    );
  assert.equal(calls, 2);
});
test("Windows historical punctuation stripping, zero and missing memory retain field semantics", async () => {
  const text =
    '"one","1","C","1","-25 K"\n"two","2","C","1","N/A"\n"three","3.5","C","1","12 K"\n"four","4","C","1","0 K"';
  assert.deepEqual(
    await windows.readWindowsProcessMemory(async () => result(text), [1, 2, 3.5, 4]),
    [
      { pid: 1, rssKb: 25 },
      { pid: 3.5, rssKb: 12 },
      { pid: 4, rssKb: 0 },
    ],
  );
});
