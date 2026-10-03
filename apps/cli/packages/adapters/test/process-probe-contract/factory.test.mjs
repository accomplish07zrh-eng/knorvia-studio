// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { target } from "./subject.mjs";
import { deferred, flush, proc, readers, result, rows, world } from "./fixture.mjs";
const loaded = await target();
after(() => loaded.dispose());
const { createProcessProbe } = loaded.subject.factory;
const csv = '"controlled","42","C","1","1 K"\n"controlled","43","C","1","2 K"';

test("factory invalid trees/group and Windows group cause no I/O or deadline", async () => {
  const w = world();
  loaded.use(w);
  for (const platform of ["linux", "darwin", "win32"]) {
    const p = createProcessProbe({
      platform,
      execFile: async () => {
        throw new Error("Unexpected executor");
      },
      ...readers(w),
    });
    assert.deepEqual(rows(await p.sampleProcessTrees([0, -1, NaN, 1.5])), []);
    assert.equal(await p.sampleProcessGroup(0), undefined);
    if (platform === "win32") assert.equal(await p.sampleProcessGroup(11), undefined);
  }
  assert.deepEqual(w.trace, []);
  assert.deepEqual(w.timers, []);
});
test("factory platform scopes and direct-process output order remain fixed", async () => {
  const w = world();
  loaded.use(w);
  const p = createProcessProbe({ platform: "win32", execFile: async () => result(csv) });
  assert.equal(p.treeScope, "direct_process");
  assert.deepEqual(rows(await p.sampleProcessTrees([43, 42])), [
    [42, [{ pid: 42, rssKb: 1 }]],
    [43, [{ pid: 43, rssKb: 2 }]],
  ]);
  assert.equal(createProcessProbe({ platform: "linux" }).treeScope, "process_tree");
  assert.equal(createProcessProbe({ platform: "darwin" }).treeScope, "process_tree");
  assert.equal(w.timers.length, 1);
  assert.equal(w.timers[0].delay, 1000);
  assert.equal(w.timers[0].unrefCount, 1);
  assert.equal(w.timers[0].cleared, true);
});
test("three consecutive failures disable only that probe until reset", async () => {
  const w = world();
  loaded.use(w);
  let calls = 0;
  const reasons = [];
  const p = createProcessProbe({
    platform: "darwin",
    execFile: async () => {
      calls++;
      return result("", { status: 1 });
    },
    onSampleFailed: (reason) => reasons.push(reason),
  });
  for (let i = 0; i < 5; i++) assert.equal(await p.sampleProcessTrees([11]), undefined);
  assert.equal(calls, 3);
  assert.deepEqual(reasons, ["ps 采样失败: 1", "ps 采样失败: 1", "ps 采样失败: 1"]);
  p.reset();
  assert.equal(await p.sampleProcessTrees([11]), undefined);
  assert.equal(calls, 4);
});
test("successful empty results reset the failure budget", async () => {
  const w = world();
  loaded.use(w);
  let calls = 0;
  const p = createProcessProbe({
    platform: "darwin",
    execFile: async () => {
      calls++;
      return result("", { status: calls === 3 ? 0 : 1 });
    },
  });
  for (let i = 0; i < 6; i++) await p.sampleProcessTrees([11]);
  assert.equal(calls, 6);
  assert.equal(await p.sampleProcessTrees([11]), undefined);
  assert.equal(calls, 6);
});
test("tree and group share the instance budget; other instances remain independent", async () => {
  const w = world();
  loaded.use(w);
  let calls = 0;
  const execFile = async () => {
    calls++;
    return result("", { status: 1 });
  };
  const p = createProcessProbe({ platform: "darwin", execFile });
  const other = createProcessProbe({ platform: "darwin", execFile });
  await p.sampleProcessTrees([11]);
  await p.sampleProcessGroup(11);
  await p.sampleProcessTrees([11]);
  await p.sampleProcessGroup(11);
  assert.equal(calls, 3);
  await other.sampleProcessGroup(11);
  assert.equal(calls, 4);
});
test("diagnostic callback throws are isolated; failure reasons stringify non-Errors", async () => {
  const w = world();
  loaded.use(w);
  const reasons = [];
  const p = createProcessProbe({
    platform: "darwin",
    execFile: async () => {
      throw "Controlled thrown string";
    },
    onSampleFailed(reason) {
      reasons.push(reason);
      throw new Error("Controlled observer failure");
    },
  });
  assert.equal(await p.sampleProcessTrees([11]), undefined);
  assert.deepEqual(reasons, ["Controlled thrown string"]);
});
test("timeout settles once with original deadline reason and ignores late success", async () => {
  const w = world();
  loaded.use(w);
  const gate = deferred();
  const reasons = [];
  const p = createProcessProbe({
    platform: "darwin",
    execFile: () => gate.promise,
    onSampleFailed: (reason) => reasons.push(reason),
  });
  const pending = p.sampleProcessTrees([11]);
  await flush();
  w.clock.expire();
  assert.equal(await pending, undefined);
  assert.deepEqual(reasons, ["采样超过 1000 毫秒"]);
  gate.resolve(result("11 0 2 0:02"));
  await flush();
  assert.deepEqual(reasons, ["采样超过 1000 毫秒"]);
  assert.equal(w.timers[0].cleared, true);
});
test("timeout preserves an accepted Linux batch but stops before status reads", async () => {
  const w = world(proc(11), ["11"]);
  loaded.use(w);
  const gate = deferred();
  const reasons = [];
  let reads = 0;
  const p = createProcessProbe({
    platform: "linux",
    listProcDirectory: () => gate.promise,
    readProcFile: async () => {
      reads++;
      return "";
    },
    onSampleFailed: (reason) => reasons.push(reason),
  });
  const pending = p.sampleProcessTrees([11]);
  await flush();
  w.clock.expire();
  assert.equal(await pending, undefined);
  gate.resolve(["11"]);
  await flush();
  assert.equal(reads, 1);
  assert.deepEqual(reasons, ["采样超过 1000 毫秒"]);
});
test("concurrent samples are separate rather than queued or single-flight", async () => {
  const w = world();
  loaded.use(w);
  const gates = [deferred(), deferred()];
  let calls = 0;
  const p = createProcessProbe({ platform: "darwin", execFile: () => gates[calls++].promise });
  const first = p.sampleProcessTrees([11]);
  const second = p.sampleProcessGroup(11);
  await flush();
  assert.equal(calls, 2);
  assert.equal(w.timers.length, 2);
  gates[1].resolve(result("12 3 0:01"));
  assert.deepEqual(await second, [{ pid: 12, rssKb: 3, cpuTimeMs: 1000 }]);
  gates[0].resolve(result("11 0 2 0:02"));
  assert.deepEqual(rows(await first), [[11, [{ pid: 11, rssKb: 2, cpuTimeMs: 2000 }]]]);
});
test("reset does not cancel an already accepted sample or replace its deadline", async () => {
  const w = world();
  loaded.use(w);
  const gate = deferred();
  const p = createProcessProbe({ platform: "darwin", execFile: () => gate.promise });
  const pending = p.sampleProcessTrees([11]);
  await flush();
  p.reset();
  assert.equal(w.timers.length, 1);
  assert.equal(w.timers[0].cleared, false);
  gate.resolve(result("11 0 2 0:01"));
  assert.deepEqual(rows(await pending), [[11, [{ pid: 11, rssKb: 2, cpuTimeMs: 1000 }]]]);
});
test("default Linux readers and default Darwin executor are sealed before invocation", async () => {
  const w = world(proc(11), ["11"]);
  loaded.use(w);
  assert.deepEqual(rows(await createProcessProbe({ platform: "linux" }).sampleProcessTrees([11])), [
    [11, [{ pid: 11, rssKb: 12, cpuTimeMs: 50 }]],
  ]);
  await createProcessProbe({ platform: "darwin" }).sampleProcessTrees([11]);
  assert.equal(w.trace.filter((x) => x[0] === "exec").length, 1);
  assert.equal(w.trace.at(-1)[1], "ps");
});
test("unknown platform fallback uses ps for tree/group and ignores Linux-specific options", async () => {
  const w = world(proc(11), ["11"]);
  loaded.use(w);
  let injectedReads = 0;
  const p = createProcessProbe({
    platform: "freebsd",
    listProcDirectory: async () => {
      injectedReads++;
      return [];
    },
    readProcFile: async () => {
      injectedReads++;
      return "";
    },
  });
  assert.equal(p.treeScope, "process_tree");
  assert.deepEqual(rows(await p.sampleProcessTrees([11])), []);
  assert.equal(injectedReads, 0);
  await p.sampleProcessGroup(11);
  assert.equal(w.trace.at(-1)[0], "exec");
  assert.equal(w.trace.at(-1)[1], "ps");
  assert.deepEqual(
    w.trace.filter((x) => x[0] === "exec").map((x) => x[2]),
    [
      ["-eo", "pid=,ppid=,rss=,cputime="],
      ["-o", "pid=,rss=,cputime=", "-g", "11"],
    ],
  );
});
