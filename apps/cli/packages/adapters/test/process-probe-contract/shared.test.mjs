// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { target } from "./subject.mjs";
import { result, rows, world } from "./fixture.mjs";
const loaded = await target();
after(() => loaded.dispose());
const { shared } = loaded.subject;

test("public value exports and deadline remain exact", () => {
  assert.deepEqual(
    Object.keys(shared).sort(),
    [
      "PROCESS_PROBE_SAMPLE_TIMEOUT_MS",
      "ProcessProbeFailure",
      "collectProcessTreePids",
      "defaultProbeExecFile",
      "groupProcessTrees",
      "isSamplablePid",
      "runProbeCommand",
      "toSample",
    ].sort(),
  );
  assert.equal(shared.PROCESS_PROBE_SAMPLE_TIMEOUT_MS, 1000);
  const error = new shared.ProcessProbeFailure("controlled failure");
  assert.ok(error instanceof Error);
  assert.equal(error.name, "Error");
  assert.equal(error.message, "controlled failure");
});
test("positive integer PID contract does not silently become safe-integer validation", () => {
  for (const pid of [1, 27, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(shared.isSamplablePid(pid), true);
  for (const pid of [0, -1, 1.5, NaN, Infinity, "12", undefined])
    assert.equal(shared.isSamplablePid(pid), false);
});
test("sample projection creates fresh data and omits undefined CPU", () => {
  const row = { pid: 11, rssKb: 3, parentPid: 2, processGroupId: 1, cpuTimeMs: undefined };
  const sample = shared.toSample(row);
  assert.deepEqual(sample, { pid: 11, rssKb: 3 });
  assert.deepEqual(Object.keys(sample), ["pid", "rssKb"]);
  assert.deepEqual(shared.toSample({ ...row, cpuTimeMs: 0 }), { pid: 11, rssKb: 3, cpuTimeMs: 0 });
  sample.rssKb = 9;
  assert.equal(row.rssKb, 3);
});
test("trees retain requested-root order and depth-first child input order", () => {
  const table = [
    { pid: 11, parentPid: 0, rssKb: 1 },
    { pid: 12, parentPid: 11, rssKb: 2 },
    { pid: 13, parentPid: 11, rssKb: 3 },
    { pid: 14, parentPid: 12, rssKb: 4 },
  ];
  assert.deepEqual(rows(shared.collectProcessTreePids(table, [13, 11, 99, 11])), [
    [13, [13]],
    [11, [11, 12, 14, 13]],
  ]);
  assert.deepEqual(rows(shared.groupProcessTrees(table, [11])), [
    [
      11,
      [
        { pid: 11, rssKb: 1 },
        { pid: 12, rssKb: 2 },
        { pid: 14, rssKb: 4 },
        { pid: 13, rssKb: 3 },
      ],
    ],
  ]);
});
test("duplicate relations keep original edges while latest row provides sample; cycles terminate per root", () => {
  const table = [
    { pid: 11, parentPid: 12, rssKb: 1 },
    { pid: 12, parentPid: 11, rssKb: 2 },
    { pid: 12, parentPid: 99, rssKb: 22 },
    { pid: 13, parentPid: 11, rssKb: 3 },
  ];
  assert.deepEqual(rows(shared.groupProcessTrees(table, [11, 12])), [
    [
      11,
      [
        { pid: 11, rssKb: 1 },
        { pid: 12, rssKb: 22 },
        { pid: 13, rssKb: 3 },
      ],
    ],
    [
      12,
      [
        { pid: 12, rssKb: 22 },
        { pid: 11, rssKb: 1 },
        { pid: 13, rssKb: 3 },
      ],
    ],
  ]);
});
test("group helpers preserve numeric identifiers without the platform PID filter", () => {
  const table = [
    { pid: 1, rssKb: 1 },
    { pid: 0, parentPid: 1, rssKb: 0 },
    { pid: 1.5, parentPid: 1, rssKb: 4 },
  ];
  assert.deepEqual(rows(shared.groupProcessTrees(table, [1, 0, 1.5])), [
    [
      1,
      [
        { pid: 1, rssKb: 1 },
        { pid: 0, rssKb: 0 },
        { pid: 1.5, rssKb: 4 },
      ],
    ],
    [0, [{ pid: 0, rssKb: 0 }]],
    [1.5, [{ pid: 1.5, rssKb: 4 }]],
  ]);
});
test("command success preserves stdout, exact argument identity and overridable options", async () => {
  const args = ["controlled"];
  let seen;
  const executor = async function (...value) {
    assert.equal(this, undefined);
    seen = value;
    return result(" raw\n");
  };
  assert.equal(await shared.runProbeCommand(executor, "ps", args), " raw\n");
  assert.equal(seen[1], args);
  assert.deepEqual(seen[2], { encoding: "utf8", maxBuffer: 8388608, timeout: 1000 });
  await shared.runProbeCommand(executor, "tasklist", args, { timeout: 7, windowsHide: true });
  assert.deepEqual(seen[2], {
    encoding: "utf8",
    maxBuffer: 8388608,
    timeout: 7,
    windowsHide: true,
  });
});
test("nonzero, null and explicit errors preserve command failure diagnostics", async () => {
  for (const [data, message] of [
    [result("", { status: null }), "ps 采样失败: null"],
    [result("", { error: new Error("controlled") }), "ps 采样失败: 0"],
    [result("", { status: 1, stderr: "  controlled reason\n" }), "ps 采样失败: controlled reason"],
  ])
    await assert.rejects(
      shared.runProbeCommand(async () => data, "ps", []),
      (error) => error instanceof shared.ProcessProbeFailure && error.message === message,
    );
});
test("executor rejection keeps the original error identity", async () => {
  const original = new Error("Controlled native rejection");
  await assert.rejects(
    shared.runProbeCommand(
      async () => {
        throw original;
      },
      "ps",
      [],
    ),
    (error) => error === original,
  );
});
test("default execFile adapter is sealed and preserves success/failed callback output", async () => {
  const w = world();
  loaded.use(w);
  assert.deepEqual(
    await shared.defaultProbeExecFile("ps", ["controlled"], { encoding: "utf8" }),
    result(),
  );
  assert.deepEqual(w.trace, [["exec", "ps", ["controlled"], { encoding: "utf8" }]]);
  const error = Object.assign(new Error("Controlled callback error"), { code: 7 });
  w.nativeExec = (_file, _args, _options, callback) => callback(error, "partial", "detail");
  const value = await shared.defaultProbeExecFile("ps", [], { encoding: "utf8" });
  assert.equal(value.error, error);
  assert.equal(value.status, 7);
  assert.equal(value.stdout, "partial");
  assert.equal(value.stderr, "detail");
});
