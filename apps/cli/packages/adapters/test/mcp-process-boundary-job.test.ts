// Copyright (c) 2026 Knorvia Studio contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./mcp-process-boundary.fixture.js";

test("job attach guards platform and PID before reading API or importing native dependencies", async () => {
  const h = await fixture();
  assert.deepEqual(Object.keys(h.job), ["attachProcessToWindowsJobObject"]);
  assert.equal(h.job.attachProcessToWindowsJobObject.length, 1);
  let reads = 0;
  for (const [platform, pid] of [
    ["linux", 42],
    ["win32", 0],
    ["win32", -1],
    ["win32", 1.5],
    ["win32", NaN],
  ] as const) {
    const options = {
      platform,
      get api() {
        reads++;
        return h.api;
      },
    };
    assert.equal(await h.job.attachProcessToWindowsJobObject(pid, options), undefined);
  }
  assert.equal(reads, 0);
  assert.equal(h.count("native.import"), 0);
  assert.equal(h.count("job.create"), 0);
});

test("controller preserves API receivers and handle reference; detached terminate repeats until close", async () => {
  const h = await fixture();
  const controller = await h.job.attachProcessToWindowsJobObject(42, {
    platform: "win32",
    api: h.api,
  });
  assert.ok(controller);
  assert.deepEqual(Object.keys(controller), ["terminate", "close"]);
  assert.equal(Object.getPrototypeOf(controller), Object.prototype);
  const terminate = controller.terminate;
  const close = controller.close;
  terminate();
  terminate();
  close();
  close();
  terminate();
  assert.deepEqual(h.names(), [
    "job.create",
    "job.assign",
    "job.terminate",
    "job.terminate",
    "job.close",
  ]);
  assert.deepEqual(h.events("job.assign"), [[h.handle, 42]]);
  assert.deepEqual(h.events("job.close"), [[h.handle]]);
  assert.equal(h.count("native.import"), 0);
});

test("create and assignment failures return undefined with only the handle already owned cleaned", async () => {
  for (const phase of ["create-empty", "create-throw", "assign-false", "assign-throw"] as const) {
    const h = await fixture();
    if (phase === "create-empty") h.api.create = () => undefined;
    if (phase === "create-throw")
      h.api.create = () => {
        throw new Error("create");
      };
    if (phase === "assign-false") h.api.assign = () => false;
    if (phase === "assign-throw")
      h.api.assign = () => {
        throw new Error("assign");
      };
    assert.equal(
      await h.job.attachProcessToWindowsJobObject(42, { platform: "win32", api: h.api }),
      undefined,
    );
    assert.equal(h.count("job.close"), phase.startsWith("assign") ? 1 : 0);
  }
});

test("failed assignment close gets one catch cleanup retry while controller close consumes ownership before throwing", async () => {
  const h = await fixture();
  h.api.assign = () => false;
  let attempts = 0;
  h.api.close = function (job) {
    assert.equal(this, h.api);
    assert.equal(job, h.handle);
    attempts++;
    throw new Error("close");
  };
  assert.equal(
    await h.job.attachProcessToWindowsJobObject(42, { platform: "win32", api: h.api }),
    undefined,
  );
  assert.equal(attempts, 2);
  const other = await fixture();
  const marker = new Error("controller close");
  let closes = 0;
  other.api.close = function () {
    assert.equal(this, other.api);
    closes++;
    throw marker;
  };
  const controller = await other.job.attachProcessToWindowsJobObject(42, {
    platform: "win32",
    api: other.api,
  });
  assert.ok(controller);
  assert.throws(
    () => controller.close(),
    (error) => error === marker,
  );
  controller.close();
  controller.terminate();
  assert.equal(closes, 1);
  assert.equal(other.count("job.terminate"), 0);
});

test("terminate errors remain visible without marking a controller closed", async () => {
  const h = await fixture();
  const marker = new Error("terminate");
  let attempts = 0;
  h.api.terminate = function () {
    assert.equal(this, h.api);
    attempts++;
    throw marker;
  };
  const controller = await h.job.attachProcessToWindowsJobObject(42, {
    platform: "win32",
    api: h.api,
  });
  assert.ok(controller);
  assert.throws(
    () => controller.terminate(),
    (error) => error === marker,
  );
  assert.throws(
    () => controller.terminate(),
    (error) => error === marker,
  );
  controller.close();
  controller.terminate();
  assert.equal(attempts, 2);
  assert.equal(h.count("job.close"), 1);
});

test("same PID attachments retain independent controller ownership without PID caching", async () => {
  const h = await fixture();
  let sequence = 0;
  h.api.create = function () {
    assert.equal(this, h.api);
    return { sequence: ++sequence };
  };
  const a = await h.job.attachProcessToWindowsJobObject(42, { platform: "win32", api: h.api });
  const b = await h.job.attachProcessToWindowsJobObject(42, { platform: "win32", api: h.api });
  assert.ok(a);
  assert.ok(b);
  assert.notEqual(a, b);
  a.close();
  b.terminate();
  b.close();
  assert.equal(sequence, 2);
  assert.deepEqual(h.events("job.assign"), [
    [{ sequence: 1 }, 42],
    [{ sequence: 2 }, 42],
  ]);
  assert.deepEqual(h.events("job.close"), [[{ sequence: 1 }], [{ sequence: 2 }]]);
});
