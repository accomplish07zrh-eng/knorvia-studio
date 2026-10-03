// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { target } from "./subject.mjs";
import { proc, readers, result, rows, stat, world } from "./fixture.mjs";
const matrix = JSON.parse(await readFile(new URL("./parser-matrix.json", import.meta.url), "utf8"));
assert.equal(matrix.sourceCommit, "76c233875181793a340b1e41da99f18b4f8e279f");
const loaded = await target();
after(() => loaded.dispose());
const { darwin, windows, linux } = loaded.subject;
test("frozen Darwin CPU matrix keeps 18 malformed and permissive boundaries", async () => {
  assert.equal(matrix.darwinCpu.length, 18);
  for (const row of matrix.darwinCpu)
    assert.deepEqual(
      await darwin.readDarwinProcessTable(async () => result(`11 0 4 ${row.input}`)),
      row.expected,
      row.input,
    );
});
test("frozen Darwin fields matrix keeps nine row-length and numeric boundaries", async () => {
  assert.equal(matrix.darwinFields.length, 9);
  for (const row of matrix.darwinFields)
    assert.deepEqual(
      await darwin.readDarwinProcessTable(async () => result(row.input)),
      row.expected,
      row.input,
    );
});
test("frozen Windows matrix separates low-level requested numbers from factory PID policy", async () => {
  assert.equal(matrix.windows.length, 9);
  for (const row of matrix.windows)
    assert.deepEqual(
      await windows.readWindowsProcessMemory(async () => result(row.input), row.pids),
      row.expected,
      row.input,
    );
});
test("frozen Linux stat matrix preserves finite counters and exact identifier rules", async () => {
  assert.equal(matrix.linuxStat.length, 9);
  for (const row of matrix.linuxStat) {
    const w = world({ ...proc(11), "/proc/11/stat": stat(11, ...row.values) }, ["11"]);
    assert.deepEqual(
      rows(await linux.sampleLinuxProcessTrees(readers(w), [11])),
      row.expected,
      String(row.values),
    );
  }
});
test("frozen Linux RSS matrix preserves units and whole-line validation", async () => {
  assert.equal(matrix.linuxRss.length, 8);
  for (const row of matrix.linuxRss) {
    const w = world({ ...proc(11), "/proc/11/status": row.input }, ["11"]);
    assert.deepEqual(
      rows(await linux.sampleLinuxProcessTrees(readers(w), [11])),
      row.expected,
      row.input,
    );
  }
});
