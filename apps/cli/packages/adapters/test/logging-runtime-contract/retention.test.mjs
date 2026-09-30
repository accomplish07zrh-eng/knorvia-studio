// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import * as filesystem from "node:fs/promises";
import { join } from "node:path";
import { mock, test } from "node:test";
import { fixture, spyLogger, subject } from "./subject.mjs";

let seam;
mock.module("node:fs/promises", {
  namedExports: {
    ...filesystem,
    readdir: (...args) => (seam?.readdir ? seam.readdir(...args) : filesystem.readdir(...args)),
    unlink: (...args) => (seam?.unlink ? seam.unlink(...args) : filesystem.unlink(...args)),
  },
});
const api = await subject("retention");
const NOW = new Date(2026, 8, 30, 12);
const regularFile = (name) => ({ name, isFile: () => true });

function controlled(context, state) {
  seam = state;
  context.after(() => {
    seam = undefined;
  });
}

test("retention public constants and local date formatting stay stable", () => {
  assert.equal(api.LOG_RETENTION_DAYS, 7);
  assert.equal(api.LOG_CLEANUP_STARTUP_DELAY_MS, 60_000);
  assert.equal(api.formatLocalLogDate(new Date(2026, 0, 2, 23)), "2026-01-02");
});

test("real directory keeps cutoff/future/invalid names and unrelated data", async (context) => {
  const root = await fixture(context);
  const names = [
    "knorvia-2026-09-23.jsonl",
    "knorvia-2026-09-24.jsonl",
    "knorvia-2026-10-01.jsonl",
    "knorvia-2026-02-30.jsonl",
    "knorvia-2026-09-01.json",
    "credentials.json",
  ];
  for (const name of names) await filesystem.writeFile(join(root, name), name);
  await filesystem.mkdir(join(root, "knorvia-2026-09-01.jsonl"));
  const { logger, calls } = spyLogger();
  const result = await api.cleanupLogRetention({ logDir: root, now: NOW, logger });
  assert.deepEqual(result, {
    cutoffDate: "2026-09-24",
    deletedFiles: [names[0]],
    failedFiles: [],
    retentionDays: 7,
    scannedFiles: 3,
    status: "completed",
  });
  assert.equal((await filesystem.readdir(root)).length, names.length);
  for (const name of names.slice(1))
    assert.equal(await filesystem.readFile(join(root, name), "utf8"), name);
  assert.equal(calls[0].context.event, "log.retention.cleanup.completed");
  assert.equal(calls[0].context.deletedFileCount, 1);
});

test("symlink is preserved without touching its target", async (context) => {
  const root = await fixture(context);
  const target = join(root, "unrelated.txt");
  await filesystem.writeFile(target, "owned sentinel");
  await filesystem.symlink(target, join(root, "knorvia-2026-01-01.jsonl"), "file");
  const result = await api.cleanupLogRetention({ logDir: root, now: NOW });
  assert.equal(result.scannedFiles, 0);
  assert.equal(await filesystem.readFile(target, "utf8"), "owned sentinel");
  assert.equal(
    (await filesystem.lstat(join(root, "knorvia-2026-01-01.jsonl"))).isSymbolicLink(),
    true,
  );
});

test("missing directory completes silently and does not create it", async (context) => {
  const root = join(await fixture(context), "absent");
  const { logger, calls } = spyLogger();
  const result = await api.cleanupLogRetention({ logDir: root, now: NOW, logger });
  assert.equal(result.status, "completed");
  assert.equal(calls.length, 0);
  await assert.rejects(filesystem.stat(root), { code: "ENOENT" });
});

test("retention normalization and calendar rollover use local days", async (context) => {
  controlled(context, { readdir: async () => [] });
  for (const [input, days] of [
    [undefined, 7],
    [NaN, 7],
    [Infinity, 7],
    [0, 1],
    [-2, 1],
    [2.9, 2],
  ]) {
    const r = await api.cleanupLogRetention({
      logDir: "owned",
      now: new Date(2026, 0, 1),
      retentionDays: input,
    });
    assert.equal(r.retentionDays, days);
    assert.equal(
      r.cutoffDate,
      days === 7 ? "2025-12-26" : days === 2 ? "2025-12-31" : "2026-01-01",
    );
  }
});

test("invalid calendar dates and years remapped by Date are excluded", async (context) => {
  controlled(context, {
    readdir: async () =>
      [
        "knorvia-2024-02-29.jsonl",
        "knorvia-2025-02-29.jsonl",
        "knorvia-2026-00-01.jsonl",
        "knorvia-2026-13-01.jsonl",
        "knorvia-0099-01-01.jsonl",
        "KNORVIA-2026-01-01.jsonl",
      ].map(regularFile),
    unlink: async () => {},
  });
  const r = await api.cleanupLogRetention({ logDir: "owned", now: NOW });
  assert.equal(r.scannedFiles, 1);
  assert.deepEqual(r.deletedFiles, ["knorvia-2024-02-29.jsonl"]);
});

test("directory failure reports original error summary and never unlinks", async (context) => {
  const error = Object.assign(new Error("owned denied"), { code: "EACCES" });
  controlled(context, {
    readdir: async () => {
      throw error;
    },
    unlink: () => {
      throw new Error("unexpected unlink");
    },
  });
  const { logger, calls } = spyLogger();
  const r = await api.cleanupLogRetention({ logDir: "owned", now: NOW, logger });
  assert.equal(r.status, "failed");
  assert.equal(r.scannedFiles, 0);
  assert.deepEqual(calls[0].context.error, {
    code: "EACCES",
    message: "owned denied",
    name: "Error",
  });
  assert.equal(calls[0].context.event, "log.retention.cleanup.failed");
});

test("plain object ENOENT remains a failure rather than Error/ENOENT", async (context) => {
  controlled(context, {
    readdir: async () => {
      throw { code: "ENOENT" };
    },
  });
  const { logger, calls } = spyLogger();
  const r = await api.cleanupLogRetention({ logDir: "owned", now: NOW, logger });
  assert.equal(r.status, "failed");
  assert.equal(calls[0].context.error.name, "UnknownError");
});

test("unlink is serial, preserves enumeration order and continues after failures", async (context) => {
  const visited = [];
  let active = false;
  controlled(context, {
    readdir: async () => ["03", "01", "02"].map((d) => regularFile(`knorvia-2026-09-${d}.jsonl`)),
    unlink: async (path) => {
      assert.equal(active, false);
      active = true;
      visited.push(path);
      await Promise.resolve();
      active = false;
      if (path.endsWith("01.jsonl"))
        throw Object.assign(new Error("owned fail"), { code: "EACCES" });
      if (path.endsWith("02.jsonl"))
        throw Object.assign(new Error("owned gone"), { code: "ENOENT" });
    },
  });
  const { logger, calls } = spyLogger();
  const r = await api.cleanupLogRetention({ logDir: "owned", now: NOW, logger });
  assert.equal(visited.length, 3);
  assert.deepEqual(r.deletedFiles, ["knorvia-2026-09-03.jsonl"]);
  assert.deepEqual(r.failedFiles, ["knorvia-2026-09-01.jsonl"]);
  assert.equal(r.status, "failed");
  assert.equal(r.scannedFiles, 3);
  assert.deepEqual(
    calls.map((c) => c.context.event),
    ["log.retention.delete.failed", "log.retention.cleanup.completed"],
  );
});

test("warning failure propagates and prevents further unlink calls", async (context) => {
  const failure = new Error("owned logger");
  let count = 0;
  controlled(context, {
    readdir: async () => [
      regularFile("knorvia-2026-09-01.jsonl"),
      regularFile("knorvia-2026-09-02.jsonl"),
    ],
    unlink: async () => {
      count++;
      throw new Error("owned unlink");
    },
  });
  await assert.rejects(
    api.cleanupLogRetention({
      logDir: "owned",
      now: NOW,
      logger: {
        warn() {
          throw failure;
        },
      },
    }),
    (e) => e === failure,
  );
  assert.equal(count, 1);
});

test("completion logger failure propagates after already completed deletion", async (context) => {
  const failure = new Error("owned logger");
  let deleted = false;
  controlled(context, {
    readdir: async () => [regularFile("knorvia-2026-09-01.jsonl")],
    unlink: async () => {
      deleted = true;
    },
  });
  await assert.rejects(
    api.cleanupLogRetention({
      logDir: "owned",
      now: NOW,
      logger: {
        debug() {
          throw failure;
        },
      },
    }),
    (e) => e === failure,
  );
  assert.equal(deleted, true);
});

test("scheduler records first, preserves timer identity and optional unref receiver", () => {
  const { calls, logger } = spyLogger();
  let callback;
  let unrefs = 0;
  const timer = {
    unref() {
      assert.equal(this, timer);
      unrefs++;
    },
  };
  const result = api.scheduleLogRetentionCleanup({
    logDir: "owned",
    logger,
    retentionDays: 2.9,
    setTimeout(fn, ms) {
      assert.equal(calls.length, 1);
      assert.equal(ms, 60_000);
      callback = fn;
      return timer;
    },
  });
  assert.equal(result, timer);
  assert.equal(typeof callback, "function");
  assert.equal(unrefs, 1);
  assert.equal(calls[0].context.retentionDays, 2);
  assert.equal(calls[0].context.status, "waiting");
});

test("scheduled time is read at callback execution and zero delay is kept", async (context) => {
  let callback;
  let nowCalls = 0;
  let complete;
  const finished = new Promise((resolve) => {
    complete = resolve;
  });
  controlled(context, { readdir: async () => [] });
  const { logger, calls } = spyLogger();
  const originalDebug = logger.debug;
  logger.debug = function (...args) {
    originalDebug.apply(this, args);
    complete();
  };
  api.scheduleLogRetentionCleanup({
    logDir: "owned",
    logger,
    delayMs: 0,
    now() {
      nowCalls++;
      return NOW;
    },
    setTimeout(fn, ms) {
      assert.equal(ms, 0);
      callback = fn;
      return {};
    },
  });
  assert.equal(nowCalls, 0);
  callback();
  await finished;
  assert.equal(nowCalls, 1);
  assert.equal(calls[1].context.cutoffDate, "2026-09-24");
});

test("scheduler info failure prevents timer registration", () => {
  const failure = new Error("owned schedule log");
  assert.throws(
    () =>
      api.scheduleLogRetentionCleanup({
        logDir: "owned",
        logger: {
          info() {
            throw failure;
          },
        },
        setTimeout() {
          throw new Error("unexpected timer");
        },
      }),
    (e) => e === failure,
  );
});
