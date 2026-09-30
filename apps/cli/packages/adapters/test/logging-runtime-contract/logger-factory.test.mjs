// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mock, test } from "node:test";
import { fixture, records, spyLogger, subject } from "./subject.mjs";

const api = await subject("index");
const LEVEL = { Debug: 0, Info: 1, Warn: 2, Error: 3 };
const identityRedactor = { redact: (value) => value };

function stream() {
  const chunks = [];
  const port = {
    write(value) {
      assert.equal(this, port);
      chunks.push(value);
      return true;
    },
  };
  return { chunks, port };
}

function logger(root, options = {}) {
  return new api.NodeFileLogger({
    category: "owned",
    getMinLevel: () => LEVEL.Debug,
    logDir: root,
    redactor: identityRedactor,
    ...options,
  });
}

test("factory directory priority includes explicitly empty strings", () => {
  assert.equal(
    api
      .createNodeLoggerFactory({ logDir: "explicit", env: { KNORVIA_LOG_DIR: "env" } })
      .getLogDir(),
    "explicit",
  );
  assert.equal(
    api.createNodeLoggerFactory({ logDir: "", env: { KNORVIA_LOG_DIR: "env" } }).getLogDir(),
    "",
  );
  assert.equal(api.createNodeLoggerFactory({ env: { KNORVIA_LOG_DIR: "env" } }).getLogDir(), "env");
  assert.equal(api.createNodeLoggerFactory({ env: { KNORVIA_LOG_DIR: "" } }).getLogDir(), "");
  assert.equal(api.createNodeLoggerFactory({ env: {} }).getLogDir(), api.getDefaultLogDir());
});

test("explicit runtime environments and minimum-level override retain debug policy", async (context) => {
  const root = await fixture(context);
  for (const [env, expected] of [
    ["development", true],
    ["production", false],
    ["test", false],
  ]) {
    const dir = join(root, env);
    const f = api.createNodeLoggerFactory({ logDir: dir, env: { KNORVIA_RUNTIME_ENV: env } });
    f.createLogger("policy").debug("debug");
    if (expected) assert.equal((await records(dir))[0].message, "debug");
    else await assert.rejects(readdir(dir), { code: "ENOENT" });
  }
  const dir = join(root, "override");
  api
    .createNodeLoggerFactory({
      logDir: dir,
      env: { KNORVIA_RUNTIME_ENV: "production" },
      minLevel: LEVEL.Debug,
    })
    .createLogger("policy")
    .debug("debug");
  assert.equal((await records(dir)).length, 1);
});

test("explicit console stream overrides environment and false plus env=1 keeps stderr", async (context) => {
  const root = await fixture(context);
  const { port, chunks } = stream();
  const captured = [];
  mock.method(process.stderr, "write", (value) => {
    captured.push(value);
    return true;
  });
  context.after(() => mock.restoreAll());
  api
    .createNodeLoggerFactory({
      logDir: root,
      console: { stream: port },
      env: { KNORVIA_LOG_CONSOLE: "1" },
    })
    .createLogger("a")
    .info("stream");
  api
    .createNodeLoggerFactory({ logDir: root, console: false, env: { KNORVIA_LOG_CONSOLE: "1" } })
    .createLogger("b")
    .info("stderr");
  assert.equal(chunks.length, 1);
  assert.equal(captured.length, 1);
  assert.match(captured[0], /stderr/);
});

test("withContext uses root category and factory schedules only once", async (context) => {
  const root = await fixture(context);
  const f = api.createNodeLoggerFactory({ logDir: root });
  f.withContext({ sessionId: "owned" }).info("root");
  assert.equal((await records(root))[0].module, "root");
  const { logger: retentionLogger, calls } = spyLogger();
  let timers = 0;
  const timer = {};
  assert.equal(
    f.scheduleLogRetentionCleanup({
      logger: retentionLogger,
      setTimeout() {
        timers++;
        return timer;
      },
    }),
    timer,
  );
  assert.equal(
    f.scheduleLogRetentionCleanup({
      setTimeout() {
        timers++;
        return {};
      },
    }),
    undefined,
  );
  assert.equal(timers, 1);
  assert.equal(calls[0].context.logDir, root);
});

test("factory consumes one scheduling admission even when timer registration fails", async (context) => {
  const root = await fixture(context);
  const f = api.createNodeLoggerFactory({ logDir: root });
  const failure = new Error("owned timer");
  assert.throws(
    () =>
      f.scheduleLogRetentionCleanup({
        setTimeout() {
          throw failure;
        },
      }),
    (e) => e === failure,
  );
  assert.equal(
    f.scheduleLogRetentionCleanup({
      setTimeout() {
        throw new Error("unexpected retry");
      },
    }),
    undefined,
  );
});

test("existing JSONL and unrelated bytes survive repeated upgrade-format appends", async (context) => {
  const root = await fixture(context);
  const name = `knorvia-${api.formatLocalLogDate(new Date())}.jsonl`;
  const prefix =
    '{"timestamp":"2026-09-30T00:00:00.000Z","level":"info","module":"old","message":"existing","sessionId":"owned"}\n';
  const path = join(root, name);
  await writeFile(path, prefix);
  const sentinel = join(root, "credentials.json");
  await writeFile(sentinel, '{"sentinel":"fixture-only"}\n');
  for (const message of ["upgrade", "resume", "rollback-reader"])
    logger(root).info(message, { sessionId: "owned" });
  const text = await readFile(path, "utf8");
  assert.equal(text.startsWith(prefix), true);
  const rows = text
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    rows.map((r) => r.message),
    ["existing", "upgrade", "resume", "rollback-reader"],
  );
  assert.equal(
    rows.every(
      (r) =>
        typeof r.timestamp === "string" && typeof r.level === "string" && r.sessionId === "owned",
    ),
    true,
  );
  assert.equal(await readFile(sentinel, "utf8"), '{"sentinel":"fixture-only"}\n');
});

test("explicit empty env does not inherit process runtime level", async (context) => {
  const root = await fixture(context);
  const before = process.env.KNORVIA_RUNTIME_ENV;
  context.after(() => {
    if (before === undefined) delete process.env.KNORVIA_RUNTIME_ENV;
    else process.env.KNORVIA_RUNTIME_ENV = before;
  });
  process.env.KNORVIA_RUNTIME_ENV = "development";
  const inherited = join(root, "inherited");
  api.createNodeLoggerFactory({ logDir: inherited }).createLogger("policy").debug("accepted");
  assert.equal((await records(inherited)).length, 1);
  const isolated = join(root, "isolated");
  api
    .createNodeLoggerFactory({ logDir: isolated, env: {} })
    .createLogger("policy")
    .debug("filtered");
  await assert.rejects(readdir(isolated), { code: "ENOENT" });
});

test("CLI TypeScript entrypoint fallback is suppressed by explicit production/test", async (context) => {
  const root = await fixture(context);
  const before = process.argv[1];
  context.after(() => {
    process.argv[1] = before;
  });
  process.argv[1] = join(root, "packages", "cli", "src", "main.ts");
  const detected = join(root, "detected");
  api
    .createNodeLoggerFactory({ logDir: detected, env: {} })
    .createLogger("policy")
    .debug("accepted");
  assert.equal((await records(detected)).length, 1);
  const production = join(root, "production");
  api
    .createNodeLoggerFactory({ logDir: production, env: { KNORVIA_RUNTIME_ENV: "production" } })
    .createLogger("policy")
    .debug("filtered");
  await assert.rejects(readdir(production), { code: "ENOENT" });
});
